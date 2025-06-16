import express from "express";
import { createServer } from "node:http";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cors from "cors";

// Routes and Socket setup
import userRoutes from "./routes/user.routes.js";
import { connectToSocket } from "./controllers/socketManager.js";

// Load environment variables
dotenv.config();

// Initialize Express app and HTTP server
const app = express();
const server = createServer(app);

// Initialize WebSocket via Socket.IO
connectToSocket(server); // handles all socket events inside

// Set server port
app.set("port", process.env.PORT || 5000);

// Middlewares
app.use(cors());
app.use(express.json({ limit: "40kb" }));
app.use(express.urlencoded({ extended: true, limit: "40kb" }));

// API Routes
app.use("/api/v1/users", userRoutes);

// MongoDB + Server start function
const start = async () => {
  try {
    const db = await mongoose.connect(process.env.MONGO_URL, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
    });

    console.log(`✅ MongoDB connected at ${db.connection.host}`);

    server.listen(app.get("port"), () => {
      console.log(`🚀 Server running at http://localhost:${app.get("port")}`);
    });
  } catch (error) {
    console.error("❌ MongoDB connection failed:", error);
    process.exit(1); // Optional: force stop if DB fails
  }
};

// Start the server
start();
