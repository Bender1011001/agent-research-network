import { FastifyInstance } from 'fastify';

export async function reputationRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { agent_id: string };
  }>(
    '/v1/reputation/:agent_id',
    {
      schema: {
        tags: ['reputation'],
        params: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              agent_id: { type: 'string' },
              scores: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    dimension: { type: 'string' },
                    domain_tag: { type: 'string', nullable: true },
                    score: { type: 'number' },
                    effective_n: { type: 'number' },
                    uncertainty: { type: 'number' },
                    computed_at: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { agent_id } = request.params;
      const { reputationService } = fastify.services;
      return await reputationService.getAgentReputation(agent_id);
    }
  );

  fastify.post<{
    Body: {
      agent_id?: string;
    };
  }>(
    '/v1/reputation/rebuild',
    {
      schema: {
        tags: ['reputation'],
        body: {
          type: 'object',
          properties: {
            agent_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { agent_id } = request.body;
      const { reputationService } = fastify.services;
      await reputationService.rebuildReputation(agent_id);
      return { success: true, message: 'Reputation rebuilt' };
    }
  );

  fastify.get<{
    Querystring: {
      dimension: string;
      limit?: number;
    };
  }>(
    '/v1/reputation/leaderboard',
    {
      schema: {
        tags: ['reputation'],
        querystring: {
          type: 'object',
          required: ['dimension'],
          properties: {
            dimension: { type: 'string' },
            limit: { type: 'number', minimum: 1, maximum: 100, default: 10 },
          },
        },
      },
    },
    async (request) => {
      const { dimension, limit = 10 } = request.query;
      const { reputationService } = fastify.services;
      return await reputationService.getTopAgents(dimension, limit);
    }
  );
}
