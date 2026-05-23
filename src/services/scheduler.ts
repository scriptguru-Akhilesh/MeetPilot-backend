import cron from "node-cron";
import ActionItem from "../models/ActionItem";
import Meeting from "../models/Meeting";
import { sendActionReminder } from "./emailService";
import { generateMomForRecallBot } from "./momAutomationService";
import { getBotStatus } from "./recallService";

// Runs every day at 8 AM — sends reminders for items due in ≤ 2 days
export function initScheduler(): void {
  cron.schedule("*/30 * * * * *", async () => {
    console.log("[Scheduler] Checking Recall meetings for automatic MOM...");

    const meetings = await Meeting.find({
      recallBotId: { $exists: true, $ne: null },
      momStatus: { $in: ["scheduled", "recording", "processing", "failed"] },
      date: { $lte: new Date() },
    }).limit(10);

    for (const meeting of meetings) {
      try {
        const botId = meeting.recallBotId;
        if (!botId) continue;

        const status = await getBotStatus(botId);
        if (status !== "done") {
          console.log(`[Scheduler] Recall bot ${botId} status: ${status}`);
          continue;
        }

        await generateMomForRecallBot(botId);
        console.log(`[Scheduler] MOM auto-generated for meeting: ${meeting.title}`);
      } catch (err) {
        console.error(
          `[Scheduler] MOM auto-generation failed for ${meeting.title}:`,
          (err as Error).message,
        );
      }
    }
  });

  cron.schedule("0 8 * * *", async () => {
    console.log("[Scheduler] Checking upcoming action items...");
    const soon = new Date();
    soon.setDate(soon.getDate() + 2);

    const items = await ActionItem.find({
      status: { $ne: "done" },
      reminderSent: false,
      dueDate: { $lte: soon, $gte: new Date() },
    });

    for (const item of items) {
      try {
        if (!item.assigneeEmail) {
          console.log(`[Scheduler] Reminder skipped for action ${item._id}: no assignee email`);
          continue;
        }

        await sendActionReminder(
          item.assigneeEmail,
          item.assignee,
          item.task,
          item.dueDate,
        );
        item.reminderSent = true;
        await item.save();
        console.log(`[Scheduler] Reminder sent to ${item.assigneeEmail}`);
      } catch (e) {
        console.error(`[Scheduler] Failed for ${item.assigneeEmail}:`, e);
      }
    }
  });
}
