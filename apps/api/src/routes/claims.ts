import { FastifyInstance } from 'fastify';

export async function claimRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { project_id: string };
    Querystring: { state?: string };
  }>(
    '/v1/projects/:project_id/claims',
    {
      schema: {
        tags: ['claims'],
        params: {
          type: 'object',
          properties: {
            project_id: { type: 'string', format: 'uuid' },
          },
        },
        querystring: {
          type: 'object',
          properties: {
            state: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { project_id } = request.params;
      const { state } = request.query;
      const { claimService } = fastify.services;
      return await claimService.listClaims(project_id, state as any);
    }
  );

  fastify.post<{
    Body: {
      project_id: string;
      thread_id?: string;
      author_id: string;
      title: string;
      content: string;
    };
  }>(
    '/v1/claims',
    {
      schema: {
        tags: ['claims'],
        body: {
          type: 'object',
          required: ['project_id', 'author_id', 'title', 'content'],
          properties: {
            project_id: { type: 'string', format: 'uuid' },
            thread_id: { type: 'string', format: 'uuid' },
            author_id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            content: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { claimService } = fastify.services;
      return await claimService.createClaim(request.body);
    }
  );

  fastify.post<{
    Body: {
      claim_id: string;
    };
  }>(
    '/v1/claims/publish',
    {
      schema: {
        tags: ['claims'],
        body: {
          type: 'object',
          required: ['claim_id'],
          properties: {
            claim_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { claimService } = fastify.services;
      return await claimService.publishClaim(request.body);
    }
  );

  fastify.post<{
    Body: {
      claim_id: string;
      challenger_id: string;
      content: string;
    };
  }>(
    '/v1/claims/challenge',
    {
      schema: {
        tags: ['claims'],
        body: {
          type: 'object',
          required: ['claim_id', 'challenger_id', 'content'],
          properties: {
            claim_id: { type: 'string', format: 'uuid' },
            challenger_id: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { claimService } = fastify.services;
      return await claimService.challengeClaim(request.body);
    }
  );

  fastify.post<{
    Body: {
      claim_id: string;
      reproducer_id: string;
      reproducer_principal_id: string;
      success: boolean;
      notes?: string;
    };
  }>(
    '/v1/claims/reproduce',
    {
      schema: {
        tags: ['claims'],
        body: {
          type: 'object',
          required: ['claim_id', 'reproducer_id', 'reproducer_principal_id', 'success'],
          properties: {
            claim_id: { type: 'string', format: 'uuid' },
            reproducer_id: { type: 'string', format: 'uuid' },
            reproducer_principal_id: { type: 'string', format: 'uuid' },
            success: { type: 'boolean' },
            notes: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { claimService } = fastify.services;
      return await claimService.reproduceClaim(request.body);
    }
  );

  fastify.get<{
    Params: { claim_id: string };
  }>(
    '/v1/claims/:claim_id',
    {
      schema: {
        tags: ['claims'],
        params: {
          type: 'object',
          properties: {
            claim_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { claim_id } = request.params;
      const { claimService } = fastify.services;
      return await claimService.getClaim(claim_id);
    }
  );

  fastify.get<{
    Params: { claim_id: string };
  }>(
    '/v1/claims/:claim_id/challenges',
    {
      schema: {
        tags: ['claims'],
        params: {
          type: 'object',
          properties: {
            claim_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { claim_id } = request.params;
      const { claimService } = fastify.services;
      return await claimService.getChallenges(claim_id);
    }
  );

  fastify.get<{
    Params: { claim_id: string };
  }>(
    '/v1/claims/:claim_id/reproductions',
    {
      schema: {
        tags: ['claims'],
        params: {
          type: 'object',
          properties: {
            claim_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { claim_id } = request.params;
      const { claimService } = fastify.services;
      return await claimService.getReproductions(claim_id);
    }
  );
}
