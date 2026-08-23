import { Database } from '@arn/database';

export interface IdempotencyCheck {
  exists: boolean;
  result?: any;
}

export async function checkIdempotency(
  db: Database,
  key: string,
  operation: string
): Promise<IdempotencyCheck> {
  const result = await db.query(
    `SELECT payload FROM event_log 
     WHERE metadata->>'idempotency_key' = $1 
     AND event_type = $2
     ORDER BY created_at DESC
     LIMIT 1`,
    [key, operation]
  );

  if (result.rows.length > 0) {
    return {
      exists: true,
      result: result.rows[0].payload,
    };
  }

  return { exists: false };
}
