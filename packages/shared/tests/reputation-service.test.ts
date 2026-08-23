import { ReputationService } from '../src/services/reputation-service';
import { createDatabase, Database } from '@arn/database';

describe('ReputationService', () => {
  let db: Database;
  let reputationService: ReputationService;
  let agentId: string;

  beforeAll(async () => {
    db = createDatabase();
    reputationService = new ReputationService(db);

    const principal = await db.query(
      "INSERT INTO principals (type, name) VALUES ('HUMAN', 'Test User') RETURNING id"
    );

    const agent = await db.query(
      "INSERT INTO agents (principal_id, name) VALUES ($1, 'Test Agent') RETURNING id",
      [principal.rows[0].id]
    );
    agentId = agent.rows[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Reputation Rebuild from Events', () => {
    it('should rebuild reputation from event log', async () => {
      await reputationService.recordEvent({
        agent_id: agentId,
        event_type: 'task_completed',
        dimension: 'task_reliability',
        domain_tag: null,
        value: 1.0,
        weight: 1.0,
        reference_type: 'task',
        reference_id: null,
        metadata: {},
      });

      await reputationService.recordEvent({
        agent_id: agentId,
        event_type: 'task_completed',
        dimension: 'task_reliability',
        domain_tag: null,
        value: 0.8,
        weight: 1.0,
        reference_type: 'task',
        reference_id: null,
        metadata: {},
      });

      await reputationService.rebuildReputation(agentId);

      const reputation = await reputationService.getAgentReputation(agentId);
      const reliabilityScore = reputation.scores.find(
        (s) => s.dimension === 'task_reliability'
      );

      expect(reliabilityScore).toBeDefined();
      expect(reliabilityScore!.score).toBeGreaterThan(0.5);
      expect(reliabilityScore!.effective_n).toBeGreaterThan(0);
    });

    it('should calculate Bayesian score with priors', async () => {
      const agent2 = await db.query(
        "INSERT INTO agents (principal_id, name) VALUES ((SELECT id FROM principals LIMIT 1), 'New Agent') RETURNING id"
      );
      const newAgentId = agent2.rows[0].id;

      await reputationService.recordEvent({
        agent_id: newAgentId,
        event_type: 'task_completed',
        dimension: 'accuracy',
        domain_tag: null,
        value: 1.0,
        weight: 1.0,
        reference_type: 'task',
        reference_id: null,
        metadata: {},
      });

      await reputationService.rebuildReputation(newAgentId);

      const reputation = await reputationService.getAgentReputation(newAgentId);
      const accuracyScore = reputation.scores.find((s) => s.dimension === 'accuracy');

      expect(accuracyScore!.score).toBeLessThan(1.0);
      expect(accuracyScore!.uncertainty).toBeGreaterThan(0);
    });
  });
});
