import axios from "axios";

const RECALL_REGION = process.env.RECALL_REGION || "us-west-2";
const RECALL_BASE_URL = `https://${RECALL_REGION}.recall.ai/api/v1`;

const recallClient = axios.create({
  baseURL: RECALL_BASE_URL,
  headers: {
    Authorization: `Token ${process.env.RECALL_API_KEY}`,
    "Content-Type": "application/json",
  },
});

type RecallTranscriptWord = {
  text: string;
};

type RecallTranscriptTurn = {
  participant?: {
    name?: string | null;
  } | null;
  words?: RecallTranscriptWord[];
};

function formatTranscript(turns: RecallTranscriptTurn[]): string {
  return turns
    .map((turn) => {
      const speaker = turn.participant?.name || "Unknown";
      const text = turn.words?.map((word) => word.text).join(" ").trim();
      return text ? `${speaker}: ${text}` : "";
    })
    .filter(Boolean)
    .join("\n");
}

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;

  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
}

// ─── Send bot to Google Meet ──────────────────────────────────────────────────

export async function sendBotToMeeting(
  meetLink: string,
  meetingTitle: string,
): Promise<{ botId: string }> {
  const response = await recallClient.post("/bot", {
    meeting_url: meetLink,
    bot_name: "MOM Recorder",
    recording_config: {
      transcript: {
        provider: {
          recallai_streaming: {},
        },
      },
    },
    chat: {
      on_bot_join: {
        send_to: "everyone",
        message: `Hi! I'm the MOM Recorder bot for "${meetingTitle}". I'll transcribe this meeting and generate action items automatically.`,
      },
    },
  });

  return { botId: response.data.id };
}

// ─── Get transcript from a completed bot ─────────────────────────────────────

export async function getBotTranscript(botId: string): Promise<string> {
  const startedAtMs = Date.now();

  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const botResponse = await recallClient.get(`/bot/${botId}`);
    const recording = botResponse.data.recordings?.find(
      (item: any) => item.media_shortcuts?.transcript?.data?.download_url,
    );
    const downloadUrl = recording?.media_shortcuts?.transcript?.data?.download_url;

    console.log("[Recall transcript] checked bot recording", {
      botId,
      attempt,
      status: botResponse.data.status_changes?.at(-1)?.code || "unknown",
      recordings: botResponse.data.recordings?.length || 0,
      hasDownloadUrl: !!downloadUrl,
      elapsed: formatDuration(Date.now() - startedAtMs),
    });

    if (downloadUrl) {
      const transcriptResponse = await axios.get<RecallTranscriptTurn[]>(downloadUrl);
      const transcript = formatTranscript(transcriptResponse.data);

      console.log("[Recall transcript] downloaded transcript", {
        botId,
        turns: transcriptResponse.data.length,
        characters: transcript.length,
        elapsed: formatDuration(Date.now() - startedAtMs),
      });

      if (transcript) return transcript;
    }

    await wait(10000);
  }

  throw new Error("No transcript download URL available yet");
}

// ─── Get bot status ───────────────────────────────────────────────────────────

export async function getBotStatus(botId: string): Promise<string> {
  const response = await recallClient.get(`/bot/${botId}`);
  return response.data.status_changes?.at(-1)?.code || "unknown";
}
