import { FastifyInstance } from 'fastify';

export async function projectRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      name: string;
      slug?: string;
      description?: string;
      visibility?: 'PUBLIC' | 'PRIVATE';
      created_by: string;
    };
  }>(
    '/v1/projects',
    {
      schema: {
        tags: ['projects'],
        description: 'Create a new research project',
        body: {
          type: 'object',
          required: ['name', 'created_by'],
          properties: {
            name: { type: 'string', minLength: 1, maxLength: 200 },
            slug: { 
              type: 'string', 
              pattern: '^[a-z0-9-]+$',
              description: 'URL-friendly identifier (auto-generated if not provided)'
            },
            description: { type: 'string', maxLength: 2000 },
            visibility: { 
              type: 'string', 
              enum: ['PUBLIC', 'PRIVATE'],
              default: 'PUBLIC'
            },
            created_by: { 
              type: 'string', 
              format: 'uuid',
              description: 'Principal ID of the creator'
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              slug: { type: 'string' },
              description: { type: 'string', nullable: true },
              visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
              created_by: { type: 'string', format: 'uuid' },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request) => {
      const { projectService } = fastify.services;
      return await projectService.createProject(request.body);
    }
  );

  fastify.get<{
    Querystring: { 
      visibility?: 'PUBLIC' | 'PRIVATE';
      limit?: number;
    };
  }>(
    '/v1/projects',
    {
      schema: {
        tags: ['projects'],
        description: 'List projects (defaults to public projects)',
        querystring: {
          type: 'object',
          properties: {
            visibility: { 
              type: 'string', 
              enum: ['PUBLIC', 'PRIVATE'],
              description: 'Filter by visibility (omit to show all public projects)'
            },
            limit: { 
              type: 'number', 
              minimum: 1, 
              maximum: 100,
              default: 50
            },
          },
        },
        response: {
          200: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                id: { type: 'string', format: 'uuid' },
                name: { type: 'string' },
                slug: { type: 'string' },
                description: { type: 'string', nullable: true },
                visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
                created_by: { type: 'string', format: 'uuid' },
                created_at: { type: 'string', format: 'date-time' },
                updated_at: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
    },
    async (request) => {
      const { visibility, limit } = request.query;
      const { projectService } = fastify.services;
      return await projectService.listProjects(visibility, limit || 50);
    }
  );

  fastify.get<{
    Params: { id: string };
  }>(
    '/v1/projects/:id',
    {
      schema: {
        tags: ['projects'],
        description: 'Get a project by ID',
        params: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              name: { type: 'string' },
              slug: { type: 'string' },
              description: { type: 'string', nullable: true },
              visibility: { type: 'string', enum: ['PUBLIC', 'PRIVATE'] },
              created_by: { type: 'string', format: 'uuid' },
              created_at: { type: 'string', format: 'date-time' },
              updated_at: { type: 'string', format: 'date-time' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { id } = request.params;
      const { projectService } = fastify.services;
      const project = await projectService.getProject(id);
      
      if (!project) {
        return reply.code(404).send({ error: 'Project not found' });
      }
      
      return project;
    }
  );
}
