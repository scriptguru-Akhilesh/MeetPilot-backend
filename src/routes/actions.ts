import { Router, Response } from "express";
import ActionItem from "../models/ActionItem";
import Meeting from "../models/Meeting";
import { authMiddleware, AuthRequest } from "../middleware/auth";

const router = Router();
router.use(authMiddleware);

router.get("/stats", async (req: AuthRequest, res: Response) => {
  const ownerId = req.user!.id;
  const meetings = await Meeting.find({ owner: ownerId }).lean();
  const actionIds = meetings.flatMap((meeting) => meeting.actionItems || []);
  const actions = await ActionItem.find({
    meetingId: { $in: actionIds },
  }).lean();

  const stats = {
    total: actions.length,
    open: actions.filter((a) => a.status === "open").length,
    inProgress: actions.filter((a) => a.status === "in_progress").length,
    done: actions.filter((a) => a.status === "done").length,
    byAssignee: actions.reduce<Record<string, number>>((acc, action) => {
      acc[action.assignee] = (acc[action.assignee] || 0) + 1;
      return acc;
    }, {}),
  };

  res.json(stats);
});

router.get("/", async (req: AuthRequest, res: Response) => {
  const ownerId = req.user!.id;
  const meetings = await Meeting.find({ owner: ownerId }).lean();
  const actions = await ActionItem.find({
    meetingId: { $in: meetings.map((m) => m._id) },
  }).lean();
  res.json(actions);
});

router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const { status, dueDate } = req.body;
  const action = await ActionItem.findById(req.params.id);
  if (!action) return res.status(404).json({ error: "Action item not found" });

  const meeting = await Meeting.findOne({
    _id: action.meetingId,
    owner: req.user!.id,
  });
  if (!meeting) return res.status(403).json({ error: "Forbidden" });

  if (status) action.status = status;
  if (dueDate) action.dueDate = new Date(dueDate);
  await action.save();

  res.json(action);
});

export default router;
