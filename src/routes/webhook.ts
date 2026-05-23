import { Router, Request, Response } from "express";
import Meeting from "../models/Meeting";
import ActionItem from "../models/ActionItem";
import { generateMOM } from "../services/aiService";
import { getBotTranscript } from "../services/recallService";

const router = Router();


router.post("/recall", async (req: Request, res: Response) => {
  // Always respond 200 immediately so Recall doesn't retry
  res.sendStatus(200);

  const { event, data } = req.body;

  console.log("Recall webhook received:", event, data?.bot?.id);

  // Only process when bot is done (meeting ended)
  if (event !== "bot.status_change") return;

  const statusCode = data?.bot?.status_changes?.at(-1)?.code;
  if (statusCode !== "done") return;

  const botId = data?.bot?.id;
  if (!botId) return;

  try {
    // Find the meeting that has this botId
    const meeting = await Meeting.findOne({ recallBotId: botId });
    if (!meeting) {
      console.error("No meeting found for botId:", botId);
      return;
    }

    // Wait a few seconds for Recall to finalise the transcript
    await new Promise((r) => setTimeout(r, 5000));

    // Fetch the full transcript
    const transcript = await getBotTranscript(botId);
    if (!transcript) {
      console.error("Empty transcript for botId:", botId);
      return;
    }

    // Generate MOM using your existing AI service
    const mom = await generateMOM(transcript, meeting.participants);

    // Update meeting with transcript + MOM
    meeting.rawTranscript = transcript;
    meeting.summary = mom.summary;
    meeting.decisions = mom.decisions;
    meeting.tags = mom.tags;
    await meeting.save();

    // Create action items
    const actionDocs = await ActionItem.insertMany(
      mom.actionItems.map((item) => ({
        meetingId: meeting._id,
        task: item.task,
        assignee: item.assignee,
        assigneeEmail: item.assigneeEmail,
        dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
      })),
    );

    meeting.actionItems = actionDocs.map((a) => a._id);
    await meeting.save();

    console.log(`MOM auto-generated for meeting: ${meeting.title}`);
  } catch (err) {
    console.error("Recall webhook error:", (err as Error).message);
  }
});

export default router;