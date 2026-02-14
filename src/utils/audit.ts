import { db } from "../db/pool";

export type AuditActorType = "customer" | "shop_owner" | "admin" | "system";

export const logAudit = async (input: {
  entityType: string;
  entityId: string;
  action: string;
  fromState?: string | null;
  toState?: string | null;
  actorType: AuditActorType;
  actorId?: string | null;
  metadata?: Record<string, unknown>;
  client?: { query: (sql: string, params?: unknown[]) => Promise<unknown> };
}) => {
  const runner = input.client ?? db;
  await runner.query(
    `INSERT INTO audit_logs
     (entity_type, entity_id, action, from_state, to_state, actor_type, actor_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      input.entityType,
      input.entityId,
      input.action,
      input.fromState ?? null,
      input.toState ?? null,
      input.actorType,
      input.actorId ?? null,
      JSON.stringify(input.metadata ?? {})
    ]
  );
};
