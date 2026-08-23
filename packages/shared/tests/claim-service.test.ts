import { ClaimService } from '../src/services/claim-service';
import { AuthService } from '../src/services/auth-service';
import { createDatabase, Database } from '@arn/database';

describe('ClaimService', () => {
  let db: Database;
  let claimService: ClaimService;
  let authService: AuthService;
  let projectId: string;
  let principal1Id: string;
  let principal2Id: string;
  let agent1Id: string;
  let agent2Id: string;

  beforeAll(async () => {
    db = createDatabase();
    claimService = new ClaimService(db);
    authService = new AuthService(db);

    const principal1 = await authService.createPrincipal({
      type: 'HUMAN',
      name: 'User 1',
    });
    principal1Id = principal1.id;

    const principal2 = await authService.createPrincipal({
      type: 'HUMAN',
      name: 'User 2',
    });
    principal2Id = principal2.id;

    const agent1 = await authService.createAgent({
      principal_id: principal1Id,
      name: 'Agent 1',
    });
    agent1Id = agent1.id;

    const agent2 = await authService.createAgent({
      principal_id: principal2Id,
      name: 'Agent 2',
    });
    agent2Id = agent2.id;

    const project = await db.query(
      "INSERT INTO projects (name, slug, created_by) VALUES ('Test Project', 'test-claims', $1) RETURNING id",
      [principal1Id]
    );
    projectId = project.rows[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Independence Tracking', () => {
    it('should assign zero independence weight to same-owner reproduction', async () => {
      const claim = await claimService.createClaim({
        project_id: projectId,
        author_id: agent1Id,
        title: 'Test Claim',
        content: 'Test content',
      });

      await claimService.publishClaim({ claim_id: claim.id });

      const reproduction = await claimService.reproduceClaim({
        claim_id: claim.id,
        reproducer_id: agent1Id,
        reproducer_principal_id: principal1Id,
        success: true,
      });

      expect(reproduction.independence_weight).toBe(0.0);
    });

    it('should assign full independence weight to different-owner reproduction', async () => {
      const claim = await claimService.createClaim({
        project_id: projectId,
        author_id: agent1Id,
        title: 'Test Claim 2',
        content: 'Test content',
      });

      await claimService.publishClaim({ claim_id: claim.id });

      const reproduction = await claimService.reproduceClaim({
        claim_id: claim.id,
        reproducer_id: agent2Id,
        reproducer_principal_id: principal2Id,
        success: true,
      });

      expect(reproduction.independence_weight).toBe(1.0);
    });

    it('should update claim state based on independent reproductions', async () => {
      const claim = await claimService.createClaim({
        project_id: projectId,
        author_id: agent1Id,
        title: 'State Change Test',
        content: 'Test content',
      });

      await claimService.publishClaim({ claim_id: claim.id });

      const agent3 = await authService.createAgent({
        principal_id: principal2Id,
        name: 'Agent 3',
      });

      await claimService.reproduceClaim({
        claim_id: claim.id,
        reproducer_id: agent2Id,
        reproducer_principal_id: principal2Id,
        success: true,
      });

      await claimService.reproduceClaim({
        claim_id: claim.id,
        reproducer_id: agent3.id,
        reproducer_principal_id: principal2Id,
        success: true,
      });

      const updatedClaim = await claimService.getClaim(claim.id);
      expect(updatedClaim.state).toBe('SUPPORTED');
    });
  });
});
