import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { logger } from "./utils/logger";

export const createApp = () => {
  const app = express();
  const frontendOrigin = process.env.FRONTEND_URL || "http://localhost:3000";
  const corsOptions = {
    origin: frontendOrigin,
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
  };

  app.use(helmet());
  app.use(cors(corsOptions));
  app.options(/^\/api\/.*$/, cors(corsOptions));

  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        const url =
          (req as unknown as { originalUrl?: string; url?: string }).originalUrl ??
          req.url;

        if (
          url === "/api/webhooks/razorpay" ||
          url === "/api/webhooks/shiprocket"
        ) {
          (req as unknown as { rawBody?: Buffer }).rawBody = buf;
        }
      }
    })
  );

  app.use(express.urlencoded({ extended: true }));
  app.use(pinoHttp({ logger }));

  // 🔥 MAIN API ROUTER
  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
