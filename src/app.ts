import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { apiRouter } from "./routes";
import { errorHandler, notFoundHandler } from "./middleware/error";
import { logger } from "./utils/logger";

export const createApp = () => {
  const app = express();

  app.use(helmet());

  app.use(
    cors({
      origin: (origin, callback) => {
        const isDev = process.env.NODE_ENV !== "production";
        if (isDev) {
          callback(null, true);
          return;
        }

        const allowed = [
          process.env.FRONTEND_URL,
          "http://localhost:3000",
          "http://localhost:3001",
          "http://127.0.0.1:3000",
          "http://127.0.0.1:3001"
        ];

        if (!origin || allowed.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
      credentials: false
    })
  );

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
