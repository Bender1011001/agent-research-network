import { Database } from '@arn/database';
import type { Task, TaskLease, TaskSubmission, TaskState } from '@arn/database';

export interface CreateTaskInput {
  project_id: string;
  thread_id?: string;
  parent_task_id?: string;
  title: string;
  description: string;
  created_by: string;
}

export interface ClaimTaskInput {
  task_id: string;
  agent_id: string;
  lease_duration_minutes?: number;
}

export interface RenewLeaseInput {
  task_id: string;
  agent_id: string;
  lease_duration_minutes?: number;
}

export interface SubmitTaskInput {
  task_id: string;
  agent_id: string;
  content: string;
  idempotency_key?: string;
}

export interface DelegateTaskInput {
  parent_task_id: string;
  title: string;
  description: string;
  created_by: string;
}

export class TaskService {
  constructor(private db: Database) {}

  async createTask(input: CreateTaskInput): Promise<Task> {
    return this.db.transaction(async (client) => {
      const result = await client.query<Task>(
        `INSERT INTO tasks (project_id, thread_id, parent_task_id, title, description, created_by)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.project_id,
          input.thread_id || null,
          input.parent_task_id || null,
          input.title,
          input.description,
          input.created_by,
        ]
      );

      const task = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['task.created', 'task', task.id, JSON.stringify(task)]
      );

      return task;
    });
  }

  async claimTask(input: ClaimTaskInput): Promise<{ task: Task; lease: TaskLease }> {
    const leaseDuration = input.lease_duration_minutes || 60;
    
    return this.db.transaction(async (client) => {
      await client.query('DELETE FROM task_leases WHERE expires_at < NOW()');

      const taskResult = await client.query<Task>(
        `UPDATE tasks 
         SET state = 'LEASED', updated_at = NOW()
         WHERE id = $1 AND state = 'OPEN'
         RETURNING *`,
        [input.task_id]
      );

      if (taskResult.rows.length === 0) {
        throw new Error('Task not available for claiming');
      }

      const task = taskResult.rows[0];

      const leaseResult = await client.query<TaskLease>(
        `INSERT INTO task_leases (task_id, agent_id, expires_at)
         VALUES ($1, $2, NOW() + INTERVAL '${leaseDuration} minutes')
         ON CONFLICT (task_id) DO NOTHING
         RETURNING *`,
        [input.task_id, input.agent_id]
      );

      if (leaseResult.rows.length === 0) {
        throw new Error('Failed to acquire lease (race condition)');
      }

      const lease = leaseResult.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          'task.claimed',
          'task',
          task.id,
          JSON.stringify({ task_id: task.id, agent_id: input.agent_id, expires_at: lease.expires_at }),
        ]
      );

      return { task, lease };
    });
  }

  async renewLease(input: RenewLeaseInput): Promise<TaskLease> {
    const leaseDuration = input.lease_duration_minutes || 60;

    return this.db.transaction(async (client) => {
      const result = await client.query<TaskLease>(
        `UPDATE task_leases
         SET expires_at = NOW() + INTERVAL '${leaseDuration} minutes',
             renewed_at = NOW()
         WHERE task_id = $1 AND agent_id = $2 AND expires_at > NOW()
         RETURNING *`,
        [input.task_id, input.agent_id]
      );

      if (result.rows.length === 0) {
        throw new Error('Lease not found or expired');
      }

      const lease = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['task.lease_renewed', 'task', input.task_id, JSON.stringify(lease)]
      );

      return lease;
    });
  }

  async submitTask(input: SubmitTaskInput): Promise<TaskSubmission> {
    return this.db.transaction(async (client) => {
      if (input.idempotency_key) {
        const existing = await client.query<TaskSubmission>(
          `SELECT ts.* FROM task_submissions ts
           JOIN event_log el ON el.aggregate_id = ts.id
           WHERE ts.task_id = $1 AND ts.agent_id = $2 
           AND el.metadata->>'idempotency_key' = $3`,
          [input.task_id, input.agent_id, input.idempotency_key]
        );

        if (existing.rows.length > 0) {
          return existing.rows[0];
        }
      }

      const leaseCheck = await client.query(
        `SELECT * FROM task_leases 
         WHERE task_id = $1 AND agent_id = $2 AND expires_at > NOW()`,
        [input.task_id, input.agent_id]
      );

      if (leaseCheck.rows.length === 0) {
        throw new Error('Valid lease required to submit task');
      }

      await client.query(
        `UPDATE tasks SET state = 'SUBMITTED', updated_at = NOW()
         WHERE id = $1`,
        [input.task_id]
      );

      const result = await client.query<TaskSubmission>(
        `INSERT INTO task_submissions (task_id, agent_id, content)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.task_id, input.agent_id, input.content]
      );

      const submission = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload, metadata)
         VALUES ($1, $2, $3, $4, $5)`,
        [
          'task.submitted',
          'task_submission',
          submission.id,
          JSON.stringify(submission),
          JSON.stringify({ idempotency_key: input.idempotency_key || null }),
        ]
      );

      await client.query(
        `INSERT INTO reputation_events (agent_id, event_type, dimension, value, weight, reference_type, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [input.agent_id, 'task_submitted', 'task_reliability', 0.5, 0.1, 'task_submission', submission.id]
      );

      return submission;
    });
  }

  async delegateTask(input: DelegateTaskInput): Promise<Task> {
    return this.createTask({
      project_id: (await this.getTask(input.parent_task_id)).project_id,
      parent_task_id: input.parent_task_id,
      title: input.title,
      description: input.description,
      created_by: input.created_by,
    });
  }

  async getTask(taskId: string): Promise<Task> {
    const result = await this.db.query<Task>('SELECT * FROM tasks WHERE id = $1', [taskId]);
    if (result.rows.length === 0) {
      throw new Error('Task not found');
    }
    return result.rows[0];
  }

  async listTasks(projectId: string, state?: TaskState): Promise<Task[]> {
    const query = state
      ? 'SELECT * FROM tasks WHERE project_id = $1 AND state = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM tasks WHERE project_id = $1 ORDER BY created_at DESC';
    
    const params = state ? [projectId, state] : [projectId];
    const result = await this.db.query<Task>(query, params);
    return result.rows;
  }

  async expireLeasesAndReopen(): Promise<number> {
    return this.db.transaction(async (client) => {
      const expired = await client.query<{ task_id: string }>(
        `DELETE FROM task_leases WHERE expires_at < NOW() RETURNING task_id`
      );

      if (expired.rows.length > 0) {
        await client.query(
          `UPDATE tasks SET state = 'OPEN', updated_at = NOW()
           WHERE id = ANY($1) AND state = 'LEASED'`,
          [expired.rows.map((r) => r.task_id)]
        );

        for (const row of expired.rows) {
          await client.query(
            `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
             VALUES ($1, $2, $3, $4)`,
            ['task.lease_expired', 'task', row.task_id, JSON.stringify({ task_id: row.task_id })]
          );
        }
      }

      return expired.rows.length;
    });
  }
}
