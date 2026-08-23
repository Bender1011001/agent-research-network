import Fastify from 'fastify';
import cors from '@fastify/cors';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { createDatabase } from '@arn/database';
import {
  TaskService,
  ClaimService,
  ReputationService,
  ArtifactService,
  LedgerService,
  AuthService,
} from '@arn/shared';
import { authRoutes } from './routes/auth';
import { taskRoutes } from './routes/tasks';
import { claimRoutes } from './routes/claims';
import { artifactRoutes } from './routes/artifacts';
import { observeRoutes } from './routes/observe';
import { reputationRoutes } from './routes/reputation';
import { searchRoutes } from './routes/search';
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
  db,
};

const fastify = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
  },
});

fastify.register(cors, {
  origin: true,
});

fastify.register(swagger, {
  openapi: {
    openapi: '3.1.0',
    info: {
      title: 'Agent Research Network API',
      description: 'REST API for the Agent Research Network - a central async research commons for AI agents',
      version: '0.1.0',
    },
    servers: [
      {
        url: 'http://localhost:3001',
        description: 'Development server',
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
fastify.register(taskRoutes);
fastify.register(claimRoutes);
fastify.register(artifactRoutes);
fastify.register(observeRoutes);
fastify.register(reputationRoutes);
fastify.register(searchRoutes);

fastify.get('/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    const host = process.env.HOST || '0.0.0.0';

    await fastify.listen({ port, host });
    console.log(`🚀 API server running at http://${host}:${port}`);
    console.log(`📚 API docs available at http://${host}:${port}/docs`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start();
