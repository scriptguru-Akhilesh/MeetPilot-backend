import { Router, Request, Response } from "express";
import Meeting from "../models/Meeting";
import { generateMomForRecallBot } from "../services/momAutomationService";

const router = Router();

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const totalSeconds = Math.round(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  parts.push(`${seconds}s`);

  return parts.join(" ");
}

// ─── Recall.ai webhook ────────────────────────────────────────────────────────
// Add this URL in Recall dashboard → Webhooks:
// http://your-domain.com/api/webhook/recall
//
// Events we handle:
//   bot.status_change  → fires when bot joins, leaves, or finishes
//   transcript.data    → fires as transcript chunks arrive (we ignore these)

router.post("/recall", async (req: Request, res: Response) => {
  const receivedAt = new Date();
  const startedAtMs = Date.now();

  // Always respond 200 immediately so Recall doesn't retry
  res.sendStatus(200);

  const { event, data } = req.body;
  const botId = data?.bot?.id;
  const statusCode = data?.bot?.status_changes?.at(-1)?.code;

  console.log("[Recall webhook] received", {
    receivedAt: receivedAt.toISOString(),
    event,
    botId,
    statusCode,
  });

  // Only process when bot is done (meeting ended)
  if (event !== "bot.status_change") {
    console.log("[Recall webhook] ignored non-status event", { event, botId });
    return;
  }

  if (statusCode !== "done") {
    console.log("[Recall webhook] ignored status change", { botId, statusCode });
    return;
  }

  if (!botId) {
    console.log("[Recall webhook] ignored done event without bot id");
    return;
  }

  try {
    const meeting = await Meeting.findOne({ recallBotId: botId }).lean();
    if (meeting) {
      const meetingStartDelayMs = receivedAt.getTime() - new Date(meeting.date).getTime();
      const placeholderAgeMs = receivedAt.getTime() - new Date(meeting.createdAt).getTime();

      console.log("[Recall webhook] matched meeting", {
        botId,
        meetingId: meeting._id,
        title: meeting.title,
        momStatus: meeting.momStatus,
        meetingStartTime: meeting.date,
        webhookAfterMeetingStart: formatDuration(meetingStartDelayMs),
        webhookAfterDbCreate: formatDuration(placeholderAgeMs),
      });
    } else {
      console.log("[Recall webhook] no meeting matched for bot", { botId });
    }

    // Wait a few seconds for Recall to finalise the transcript
    await new Promise((r) => setTimeout(r, 5000));
    await generateMomForRecallBot(botId);
    console.log("[Recall webhook] MOM auto-generated", {
      botId,
      totalProcessingTime: formatDuration(Date.now() - startedAtMs),
    });
  } catch (err) {
    console.error("[Recall webhook] error", {
      botId,
      totalProcessingTime: formatDuration(Date.now() - startedAtMs),
      error: (err as Error).message,
    });
  }
});

export default router;
