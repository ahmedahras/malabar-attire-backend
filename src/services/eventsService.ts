import { db } from "../db/pool";
import { JOBS } from "../jobs/types";
import { env } from "../config/env";
import type { QueryRunner } from "../db/types";

export const emitDomainEvent = async (
  eventType: string,
  payload: Record<string, unknown>,
  client?: QueryRunner
) => {
  const runner = client ?? db;
  const { rows } = await runner.query(
    `INSERT INTO domain_events (event_type, payload)
     VALUES ($1, $2)
     RETURNING id`,
    [eventType, JSON.stringify(payload)]
  );

  const eventId = rows[0].id as string;
  if (!env.JOBS_ENABLED || process.env.JOBS_ENABLED === "false") {
    return eventId;
  }

  const { getEventsQueue } = await import("../jobs/queues");
  await getEventsQueue().add(JOBS.PROCESS_EVENT, { eventId }, {
    removeOnComplete: true,
    removeOnFail: false,
    jobId: eventId
  });

  return eventId;
};
