import { FastifyInstance } from 'fastify';

export async function authRoutes(fastify: FastifyInstance) {
  fastify.post<{
    Body: {
      name: string;
      email: string;
      password: string;
      agent_name?: string;
    };
  }>(
    '/v1/auth/register',
    {
      schema: {
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['name', 'email', 'password'],
          properties: {
            name: { type: 'string' },
            email: { type: 'string', format: 'email' },
            password: { type: 'string', minLength: 8 },
            agent_name: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              principal: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  type: { type: 'string' },
                  name: { type: 'string' },
                  email: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                  updated_at: { type: 'string', format: 'date-time' },
                },
                required: ['id'],
              },
              account: {
                type: 'object',
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  principal_id: { type: 'string', format: 'uuid' },
                  email: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                },
                required: ['id'],
              },
              agent: {
                type: ['object', 'null'],
                properties: {
                  id: { type: 'string', format: 'uuid' },
                  principal_id: { type: 'string', format: 'uuid' },
                  name: { type: 'string' },
                  description: { type: 'string' },
                  created_at: { type: 'string', format: 'date-time' },
                  updated_at: { type: 'string', format: 'date-time' },
                },
              },
              token: { type: 'string' },
            },
            required: ['principal', 'account', 'token'],
          },
        },
      },
    },
    async (request, reply) => {
      const { name, email, password, agent_name } = request.body;
      const { authService } = fastify.services;

      const principal = await authService.createPrincipal({
        type: 'HUMAN',
        name,
        email,
      });

      const account = await authService.createAccount({
        principal_id: principal.id,
        email,
        password,
      });

      let agent = null;
      if (agent_name) {
        agent = await authService.createAgent({
          principal_id: principal.id,
          name: agent_name,
        });
      }

      const { token } = await authService.createToken({
        account_id: account.id,
        scopes: ['forum:read', 'thread:write', 'claim:publish', 'task:claim'],
      });

      return {
        principal,
        account: { ...account, password_hash: undefined },
        agent,
        token,
      };
    }
  );

  fastify.post<{
    Body: {
      email: string;
      password: string;
    };
  }>(
    '/v1/auth/login',
    {
      schema: {
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: { type: 'string', format: 'email' },
            password: { type: 'string' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              token: { type: 'string' },
              account: { type: 'object' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const { email, password } = request.body;
      const { authService } = fastify.services;

      const account = await authService.getAccountByEmail(email);
      if (!account) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const crypto = await import('crypto');
      const passwordHash = crypto.createHash('sha256').update(password).digest('hex');

      if (account.password_hash !== passwordHash) {
        return reply.code(401).send({ error: 'Invalid credentials' });
      }

      const { token } = await authService.createToken({
        account_id: account.id,
        scopes: ['forum:read', 'thread:write', 'claim:publish', 'task:claim'],
      });

      return {
        token,
        account: { ...account, password_hash: undefined },
      };
    }
  );

  fastify.post<{
    Body: {
      principal_id: string;
      name: string;
      description?: string;
    };
  }>(
    '/v1/agents',
    {
      schema: {
        tags: ['auth'],
        body: {
          type: 'object',
          required: ['principal_id', 'name'],
          properties: {
            principal_id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            description: { type: 'string' },
          },
        },
      },
    },
    async (request) => {
      const { authService } = fastify.services;
      return await authService.createAgent(request.body);
    }
  );

  fastify.get('/v1/agents/:agent_id', async (request) => {
    const { agent_id } = request.params as { agent_id: string };
    const { authService } = fastify.services;
    return await authService.getAgent(agent_id);
  });
}
