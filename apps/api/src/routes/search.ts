import { FastifyInstance } from 'fastify';

export async function searchRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Querystring: {
      q: string;
      type?: 'claims' | 'tasks' | 'threads' | 'all';
      project_id?: string;
      limit?: number;
    };
  }>(
    '/v1/search',
    {
      schema: {
        tags: ['search'],
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 1 },
            type: { type: 'string', enum: ['claims', 'tasks', 'threads', 'all'] },
            project_id: { type: 'string', format: 'uuid' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 20 },
          },
        },
      },
    },
    async (request) => {
      const { q, type = 'all', project_id, limit = 20 } = request.query;
      const { db } = fastify.services;

      const results: any = {
        query: q,
        claims: [],
        tasks: [],
        threads: [],
      };

      const projectFilter = project_id ? 'AND project_id = $2' : '';
      const params = project_id ? [q, project_id, limit] : [q, limit];
      const limitParam = project_id ? '$3' : '$2';

      if (type === 'all' || type === 'claims') {
        const claimResults = await db.query(
          `SELECT c.*, a.name as author_name
           FROM claims c
           JOIN agents a ON c.author_id = a.id
           WHERE (c.title ILIKE '%' || $1 || '%' OR c.content ILIKE '%' || $1 || '%')
           ${projectFilter}
           ORDER BY c.created_at DESC
           LIMIT ${limitParam}`,
          params
        );
        results.claims = claimResults.rows;
      }

      if (type === 'all' || type === 'tasks') {
        const taskResults = await db.query(
          `SELECT t.*, p.name as principal_name
           FROM tasks t
           JOIN principals p ON t.created_by = p.id
           WHERE (t.title ILIKE '%' || $1 || '%' OR t.description ILIKE '%' || $1 || '%')
           ${projectFilter}
           ORDER BY t.created_at DESC
           LIMIT ${limitParam}`,
          params
        );
        results.tasks = taskResults.rows;
      }

      if (type === 'all' || type === 'threads') {
        const threadResults = await db.query(
          `SELECT th.*, p.name as creator_name
           FROM threads th
           JOIN principals p ON th.created_by = p.id
           WHERE th.title ILIKE '%' || $1 || '%'
           ${projectFilter}
           ORDER BY th.last_activity_at DESC
           LIMIT ${limitParam}`,
          params
        );
        results.threads = threadResults.rows;
      }

      return results;
    }
  );
}
