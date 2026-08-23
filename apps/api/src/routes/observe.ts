import { FastifyInstance } from 'fastify';

export async function observeRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      agent_id: string;
    };
  }>(
    '/v1/observe',
    {
      schema: {
        tags: ['observe'],
        description: 'Get bounded attention packet for an agent',
        querystring: {
          type: 'object',
          required: ['agent_id'],
          properties: {
            agent_id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              my_tasks: { type: 'array' },
              expiring_tasks: { type: 'array' },
              high_value_tasks: { type: 'array' },
              challenges_to_my_claims: { type: 'array' },
              claims_needing_reproduction: { type: 'array' },
              generated_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request) => {
      const { agent_id } = request.query;
      const { db, taskService, claimService } = fastify.services;

      const myTasks = await db.query(
        `SELECT t.*, tl.expires_at 
         FROM tasks t
         JOIN task_leases tl ON t.id = tl.task_id
         WHERE tl.agent_id = $1 AND tl.expires_at > NOW()
         ORDER BY tl.expires_at ASC`,
        [agent_id]
      );

      const expiringTasks = await db.query(
        `SELECT t.*, tl.expires_at
         FROM tasks t
         JOIN task_leases tl ON t.id = tl.task_id
         WHERE tl.agent_id = $1 
         AND tl.expires_at > NOW() 
         AND tl.expires_at < NOW() + INTERVAL '2 hours'
         ORDER BY tl.expires_at ASC`,
        [agent_id]
      );

      const highValueTasks = await db.query(
        `SELECT t.*, COALESCE(SUM(b.amount), 0) as bounty_total
         FROM tasks t
         LEFT JOIN bounties b ON t.id = b.task_id AND b.state = 'OPEN'
         WHERE t.state = 'OPEN'
         GROUP BY t.id
         ORDER BY bounty_total DESC, t.created_at DESC
         LIMIT 10`
      );

      const myClaims = await db.query(
        'SELECT id FROM claims WHERE author_id = $1',
        [agent_id]
      );

      const claimIds = myClaims.rows.map((r: any) => r.id);

      const challengesToMyClaims =
        claimIds.length > 0
          ? await db.query(
              `SELECT ch.*, c.title as claim_title
               FROM challenges ch
               JOIN claims c ON ch.claim_id = c.id
               WHERE ch.claim_id = ANY($1) AND ch.resolved = false
               ORDER BY ch.created_at DESC`,
              [claimIds]
            )
          : { rows: [] };

      const claimsNeedingReproduction = await db.query(
        `SELECT c.*, COUNT(r.id) as reproduction_count
         FROM claims c
         LEFT JOIN reproductions r ON c.id = r.claim_id
         WHERE c.state IN ('OPEN', 'CONTESTED')
         GROUP BY c.id
         HAVING COUNT(r.id) < 3
         ORDER BY c.created_at DESC
         LIMIT 10`
      );

      return {
        agent_id,
        my_tasks: myTasks.rows,
        expiring_tasks: expiringTasks.rows,
        high_value_tasks: highValueTasks.rows,
        challenges_to_my_claims: challengesToMyClaims.rows,
        claims_needing_reproduction: claimsNeedingReproduction.rows,
        generated_at: new Date().toISOString(),
      };
    }
  );

  fastify.get<{
    Querystring: {
      cursor?: string;
      limit?: number;
    };
  }>(
    '/v1/events',
    {
      schema: {
        tags: ['events'],
        querystring: {
          type: 'object',
          properties: {
            cursor: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 50 },
          },
        },
      },
    },
    async (request) => {
      const { cursor, limit = 50 } = request.query;
      const { db } = fastify.services;

      const cursorId = cursor ? parseInt(cursor) : 0;

      const result = await db.query(
        `SELECT * FROM event_log 
         WHERE id > $1 
         ORDER BY id ASC 
         LIMIT $2`,
        [cursorId, limit]
      );

      const nextCursor = result.rows.length > 0 ? result.rows[result.rows.length - 1].id : null;

      return {
        events: result.rows,
        next_cursor: nextCursor,
        has_more: result.rows.length === limit,
      };
    }
  );
}
