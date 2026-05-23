import { Router, Response } from "express";
import fs from "fs";
import Meeting from "../models/Meeting";
import ActionItem from "../models/ActionItem";
import { generateMOM } from "../services/aiService";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import { upload } from "../middleware/upload";

const router = Router();
router.use(authMiddleware);

router.post(
  "/",
  upload.single("transcript"),
  async (req: AuthRequest, res: Response) => {
    try {
      const { title, date, participants, tags } = req.body;
      const rawParticipants =
        typeof participants === "string"
          ? participants
          : JSON.stringify(participants || []);
      const parsedParticipants = JSON.parse(rawParticipants || "[]");

      if (
        !Array.isArray(parsedParticipants) ||
        parsedParticipants.length === 0
      ) {
        return res
          .status(400)
          .json({ error: "At least one participant is required" });
      }

      let transcript = "";
      if (req.file) {
        transcript = fs.readFileSync(req.file.path, "utf-8");
      } else if (req.body.transcript) {
        transcript = req.body.transcript;
      }

      if (!transcript.trim()) {
        return res.status(400).json({ error: "Transcript is required" });
      }

      const mom = await generateMOM(transcript, parsedParticipants);
      const meeting = await Meeting.create({
        title: mom.title || title || "Meeting summary",
        date: date ? new Date(date) : new Date(),
        participants: parsedParticipants,
        rawTranscript: transcript,
        summary: mom.summary,
        decisions: mom.decisions,
        tags: Array.isArray(tags) ? tags : mom.tags,
        owner: req.user!.id,
        momStatus: "generated",
      });

      const actionDocs = await ActionItem.insertMany(
        mom.actionItems.map((item) => {
          const assignee = item.assignee?.trim() || "Unassigned";

          return {
            meetingId: meeting._id,
            task: item.task?.trim() || "Update task description",
            assignee,
            assigneeEmail: item.assigneeEmail?.trim() || undefined,
            dueDate: item.dueDate ? new Date(item.dueDate) : undefined,
          };
        }),
      );

      meeting.actionItems = actionDocs.map((a) => a._id);
      await meeting.save();

      const meetingWithActions = await Meeting.findById(meeting._id)
        .populate("actionItems")
        .lean();
      return res
        .status(201)
        .json({ meeting: meetingWithActions, actionItems: actionDocs });
    } catch (err) {
      return res.status(500).json({ error: (err as Error).message });
    }
  },
);

router.get("/", async (req: AuthRequest, res: Response) => {
  const ownerId = req.user!.id;
  const { search, status } = req.query;

  const filters: Record<string, any> = { owner: ownerId };
  if (status && typeof status === "string") {
    filters.emailStatus = status;
  }
  if (search && typeof search === "string") {
    filters.title = { $regex: search, $options: "i" };
  }

  const meetings = await Meeting.find(filters)
    .sort({ date: -1 })
    .populate("actionItems")
    .lean();

  res.json(meetings);
});

router.get("/:id", async (req: AuthRequest, res: Response) => {
  const ownerId = req.user!.id;
  const meeting = await Meeting.findOne({ _id: req.params.id, owner: ownerId })
    .populate("actionItems")
    .lean();

  if (!meeting) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  res.json(meeting);
});

router.patch("/:id", async (req: AuthRequest, res: Response) => {
  const ownerId = req.user!.id;
  const updates = { ...req.body };
  if (updates.participants && typeof updates.participants === "string") {
    updates.participants = JSON.parse(updates.participants);
  }
  const meeting = await Meeting.findOneAndUpdate(
    { _id: req.params.id, owner: ownerId },
    updates,
    { new: true },
  ).populate("actionItems");

  if (!meeting) {
    return res.status(404).json({ error: "Meeting not found" });
  }

  res.json(meeting);
});

export default router;
