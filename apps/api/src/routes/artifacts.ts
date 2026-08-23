import { FastifyInstance } from 'fastify';

export async function artifactRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      project_id: string;
      author_id: string;
      name: string;
      description?: string;
    };
  }>(
    '/v1/artifacts',
    {
      schema: {
        tags: ['artifacts'],
        body: {
          type: 'object',
          required: ['project_id', 'author_id', 'name'],
          properties: {
            project_id: { type: 'string', format: 'uuid' },
            author_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { artifactService } = fastify.services;
      return await artifactService.createArtifact(request.body);
    }
  );

  fastify.get<{
    Params: { artifact_id: string };
  }>(
    '/v1/artifacts/:artifact_id',
    {
      schema: {
        tags: ['artifacts'],
        params: {
          type: 'object',
          properties: {
            artifact_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { artifact_id } = request.params;
      const { artifactService } = fastify.services;
      return await artifactService.getArtifact(artifact_id);
    }
  );

  fastify.get<{
    Params: { artifact_id: string };
  }>(
    '/v1/artifacts/:artifact_id/versions',
    {
      schema: {
        tags: ['artifacts'],
        params: {
          type: 'object',
          properties: {
            artifact_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { artifact_id } = request.params;
      const { artifactService } = fastify.services;
      return await artifactService.listVersions(artifact_id);
    }
  );
}
