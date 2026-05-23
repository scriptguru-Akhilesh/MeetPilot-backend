import { Router, Response, Request } from "express";
import axios from "axios";
import { authMiddleware, AuthRequest } from "../middleware/auth";
import User from "../models/User";
import Meeting from "../models/Meeting";
import {
  createCalendarEvent,
  getAuthenticatedClient,
  getAuthUrl,
  exchangeCodeForTokens,
  CreateEventInput,
} from "../services/CalendarService";
import { sendBotToMeeting } from "../services/recallService";

const router = Router();

// ─── Connect Google Calendar ──────────────────────────────────────────────────

router.get("/connect", authMiddleware, (req: AuthRequest, res: Response) => {
  const url = getAuthUrl(req.user!.id);
  res.json({ url });
});

// ─── OAuth callback ───────────────────────────────────────────────────────────

router.get("/callback", async (req: Request, res: Response) => {
  const { code, state: userId } = req.query;

  if (!code || typeof code !== "string") {
    return res.status(400).json({ error: "Missing OAuth code" });
  }

  if (!userId || typeof userId !== "string") {
    return res.status(400).json({ error: "Missing state (userId)" });
  }

  try {
    const { accessToken, refreshToken } = await exchangeCodeForTokens(code);

    await User.findByIdAndUpdate(userId, {
      googleAccessToken: accessToken,
      googleRefreshToken: refreshToken,
      googleCalendarConnected: true,
    });

    res.redirect(`${process.env.FRONTEND_URL}/dashboard?calendar=connected`);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Create calendar event + send Recall bot ──────────────────────────────────

router.post("/events", authMiddleware, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id)
      .select("+googleAccessToken +googleRefreshToken googleCalendarConnected")
      .lean();

    if (!user?.googleCalendarConnected || !user?.googleRefreshToken) {
      return res.status(403).json({
        error: "Google Calendar not connected",
        connectUrl: "/api/calendar/connect",
      });
    }

    const { title, startTime, durationMinutes, participants, timeZone, description } =
      req.body;

    if (!title?.trim()) {
      return res.status(400).json({ error: "Meeting title is required" });
    }
    if (!startTime) {
      return res.status(400).json({ error: "startTime is required (ISO string)" });
    }
    if (!Array.isArray(participants) || participants.length === 0) {
      return res.status(400).json({ error: "At least one participant is required" });
    }
    if (participants.find((p: any) => !p.name?.trim() || !p.email?.trim())) {
      return res.status(400).json({ error: "Each participant needs a name and email" });
    }

    const auth = getAuthenticatedClient(
      user.googleAccessToken!,
      user.googleRefreshToken!,
    );

    const input: CreateEventInput = {
      title,
      description,
      startTime: new Date(startTime),
      durationMinutes: durationMinutes || 60,
      participants,
      timeZone: timeZone || "Asia/Kolkata",
    };

    // Step 1: Create Google Calendar event
    const event = await createCalendarEvent(auth, input);

    // Step 2: Create a placeholder meeting in DB so webhook can find it later
    const meeting = await Meeting.create({
      title,
      date: new Date(startTime),
      participants,
      owner: req.user!.id,
      meetLink: event.meetLink,
      calendarEventId: event.eventId,
      // transcript/MOM will be filled by webhook after meeting ends
      rawTranscript: "",
      summary: "",
      decisions: [],
      tags: [],
      actionItems: [],
      momStatus: "scheduled",
    });

    // Step 3: Send Recall bot to join the meeting
    let botId: string | null = null;
    try {
      const recall = await sendBotToMeeting(event.meetLink, title);
      botId = recall.botId;

      // Save botId on the meeting so webhook can match it
      await Meeting.findByIdAndUpdate(meeting._id, {
        recallBotId: botId,
        momStatus: "recording",
        $unset: { momError: 1 },
      });
    } catch (recallErr) {
      // Don't fail the whole request if Recall fails
      if (axios.isAxiosError(recallErr)) {
        console.error("Recall bot error:", {
          status: recallErr.response?.status,
          data: recallErr.response?.data,
        });
      } else {
        console.error("Recall bot error:", (recallErr as Error).message);
      }
      await Meeting.findByIdAndUpdate(meeting._id, {
        momStatus: "failed",
        momError: "Recall bot could not be started",
      });
    }

    return res.status(201).json({
      eventId: event.eventId,
      meetLink: event.meetLink,
      calendarLink: event.calendarLink,
      startTime: event.startTime,
      endTime: event.endTime,
      title: event.title,
      participantCount: participants.length,
      meetingId: meeting._id,
      botId,
      transcriptionEnabled: !!botId,
    });
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message });
  }
});

// ─── Status ───────────────────────────────────────────────────────────────────

router.get("/status", authMiddleware, async (req: AuthRequest, res: Response) => {
  const user = await User.findById(req.user!.id).lean();
  res.json({ connected: !!user?.googleCalendarConnected });
});

// ─── Disconnect ───────────────────────────────────────────────────────────────

router.delete("/disconnect", authMiddleware, async (req: AuthRequest, res: Response) => {
  await User.findByIdAndUpdate(req.user!.id, {
    $unset: { googleAccessToken: 1, googleRefreshToken: 1 },
    googleCalendarConnected: false,
  });
  res.json({ success: true });
});

export default router;
