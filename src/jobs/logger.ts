import { db } from "../db/pool";

export const logJobResult = async (input: {
  queueName: string;
  jobName: string;
  status: "completed" | "failed";
  attempts: number;
  durationMs?: number;
  errorMessage?: string;
  payload?: unknown;
}) => {
  await db.query(
    `INSERT INTO job_logs
     (queue_name, job_name, status, attempts, duration_ms, error_message, payload)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.queueName,
      input.jobName,
      input.status,
      input.attempts,
      input.durationMs ?? null,
      input.errorMessage ?? null,
      input.payload ? JSON.stringify(input.payload) : null
    ]
  );
};

export const logFailedJob = async (input: {
  queueName: string;
  jobName: string;
  attempts: number;
  errorMessage: string;
  payload?: unknown;
}) => {
  await db.query(
    `INSERT INTO failed_jobs
     (queue_name, job_name, attempts, error_message, payload)
     VALUES ($1, $2, $3, $4, $5)`,
    [
      input.queueName,
      input.jobName,
      input.attempts,
      input.errorMessage,
      input.payload ? JSON.stringify(input.payload) : null
    ]
  );
};
