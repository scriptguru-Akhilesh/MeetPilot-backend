import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import dotenv from "dotenv";
import meetingRoutes from "./routes/meetings";
import actionRoutes from "./routes/actions";
import emailRoutes from "./routes/email";
import authRoutes from "./routes/auth";
import { errorHandler } from "./middleware/errorHandler";
import { initScheduler } from "./services/scheduler";
import calendarRouter from "./routes/calendar";
import webhookRouter from "./routes/webhook";

dotenv.config();

const app = express();
app.use(cors({
  origin: true,
  credentials: true
}));
app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/meetings", meetingRoutes);
app.use("/api/actions", actionRoutes);
app.use("/api/email", emailRoutes);
app.use("/api/calendar", calendarRouter);
app.use("/api/webhook", webhookRouter);
app.use(errorHandler);

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  throw new Error("MONGODB_URI is required in environment variables");
}

mongoose
  .connect(mongoUri)
  .then(() => {
    console.log("MongoDB connected");
    initScheduler();
    app.listen(process.env.PORT || 4000, () =>
      console.log(`Server running on :${process.env.PORT || 4000}`),
    );
  })
  .catch((error) => {
    console.error("Failed to connect to MongoDB", error);
    process.exit(1);
  });
