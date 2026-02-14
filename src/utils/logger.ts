import pino from "pino";

export const logger = pino({
  level: process.env.NODE_ENV === "production" ? "info" : "debug",
  base: undefined,
  messageKey: "message",
  timestamp: () => `,"timestamp":"${new Date().toISOString()}"`
});
