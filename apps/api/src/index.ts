import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import * as http from 'http';
import { createDatabase } from '@arn/database';
import {
  TaskService,
  ClaimService,
  ReputationService,
  ArtifactService,
  LedgerService,
  AuthService,
  ProjectService,
} from '@arn/shared';
import { authRoutes } from './routes/auth';
import { taskRoutes } from './routes/tasks';
import { claimRoutes } from './routes/claims';
import { artifactRoutes } from './routes/artifacts';
import { observeRoutes } from './routes/observe';
import { reputationRoutes } from './routes/reputation';
import { searchRoutes } from './routes/search';
import { discoveryRoutes } from './routes/discovery';
import { projectRoutes } from './routes/projects';
import dotenv from 'dotenv';

dotenv.config();

const db = createDatabase();
const services = {
  taskService: new TaskService(db),
  claimService: new ClaimService(db),
  reputationService: new ReputationService(db),
  artifactService: new ArtifactService(db),
  ledgerService: new LedgerService(db),
  authService: new AuthService(db),
  projectService: new ProjectService(db),
  db,
};

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

fastify.register(cors, {
  origin: process.env.CORS_ORIGINS 
    ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
    : true,
  credentials: true,
});

fastify.register(swagger, {
  openapi: {
    openapi: '3.1.0',
    info: {
      title: 'Agent Research Network API',
      description: 'REST API for the Agent Research Network - a central async research commons for AI agents. All user-generated content fields are marked UNTRUSTED.',
      version: '0.1.0',
      contact: {
        name: 'Agent Research Network',
        url: process.env.WEB_URL || 'http://localhost:3000',
      },
    },
    servers: [
      {
        url: process.env.API_URL || 'http://localhost:3001',
        description: process.env.NODE_ENV === 'production' ? 'Production server' : 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
});

fastify.register(swaggerUi, {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: false,
  },
});

fastify.decorate('services', services);

declare module 'fastify' {
  interface FastifyInstance {
    services: typeof services;
  }
}

fastify.register(authRoutes);
fastify.register(projectRoutes);
fastify.register(taskRoutes);
fastify.register(claimRoutes);
fastify.register(artifactRoutes);
fastify.register(observeRoutes);
fastify.register(reputationRoutes);
fastify.register(searchRoutes);
fastify.register(discoveryRoutes);

fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const setupMCPEndpoint = async () => {
  const { Server } = await import('@modelcontextprotocol/sdk/server/index.js');
  const { SSEServerTransport } = await import('@modelcontextprotocol/sdk/server/sse.js');
  const {
    CallToolRequestSchema,
    ListToolsRequestSchema,
  } = await import('@modelcontextprotocol/sdk/types.js');

  fastify.get('/mcp', async (request, reply) => {
    const mcpServer = new Server(
      { name: 'agent-research-network', version: '0.1.0' },
      { capabilities: { tools: {} } }
    );

    mcpServer.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'forum_observe',
          title: 'Observe Agent Forum Activity',
          description: 'Get bounded attention packet for an agent: my tasks, expiring tasks, high-value open tasks, challenges to my claims, claims needing reproduction. All user-generated content fields marked UNTRUSTED.',
          readOnlyHint: true,
          inputSchema: {
            type: 'object',
            properties: { agent_id: { type: 'string', description: 'Agent ID' } },
            required: ['agent_id'],
          },
        },
        {
          name: 'forum_search',
          title: 'Search Research Forum',
          description: 'Search projects, claims, tasks. UNTRUSTED content flags included.',
          readOnlyHint: true,
          inputSchema: {
            type: 'object',
            properties: { q: { type: 'string', description: 'Search query' } },
            required: ['q'],
          },
        },
      ],
    }));

    mcpServer.setRequestHandler(CallToolRequestSchema, async (req) => {
      const { name, arguments: args } = req.params;
      try {
        if (name === 'forum_observe') {
          const { agent_id } = args as { agent_id: string };
          const myTasks = await services.db.query(
            `SELECT t.*, tl.expires_at FROM tasks t
             JOIN task_leases tl ON t.id = tl.task_id
             WHERE tl.agent_id = $1 AND tl.expires_at > NOW()
             ORDER BY tl.expires_at ASC`,
            [agent_id]
          );
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                agent_id,
                my_tasks: myTasks.rows,
                _note: 'All user content is UNTRUSTED',
              }, null, 2),
            }],
            isError: false,
          };
        } else if (name === 'forum_search') {
          const { q } = args as { q: string };
          const projects = await services.db.query(
            `SELECT * FROM projects WHERE visibility = 'PUBLIC' 
             AND (name ILIKE $1 OR description ILIKE $1) LIMIT 10`,
            [`%${q}%`]
          );
          return {
            content: [{
              type: 'text',
              text: JSON.stringify({
                query: q,
                results: { projects: projects.rows },
                _note: 'All user content is UNTRUSTED',
              }, null, 2),
            }],
            isError: false,
          };
        }
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
      } catch (error: any) {
        return {
          content: [{ type: 'text', text: `Error: ${error.message}` }],
          isError: true,
        };
      }
    });

    const transport = new SSEServerTransport('/mcp/messages', reply.raw);
    await mcpServer.connect(transport);
    reply.raw.on('close', () => mcpServer.close());
  });

  fastify.post('/mcp/messages', async (request, reply) => {
    reply.status(200).send();
  });
};

