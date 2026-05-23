import mongoose, { Schema, Document } from "mongoose";

export interface IActionItem extends Document {
  meetingId: mongoose.Types.ObjectId;
  task: string;
  assignee: string;
  assigneeEmail: string;
  dueDate?: Date;
  status: "open" | "in_progress" | "done";
  reminderSent: boolean;
}

const ActionItemSchema = new Schema<IActionItem>(
  {
    meetingId: { type: Schema.Types.ObjectId, ref: "Meeting", required: true },
    task: { type: String, required: true },
    assignee: { type: String, required: true },
    assigneeEmail: { type: String, required: true },
    dueDate: Date,
    status: {
      type: String,
      enum: ["open", "in_progress", "done"],
      default: "open",
    },
    reminderSent: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export default mongoose.model<IActionItem>("ActionItem", ActionItemSchema);
