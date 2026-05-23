import OpenAI from "openai";
import { IParticipant } from "../models/Meeting";
import dotenv from 'dotenv'
dotenv.config()

console.log(
  "DEBUG: Checking OpenAI key:",
  process.env.OPENAI_API_KEY
);

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "CRITICAL CONFIG ERROR: OPENAI_API_KEY is undefined!"
  );
}

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface MomResult {
  title: string;
  summary: string;
  decisions: string[];
  actionItems: Array<{
    task: string;
    assignee: string;
    assigneeEmail: string;
    dueDate?: string | null;
  }>;
  tags: string[];
}

function safeDate(
  value?: string | null
): string | undefined {
  if (!value) return undefined;

  const parsed = new Date(value);

  return Number.isNaN(parsed.getTime())
    ? undefined
    : parsed.toISOString().split("T")[0];
}

function findEmailForName(
  name: string,
  participants: IParticipant[]
): string {
  const normalized = name.trim().toLowerCase();

  const match = participants.find(
    (participant) =>
      participant.name.trim().toLowerCase() ===
      normalized
  );

  return match?.email ?? "";
}

export async function generateMOM(
  transcript: string,
  participants: IParticipant[]
): Promise<MomResult> {
  const participantList = participants
    .map((p) => `${p.name} <${p.email}>`)
    .join(", ");

  const prompt = `
You are a professional meeting secretary.

Analyze this meeting transcript and extract:
- title
- summary
- decisions
- action items
- tags

Participants:
${participantList}

Transcript:
${transcript}

Return ONLY valid JSON.

Expected format:

{
  "title": "",
  "summary": "",
  "decisions": [],
  "actionItems": [
    {
      "task": "",
      "assignee": "",
      "assigneeEmail": "",
      "dueDate": ""
    }
  ],
  "tags": []
}
`;

  try {
    const completion =
      await openai.chat.completions.create({
        model: "gpt-4o-mini",

        response_format: {
          type: "json_object",
        },

        messages: [
          {
            role: "system",
            content:
              "You are a professional meeting assistant that always returns valid JSON.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
      });

    const rawText =
      completion.choices[0].message.content || "{}";

    const parsed: MomResult =
      JSON.parse(rawText);

    return {
      title:
        parsed.title || "Team Meeting Summary",

      summary:
        parsed.summary ||
        "No summary was generated.",

      decisions: Array.isArray(parsed.decisions)
        ? parsed.decisions
        : [],

      tags: Array.isArray(parsed.tags)
        ? parsed.tags
        : [],

      actionItems: Array.isArray(
        parsed.actionItems
      )
        ? parsed.actionItems.map((item) => ({
            task:
              item.task ||
              "Update task description",

            assignee:
              item.assignee || "Unassigned",

            assigneeEmail:
              item.assigneeEmail ||
              findEmailForName(
                item.assignee,
                participants
              ),

            dueDate:
              safeDate(item.dueDate) ?? null,
          }))
        : [],
    };
  } catch (error) {
    console.error("OpenAI Error:", error);

    throw new Error(
      "Failed to generate meeting summary"
    );
  }
}