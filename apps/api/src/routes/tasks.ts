import { FastifyInstance } from 'fastify';

export async function taskRoutes(fastify: FastifyInstance) {
  fastify.get<{
    Params: { project_id: string };
    Querystring: { state?: string };
  }>(
    '/v1/projects/:project_id/tasks',
    {
      schema: {
        tags: ['tasks'],
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
      const { taskService } = fastify.services;
      return await taskService.listTasks(project_id, state as any);
    }
  );

  fastify.post<{
    Body: {
      project_id: string;
      thread_id?: string;
      title: string;
      description: string;
      created_by: string;
    };
  }>(
    '/v1/tasks',
    {
      schema: {
        tags: ['tasks'],
        body: {
          type: 'object',
          required: ['project_id', 'title', 'description', 'created_by'],
          properties: {
            project_id: { type: 'string', format: 'uuid' },
            thread_id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            created_by: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { taskService } = fastify.services;
      return await taskService.createTask(request.body);
    }
  );

  fastify.post<{
    Body: {
      task_id: string;
      agent_id: string;
      lease_duration_minutes?: number;
    };
    Headers: {
      'idempotency-key'?: string;
    };
  }>(
    '/v1/tasks/claim',
    {
      schema: {
        tags: ['tasks'],
        body: {
          type: 'object',
          required: ['task_id', 'agent_id'],
          properties: {
            task_id: { type: 'string', format: 'uuid' },
            agent_id: { type: 'string', format: 'uuid' },
            lease_duration_minutes: { type: 'number', minimum: 1, maximum: 1440 },
          },
        },
        headers: {
          type: 'object',
          properties: {
            'idempotency-key': { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { taskService } = fastify.services;
      return await taskService.claimTask(request.body);
    }
  );

  fastify.post<{
    Body: {
      task_id: string;
      agent_id: string;
      lease_duration_minutes?: number;
    };
  }>(
    '/v1/tasks/renew',
    {
      schema: {
        tags: ['tasks'],
        body: {
          type: 'object',
          required: ['task_id', 'agent_id'],
          properties: {
            task_id: { type: 'string', format: 'uuid' },
            agent_id: { type: 'string', format: 'uuid' },
            lease_duration_minutes: { type: 'number', minimum: 1, maximum: 1440 },
          },
        },
      },
    },
    async (request) => {
      const { taskService } = fastify.services;
      return await taskService.renewLease(request.body);
    }
  );

  fastify.post<{
    Body: {
      task_id: string;
      agent_id: string;
      content: string;
    };
    Headers: {
      'idempotency-key'?: string;
    };
  }>(
    '/v1/tasks/submit',
    {
      schema: {
        tags: ['tasks'],
        body: {
          type: 'object',
          required: ['task_id', 'agent_id', 'content'],
          properties: {
            task_id: { type: 'string', format: 'uuid' },
            agent_id: { type: 'string', format: 'uuid' },
            content: { type: 'string' },
          },
        },
        headers: {
          type: 'object',
          properties: {
            'idempotency-key': { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { taskService } = fastify.services;
      const idempotencyKey = request.headers['idempotency-key'];
      return await taskService.submitTask({
        ...request.body,
        idempotency_key: idempotencyKey,
      });
    }
  );

  fastify.post<{
    Body: {
      parent_task_id: string;
      title: string;
      description: string;
      created_by: string;
    };
  }>(
    '/v1/tasks/delegate',
    {
      schema: {
        tags: ['tasks'],
        body: {
          type: 'object',
          required: ['parent_task_id', 'title', 'description', 'created_by'],
          properties: {
            parent_task_id: { type: 'string', format: 'uuid' },
            title: { type: 'string' },
            description: { type: 'string' },
            created_by: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { taskService } = fastify.services;
      return await taskService.delegateTask(request.body);
    }
  );

  fastify.get<{
    Params: { task_id: string };
  }>(
    '/v1/tasks/:task_id',
    {
      schema: {
        tags: ['tasks'],
        params: {
          type: 'object',
          properties: {
            task_id: { type: 'string', format: 'uuid' },
          },
        },
      },
    },
    async (request) => {
      const { task_id } = request.params;
      const { taskService } = fastify.services;
      return await taskService.getTask(task_id);
    }
  );
}
