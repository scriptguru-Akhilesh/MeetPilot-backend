import mongoose, { Schema, Document } from "mongoose";

export interface IParticipant {
  name: string;
  email: string;
}

export interface IMeeting extends Document {
  title: string;
  date: Date;
  participants: IParticipant[];
  rawTranscript: string;
  summary: string;
  decisions: string[];
  actionItems: mongoose.Types.ObjectId[];
  momSentAt?: Date;
  emailStatus: "pending" | "sent" | "failed";
  momStatus: "manual" | "scheduled" | "recording" | "processing" | "generated" | "failed";
  momError?: string;
  transcriptReadyNotifiedAt?: Date;
  tags: string[];
  owner: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;

  // Google Calendar + Recall.ai
  meetLink?: string;
  calendarEventId?: string;
  recallBotId?: string;
}

const MeetingSchema = new Schema<IMeeting>(
  {
    title: { type: String, required: true },
    date: { type: Date, required: true },
    participants: [
      {
        name: { type: String, required: true },
        email: { type: String, required: true },
      },
    ],
    rawTranscript: { type: String, default: "" },
    summary: { type: String, default: "" },
    decisions: { type: [String], default: [] },
    actionItems: [{ type: Schema.Types.ObjectId, ref: "ActionItem" }],
    momSentAt: Date,
    emailStatus: {
      type: String,
      enum: ["pending", "sent", "failed"],
      default: "pending",
    },
    momStatus: {
      type: String,
      enum: ["manual", "scheduled", "recording", "processing", "generated", "failed"],
      default: "manual",
    },
    momError: { type: String },
    transcriptReadyNotifiedAt: Date,
    tags: { type: [String], default: [] },
    owner: { type: Schema.Types.ObjectId, ref: "User", required: true },

    // Google Calendar + Recall.ai
    meetLink: { type: String },
    calendarEventId: { type: String },
    recallBotId: { type: String },
  },
  { timestamps: true },
);

export default mongoose.model<IMeeting>("Meeting", MeetingSchema);