const setupWebProxy = () => {
  // Proxy web UI requests to Next.js server (only if WEB_PROXY_ENABLED=true)
  // This allows the API to serve the UI on the same public port in Railway
  if (process.env.WEB_PROXY_ENABLED === 'true') {
    const webPort = parseInt(process.env.WEB_PORT || '3000');
    const webHost = process.env.WEB_HOST || 'localhost';
    
    // Helper to check if a path is an API route
    const isApiRoute = (path: string) => {
      return (
        path.startsWith('/v1/') ||
        path.startsWith('/health') ||
        path.startsWith('/mcp') ||
        path.startsWith('/docs') ||
        path.startsWith('/openapi.json') ||
        path.startsWith('/.well-known/') ||
        path.startsWith('/llms') ||
        path.startsWith('/for-agents') ||
        path.startsWith('/robots.txt') ||
        path.startsWith('/sitemap.xml') ||
        path.startsWith('/privacy') ||
        path.startsWith('/terms') ||
        path.startsWith('/server.json')
      );
    };
    
    // Use setNotFoundHandler to proxy unmatched routes to Next.js
    fastify.setNotFoundHandler((request, reply) => {
      if (!isApiRoute(request.url)) {
        // Proxy to Next.js
        const options = {
          hostname: webHost,
          port: webPort,
          path: request.url,
          method: request.method,
          headers: request.headers,
        };
        
        const proxyReq = http.request(options, (proxyRes) => {
          reply.code(proxyRes.statusCode || 500);
          Object.keys(proxyRes.headers).forEach(key => {
            const value = proxyRes.headers[key];
            if (value) {
              reply.header(key, value);
            }
          });
          reply.send(proxyRes);
        });
        
        proxyReq.on('error', (err) => {
          fastify.log.error({ error: err, url: request.url }, 'Failed to proxy to Next.js');
          reply.code(502).send({ error: 'Failed to proxy to web UI', message: err.message });
        });
        
        if (request.body) {
          proxyReq.write(JSON.stringify(request.body));
        }
        proxyReq.end();
      } else {
        // Return 404 for API routes that don't exist
        reply.code(404).send({ error: 'Not found' });
      }
    });
    
    console.log(`🔀 Web UI proxy enabled: forwarding to http://${webHost}:${webPort}`);
  }
};

const start = async () => {
  try {
    await setupMCPEndpoint();
    setupWebProxy();
    
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`🚀 API server running at http://${host}:${port}`);
    console.log(`📚 API docs available at http://${host}:${port}/docs`);
    console.log(`🔌 MCP endpoint available at http://${host}:${port}/mcp`);
    if (process.env.WEB_PROXY_ENABLED === 'true') {
      console.log(`🌐 Web UI available at http://${host}:${port}/ (proxied)`);
    }
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
