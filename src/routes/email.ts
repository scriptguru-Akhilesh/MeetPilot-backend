import { Router, Response } from "express";
import Meeting from "../models/Meeting";
import ActionItem from "../models/ActionItem";
import { sendMOM } from "../services/emailService";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

router.post("/send/:meetingId", async (req: AuthRequest, res: Response) => {
  const meeting = await Meeting.findOne({
    _id: req.params.meetingId,
    owner: req.user!.id,
  });
  if (!meeting) return res.status(404).json({ error: "Meeting not found" });

  const actions = await ActionItem.find({ meetingId: meeting._id });

  try {
    console.log("[Email route] manual MOM send requested", {
      meetingId: meeting._id,
      requestedBy: req.user!.id,
      participantEmails: meeting.participants.map((participant) => participant.email),
      actionAssigneeEmails: actions.map((action) => ({
        task: action.task,
        assignee: action.assignee,
        assigneeEmail: action.assigneeEmail,
      })),
    });
    await sendMOM(meeting as any, actions as any);
    meeting.emailStatus = "sent";
    meeting.momSentAt = new Date();
    await meeting.save();
    console.log("[Email route] manual MOM send completed", {
      meetingId: meeting._id,
      sentAt: meeting.momSentAt,
    });
    res.json({ success: true, sentAt: meeting.momSentAt });
  } catch (err) {
    meeting.emailStatus = "failed";
    await meeting.save();
    console.error("[Email route] manual MOM send failed", {
      meetingId: meeting._id,
      error: (err as Error).message,
    });
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
