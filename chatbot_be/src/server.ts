import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";

// Import our modules
import { DatabaseService } from "./services/database.service";
import { RedisService } from "./services/redis.service";
import { ChatbotService } from "./services/chatbot.service";
import { WebSocketHandler } from "./websocket/websocket.handler";
import MessageRoutes from "./routes/message.routes";

// Load environment variables
dotenv.config();

export class App {
  private app: express.Application;
  private server: any;
  private io: Server;
  private port: number;

  constructor() {
    this.port = parseInt(process.env.PORT || "3000", 10);
    this.app = express();
    this.server = createServer(this.app);
    this.io = new Server(this.server, {
      cors: {
        origin:
          process.env.NODE_ENV === "production"
            ? false
            : ["http://localhost:3001", "http://localhost:5173"],
        methods: ["GET", "POST"],
      },
    });

    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeWebSocket();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet());

    // CORS middleware
    this.app.use(
      cors({
        origin:
          process.env.NODE_ENV === "production"
            ? false
            : ["http://localhost:3001", "http://localhost:5173"],
        credentials: true,
      }),
    );

    // Body parsing middleware
    this.app.use(express.json({ limit: "10mb" }));
    this.app.use(express.urlencoded({ extended: true, limit: "10mb" }));

    // Request logging middleware
    this.app.use((req, res, next) => {
      console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.status(200).json({
        status: "OK",
        timestamp: new Date().toISOString(),
        service: "Chatbot VietLegal Backend",
      });
    });

    // API routes
    this.app.use("/api/messages", MessageRoutes);

    // 404 handler
    this.app.use("*", (req, res) => {
      res.status(404).json({ error: "Route not found" });
    });

    // Global error handler
    this.app.use(
      (
        err: any,
        req: express.Request,
        res: express.Response,
        next: express.NextFunction,
      ) => {
        console.error("Global error handler:", err);
        res.status(err.status || 500).json({
          error: err.message || "Internal server error",
          timestamp: new Date().toISOString(),
        });
      },
    );
  }

  private async initializeWebSocket(): Promise<void> {
    try {
      // Initialize services
      const databaseService = new DatabaseService();
      const redisService = new RedisService();
      const chatbotService = new ChatbotService(redisService);

      // Initialize WebSocket handler
      const wsHandler = new WebSocketHandler(
        this.io,
        databaseService,
        chatbotService,
      );

      console.log("✅ WebSocket initialized successfully");
    } catch (error) {
      console.error("❌ Failed to initialize WebSocket:", error);
      process.exit(1);
    }
  }

  public async start(): Promise<void> {
    try {
      // Start the server
      this.server.listen(this.port, () => {
        console.log(`🚀 Server running on port ${this.port}`);
        console.log(`📡 WebSocket server ready`);
        console.log(`🌍 Environment: ${process.env.NODE_ENV || "development"}`);
        console.log(`🔗 Health check: http://localhost:${this.port}/health`);
      });
    } catch (error) {
      console.error("❌ Failed to start server:", error);
      process.exit(1);
    }
  }
}

// Start the application
const app = new App();
app.start().catch((error) => {
  console.error("❌ Application failed to start:", error);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received, shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received, shutting down gracefully...");
  process.exit(0);
});
