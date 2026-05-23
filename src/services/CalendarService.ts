import { google } from "googleapis";
import { OAuth2Client } from "google-auth-library";


export interface CalendarParticipant {
  name: string;
  email: string;
}

export interface CreateEventInput {
  title: string;
  description?: string;
  startTime: Date;
  durationMinutes: number;
  participants: CalendarParticipant[];
  timeZone?: string;
}

export interface CreatedEvent {
  eventId: string;
  meetLink: string;
  calendarLink: string;
  startTime: Date;
  endTime: Date;
  title: string;
}


export function buildOAuth2Client(): OAuth2Client {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID!,
    process.env.GOOGLE_CLIENT_SECRET!,
    process.env.GOOGLE_REDIRECT_URI!, 
  );
}

export function getAuthenticatedClient(
  accessToken: string,
  refreshToken: string,
): OAuth2Client {
  const client = buildOAuth2Client();
  client.setCredentials({ access_token: accessToken, refresh_token: refreshToken });
  return client;
}


export async function createCalendarEvent(
  auth: OAuth2Client,
  input: CreateEventInput,
): Promise<CreatedEvent> {
  const calendar = google.calendar({ version: "v3", auth });

  const endTime = new Date(
    input.startTime.getTime() + input.durationMinutes * 60 * 1000,
  );

  const requestId = `mom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const event = await calendar.events.insert({
    calendarId: "primary",
    conferenceDataVersion: 1,
    sendUpdates: "all", 
    requestBody: {
      summary: input.title,
      description:
        input.description ||
        "Meeting scheduled via MOM Generator. Transcript and action items will be shared after the meeting.",
      start: {
        dateTime: input.startTime.toISOString(),
        timeZone: input.timeZone || "UTC",
      },
      end: {
        dateTime: endTime.toISOString(),
        timeZone: input.timeZone || "UTC",
      },
      attendees: input.participants.map((p) => ({
        email: p.email,
        displayName: p.name,
      })),
      conferenceData: {
        createRequest: {
          requestId,
          conferenceSolutionKey: { type: "hangoutsMeet" },
        },
      },
      reminders: {
        useDefault: false,
        overrides: [
          { method: "email", minutes: 60 },
          { method: "popup", minutes: 10 },
        ],
      },
    },
  });

  const meetLink =
    event.data.conferenceData?.entryPoints?.find(
      (ep) => ep.entryPointType === "video",
    )?.uri || "";

  if (!meetLink) {
    throw new Error(
      "Google Meet link was not generated. Ensure your Google Workspace account supports Meet.",
    );
  }

  return {
    eventId: event.data.id!,
    meetLink,
    calendarLink: event.data.htmlLink!,
    startTime: input.startTime,
    endTime,
    title: input.title,
  };
}


export function getAuthUrl(userId: string): string {
  const client = buildOAuth2Client();
  return client.generateAuthUrl({
    access_type: "offline",  
    prompt: "consent",  
    state: userId,         
    scope: [
      "https://www.googleapis.com/auth/calendar.events",
      "https://www.googleapis.com/auth/calendar.readonly",
    ],
  });
}

// ─── Exchange auth code for tokens (OAuth callback) ──────────────────────────

export async function exchangeCodeForTokens(
  code: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const client = buildOAuth2Client();
  const { tokens } = await client.getToken(code);

  if (!tokens.refresh_token) {
    throw new Error(
      "No refresh token returned. Revoke app access at https://myaccount.google.com/permissions and reconnect.",
    );
  }

  return {
    accessToken: tokens.access_token!,
    refreshToken: tokens.refresh_token,
  };
}