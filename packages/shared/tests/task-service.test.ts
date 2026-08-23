import { TaskService } from '../src/services/task-service';
import { createDatabase, Database } from '@arn/database';

describe('TaskService', () => {
  let db: Database;
  let taskService: TaskService;
  let projectId: string;
  let principalId: string;
  let agentId: string;

  beforeAll(async () => {
    db = createDatabase();
    taskService = new TaskService(db);

    const principal = await db.query(
      "INSERT INTO principals (type, name) VALUES ('HUMAN', 'Test User') RETURNING id"
    );
    principalId = principal.rows[0].id;

    const agent = await db.query(
      "INSERT INTO agents (principal_id, name) VALUES ($1, 'Test Agent') RETURNING id",
      [principalId]
    );
    agentId = agent.rows[0].id;

    const project = await db.query(
      "INSERT INTO projects (name, slug, created_by) VALUES ('Test Project', 'test-project', $1) RETURNING id",
      [principalId]
    );
    projectId = project.rows[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Atomic Task Leases', () => {
    it('should acquire a lease atomically', async () => {
      const task = await taskService.createTask({
        project_id: projectId,
        title: 'Test Task',
        description: 'Test Description',
        created_by: principalId,
      });

      const result = await taskService.claimTask({
        task_id: task.id,
        agent_id: agentId,
        lease_duration_minutes: 30,
      });

      expect(result.task.state).toBe('LEASED');
      expect(result.lease.agent_id).toBe(agentId);
    });

    it('should prevent concurrent lease acquisition', async () => {
      const task = await taskService.createTask({
        project_id: projectId,
        title: 'Concurrent Test',
        description: 'Test Description',
        created_by: principalId,
      });

      const agent2Result = await db.query(
        "INSERT INTO agents (principal_id, name) VALUES ($1, 'Agent 2') RETURNING id",
        [principalId]
      );
      const agent2Id = agent2Result.rows[0].id;

      await taskService.claimTask({
        task_id: task.id,
        agent_id: agentId,
      });

      await expect(
        taskService.claimTask({
          task_id: task.id,
          agent_id: agent2Id,
        })
      ).rejects.toThrow('Task not available for claiming');
    });

    it('should return expired lease to OPEN state', async () => {
      const task = await taskService.createTask({
        project_id: projectId,
        title: 'Expiry Test',
        description: 'Test Description',
        created_by: principalId,
      });

      await taskService.claimTask({
        task_id: task.id,
        agent_id: agentId,
        lease_duration_minutes: 0.01,
      });

      await new Promise((resolve) => setTimeout(resolve, 2000));

      const expired = await taskService.expireLeasesAndReopen();
      expect(expired).toBeGreaterThan(0);

      const refreshedTask = await taskService.getTask(task.id);
      expect(refreshedTask.state).toBe('OPEN');
    });
  });

  describe('Idempotent Submissions', () => {
    it('should handle duplicate submissions with idempotency key', async () => {
      const task = await taskService.createTask({
        project_id: projectId,
        title: 'Idempotency Test',
        description: 'Test Description',
        created_by: principalId,
      });

      await taskService.claimTask({
        task_id: task.id,
        agent_id: agentId,
      });

      const idempotencyKey = 'test-key-123';

      const submission1 = await taskService.submitTask({
        task_id: task.id,
        agent_id: agentId,
        content: 'First submission',
        idempotency_key: idempotencyKey,
      });

      const submission2 = await taskService.submitTask({
        task_id: task.id,
        agent_id: agentId,
        content: 'Second submission',
        idempotency_key: idempotencyKey,
      });

      expect(submission1.id).toBe(submission2.id);
      expect(submission1.content).toBe(submission2.content);
    });
  });
});
