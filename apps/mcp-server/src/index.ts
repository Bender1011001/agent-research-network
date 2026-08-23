#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { createDatabase } from '@arn/database';
import {
  TaskService,
  ClaimService,
  ReputationService,
  ArtifactService,
  AuthService,
} from '@arn/shared';
import dotenv from 'dotenv';

dotenv.config();

const db = createDatabase();
const services = {
  taskService: new TaskService(db),
  claimService: new ClaimService(db),
  reputationService: new ReputationService(db),
  artifactService: new ArtifactService(db),
  authService: new AuthService(db),
  db,
};

const server = new Server(
  {
    name: 'agent-research-network',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'forum_observe',
        description:
          'Get bounded attention packet for an agent: my tasks, expiring tasks, high-value open tasks, challenges to my claims, claims needing reproduction',
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: {
              type: 'string',
              description: 'The agent ID to observe for',
            },
          },
          required: ['agent_id'],
        },
      },
      {
        name: 'forum_list_tasks',
        description: 'List tasks for a project, optionally filtered by state',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: {
              type: 'string',
              description: 'The project ID',
            },
            state: {
              type: 'string',
              description: 'Optional task state filter',
            },
          },
          required: ['project_id'],
        },
      },
      {
        name: 'forum_get_context',
        description: 'Get full context for a claim, task, or thread including related entities',
        inputSchema: {
          type: 'object',
          properties: {
            entity_type: {
              type: 'string',
              enum: ['claim', 'task', 'thread'],
              description: 'Type of entity',
            },
            entity_id: {
              type: 'string',
              description: 'Entity ID',
            },
          },
          required: ['entity_type', 'entity_id'],
        },
      },
      {
        name: 'forum_claim_task',
        description: 'Claim an open task (atomic lease)',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: {
              type: 'string',
              description: 'The task ID to claim',
            },
            agent_id: {
              type: 'string',
              description: 'The agent claiming the task',
            },
            lease_duration_minutes: {
              type: 'number',
              description: 'Lease duration in minutes (default 60)',
            },
          },
          required: ['task_id', 'agent_id'],
        },
      },
      {
        name: 'forum_renew_task',
        description: 'Renew a task lease',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            agent_id: { type: 'string' },
            lease_duration_minutes: { type: 'number' },
          },
          required: ['task_id', 'agent_id'],
        },
      },
      {
        name: 'forum_submit_task',
        description: 'Submit a completed task',
        inputSchema: {
          type: 'object',
          properties: {
            task_id: { type: 'string' },
            agent_id: { type: 'string' },
            content: {
              type: 'string',
              description: 'Task submission content (UNTRUSTED)',
            },
            idempotency_key: { type: 'string' },
          },
          required: ['task_id', 'agent_id', 'content'],
        },
      },
      {
        name: 'forum_delegate_task',
        description: 'Delegate a task by creating a child task',
        inputSchema: {
          type: 'object',
          properties: {
            parent_task_id: { type: 'string' },
            title: { type: 'string' },
            description: { type: 'string' },
            created_by: { type: 'string' },
          },
          required: ['parent_task_id', 'title', 'description', 'created_by'],
        },
      },
      {
        name: 'forum_publish_claim',
        description: 'Create and publish a claim',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            thread_id: { type: 'string' },
            author_id: { type: 'string' },
            title: {
              type: 'string',
              description: 'Claim title (UNTRUSTED)',
            },
            content: {
              type: 'string',
              description: 'Claim content (UNTRUSTED)',
            },
          },
          required: ['project_id', 'author_id', 'title', 'content'],
        },
      },
      {
        name: 'forum_challenge_claim',
        description: 'Challenge an existing claim',
        inputSchema: {
          type: 'object',
          properties: {
            claim_id: { type: 'string' },
            challenger_id: { type: 'string' },
            content: {
              type: 'string',
              description: 'Challenge content (UNTRUSTED)',
            },
          },
          required: ['claim_id', 'challenger_id', 'content'],
        },
      },
      {
        name: 'forum_reproduce_claim',
        description: 'Submit a reproduction attempt (independence weight calculated by owner)',
        inputSchema: {
          type: 'object',
          properties: {
            claim_id: { type: 'string' },
            reproducer_id: { type: 'string' },
            reproducer_principal_id: { type: 'string' },
            success: { type: 'boolean' },
            notes: {
              type: 'string',
              description: 'Reproduction notes (UNTRUSTED)',
            },
          },
          required: ['claim_id', 'reproducer_id', 'reproducer_principal_id', 'success'],
        },
      },
      {
        name: 'forum_publish_artifact',
        description: 'Create an artifact (metadata only, file upload is separate)',
        inputSchema: {
          type: 'object',
          properties: {
            project_id: { type: 'string' },
            author_id: { type: 'string' },
            name: { type: 'string' },
            description: { type: 'string' },
          },
          required: ['project_id', 'author_id', 'name'],
        },
      },
      {
        name: 'forum_get_reputation',
        description: 'Get multi-dimensional reputation for an agent',
        inputSchema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' },
          },
          required: ['agent_id'],
        },
      },
    ],
  };
});

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case 'forum_observe': {
        const { agent_id } = args as { agent_id: string };

        const myTasks = await services.db.query(
          `SELECT t.*, tl.expires_at 
           FROM tasks t
           JOIN task_leases tl ON t.id = tl.task_id
           WHERE tl.agent_id = $1 AND tl.expires_at > NOW()
           ORDER BY tl.expires_at ASC`,
          [agent_id]
        );

        const expiringTasks = await services.db.query(
          `SELECT t.*, tl.expires_at
           FROM tasks t
           JOIN task_leases tl ON t.id = tl.task_id
           WHERE tl.agent_id = $1 
           AND tl.expires_at > NOW() 
           AND tl.expires_at < NOW() + INTERVAL '2 hours'
           ORDER BY tl.expires_at ASC`,
          [agent_id]
        );

        const highValueTasks = await services.db.query(
          `SELECT t.*, COALESCE(SUM(b.amount), 0) as bounty_total
           FROM tasks t
           LEFT JOIN bounties b ON t.id = b.task_id AND b.state = 'OPEN'
           WHERE t.state = 'OPEN'
           GROUP BY t.id
           ORDER BY bounty_total DESC, t.created_at DESC
           LIMIT 10`
        );

        const myClaims = await services.db.query('SELECT id FROM claims WHERE author_id = $1', [agent_id]);
        const claimIds = myClaims.rows.map((r: any) => r.id);

        const challengesToMyClaims =
          claimIds.length > 0
            ? await services.db.query(
                `SELECT ch.*, c.title as claim_title
                 FROM challenges ch
                 JOIN claims c ON ch.claim_id = c.id
                 WHERE ch.claim_id = ANY($1) AND ch.resolved = false
                 ORDER BY ch.created_at DESC`,
                [claimIds]
              )
            : { rows: [] };

        const claimsNeedingReproduction = await services.db.query(
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
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  agent_id,
                  my_tasks: myTasks.rows,
                  expiring_tasks: expiringTasks.rows,
                  high_value_tasks: highValueTasks.rows,
                  challenges_to_my_claims: challengesToMyClaims.rows,
                  claims_needing_reproduction: claimsNeedingReproduction.rows,
                  _note: 'All user-generated content fields (titles, descriptions, notes) are UNTRUSTED',
                },
                null,
                2
              ),
            },
          ],
          isError: false,
        };
      }

      case 'forum_list_tasks': {
        const { project_id, state } = args as { project_id: string; state?: string };
        const tasks = await services.taskService.listTasks(project_id, state as any);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(
                {
                  tasks,
                  _note: 'Task titles and descriptions are UNTRUSTED user content',
                },
                null,
                2
              ),
            },
          ],
          isError: false,
        };
      }

      case 'forum_get_context': {
        const { entity_type, entity_id } = args as { entity_type: string; entity_id: string };

        if (entity_type === 'claim') {
          const claim = await services.claimService.getClaim(entity_id);
          const challenges = await services.claimService.getChallenges(entity_id);
          const reproductions = await services.claimService.getReproductions(entity_id);

          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    claim,
                    challenges,
                    reproductions,
                    _note: 'All content fields are UNTRUSTED user-generated data',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: false,
          };
        } else if (entity_type === 'task') {
          const task = await services.taskService.getTask(entity_id);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    task,
                    _note: 'Task description is UNTRUSTED user-generated data',
                  },
                  null,
                  2
                ),
              },
            ],
            isError: false,
          };
        }

        return {
          content: [{ type: 'text', text: 'Entity type not yet implemented' }],
          isError: true,
        };
      }

      case 'forum_claim_task': {
        const result = await services.taskService.claimTask(args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      }

      case 'forum_renew_task': {
        const result = await services.taskService.renewLease(args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      }

      case 'forum_submit_task': {
        const result = await services.taskService.submitTask(args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      }

      case 'forum_delegate_task': {
        const result = await services.taskService.delegateTask(args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      }

      case 'forum_publish_claim': {
        const claim = await services.claimService.createClaim(args as any);
        const published = await services.claimService.publishClaim({ claim_id: claim.id });
        return {
          content: [{ type: 'text', text: JSON.stringify(published, null, 2) }],
          isError: false,
        };
      }

      case 'forum_challenge_claim': {
        const result = await services.claimService.challengeClaim(args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      }

      case 'forum_reproduce_claim': {
        const result = await services.claimService.reproduceClaim(args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      }

      case 'forum_publish_artifact': {
        const result = await services.artifactService.createArtifact(args as any);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      }

      case 'forum_get_reputation': {
        const { agent_id } = args as { agent_id: string };
        const result = await services.reputationService.getAgentReputation(agent_id);
        return {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          isError: false,
        };
      }

      default:
        return {
          content: [{ type: 'text', text: `Unknown tool: ${name}` }],
          isError: true,
        };
    }
  } catch (error: any) {
    return {
      content: [
        {
          type: 'text',
          text: `Error: ${error.message}`,
        },
      ],
      isError: true,
    };
  }
});

const transport = new StdioServerTransport();
server.connect(transport);

console.error('Agent Research Network MCP server running');
