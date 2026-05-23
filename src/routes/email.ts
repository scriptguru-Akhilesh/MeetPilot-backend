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
    await sendMOM(meeting as any, actions as any);
    meeting.emailStatus = "sent";
    meeting.momSentAt = new Date();
    await meeting.save();
    res.json({ success: true, sentAt: meeting.momSentAt });
  } catch (err) {
    meeting.emailStatus = "failed";
    await meeting.save();
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;
