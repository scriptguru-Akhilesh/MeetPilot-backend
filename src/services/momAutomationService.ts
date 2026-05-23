import ActionItem from "../models/ActionItem";
import Meeting from "../models/Meeting";
import User from "../models/User";
import { generateMOM } from "./aiService";
import { sendTranscriptReadyEmail } from "./emailService";
import { getBotTranscript } from "./recallService";

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

export async function generateMomForRecallBot(botId: string): Promise<void> {
  const startedAtMs = Date.now();
  const meeting = await Meeting.findOne({ recallBotId: botId });
  if (!meeting) {
    throw new Error(`No meeting found for botId: ${botId}`);
  }

  if (meeting.momStatus === "generated") {
    console.log("[MOM automation] skipped already generated meeting", {
      botId,
      meetingId: meeting._id,
      title: meeting.title,
    });
    return;
  }

  try {
    console.log("[MOM automation] started", {
      botId,
      meetingId: meeting._id,
      title: meeting.title,
      participantCount: meeting.participants.length,
      currentStatus: meeting.momStatus,
    });

    meeting.momStatus = "processing";
    meeting.momError = undefined;
    await meeting.save();

    const transcriptStartedAtMs = Date.now();
    const transcript = await getBotTranscript(botId);
    if (!transcript.trim()) {
      throw new Error("Empty transcript from Recall");
    }
    console.log("[MOM automation] transcript fetched", {
      botId,
      meetingId: meeting._id,
      transcriptCharacters: transcript.length,
      duration: formatDuration(Date.now() - transcriptStartedAtMs),
    });

    const aiStartedAtMs = Date.now();
    const mom = await generateMOM(transcript, meeting.participants);
    console.log("[MOM automation] AI MOM generated", {
      botId,
      meetingId: meeting._id,
      decisions: mom.decisions.length,
      actionItems: mom.actionItems.length,
      duration: formatDuration(Date.now() - aiStartedAtMs),
    });

    const saveStartedAtMs = Date.now();
    meeting.rawTranscript = transcript;
    meeting.summary = mom.summary;
    meeting.decisions = mom.decisions;
    meeting.tags = mom.tags;
    meeting.momStatus = "generated";
    meeting.momError = undefined;
    await meeting.save();

    const host = await User.findById(meeting.owner).lean();
    const actionItems = mom.actionItems.map((item) => {
      const assignee = item.assignee?.trim() || "Unassigned";

      return {
        meetingId: meeting._id,
        task: item.task?.trim() || "Update task description",
        assignee,
        assigneeEmail: item.assigneeEmail?.trim() || undefined,
        dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
      };
    });

    await ActionItem.deleteMany({ meetingId: meeting._id });
    const actionDocs = actionItems.length
      ? await ActionItem.insertMany(actionItems)
      : [];

    meeting.actionItems = actionDocs.map((action) => action._id);
    await meeting.save();

    console.log("[MOM automation] saved meeting output", {
      botId,
      meetingId: meeting._id,
      actionItems: actionDocs.length,
      saveDuration: formatDuration(Date.now() - saveStartedAtMs),
    });

    if (!meeting.transcriptReadyNotifiedAt) {
      const emailStartedAtMs = Date.now();
      if (host?.email) {
        await sendTranscriptReadyEmail(host.name, host.email, meeting);
        meeting.transcriptReadyNotifiedAt = new Date();
        await meeting.save();
        console.log("[MOM automation] host notified", {
          botId,
          meetingId: meeting._id,
          hostEmail: host.email,
          duration: formatDuration(Date.now() - emailStartedAtMs),
        });
      } else {
        console.log("[MOM automation] host notification skipped", {
          botId,
          meetingId: meeting._id,
          reason: "Owner email not found",
        });
      }
    }

    console.log("[MOM automation] completed", {
      botId,
      meetingId: meeting._id,
      totalDuration: formatDuration(Date.now() - startedAtMs),
    });
  } catch (err) {
    meeting.momStatus = "failed";
    meeting.momError = (err as Error).message;
    await meeting.save();
    console.error("[MOM automation] failed", {
      botId,
      meetingId: meeting._id,
      title: meeting.title,
      duration: formatDuration(Date.now() - startedAtMs),
      error: (err as Error).message,
    });
    throw err;
  }
}
