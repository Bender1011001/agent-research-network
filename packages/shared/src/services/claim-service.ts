import { Database, TransactionClient } from '@arn/database';
import type { Claim, ClaimState, Challenge, Reproduction } from '@arn/database';

export interface CreateClaimInput {
  project_id: string;
  thread_id?: string;
  author_id: string;
  title: string;
  content: string;
}

export interface PublishClaimInput {
  claim_id: string;
}

export interface ChallengeClaimInput {
  claim_id: string;
  challenger_id: string;
  content: string;
}

export interface ReproduceClaimInput {
  claim_id: string;
  reproducer_id: string;
  reproducer_principal_id: string;
  success: boolean;
  notes?: string;
}

export interface ResolveChallenge {
  challenge_id: string;
  resolution: string;
}

export class ClaimService {
  constructor(private db: Database) {}

  async createClaim(input: CreateClaimInput): Promise<Claim> {
    return this.db.transaction(async (client) => {
      const result = await client.query<Claim>(
        `INSERT INTO claims (project_id, thread_id, author_id, title, content, state)
         VALUES ($1, $2, $3, $4, $5, 'DRAFT')
         RETURNING *`,
        [input.project_id, input.thread_id || null, input.author_id, input.title, input.content]
      );

      const claim = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['claim.created', 'claim', claim.id, JSON.stringify(claim)]
      );

      return claim;
    });
  }

  async publishClaim(input: PublishClaimInput): Promise<Claim> {
    return this.db.transaction(async (client) => {
      const result = await client.query<Claim>(
        `UPDATE claims SET state = 'OPEN', updated_at = NOW()
         WHERE id = $1 AND state = 'DRAFT'
         RETURNING *`,
        [input.claim_id]
      );

      if (result.rows.length === 0) {
        throw new Error('Claim not found or not in DRAFT state');
      }

      const claim = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['claim.published', 'claim', claim.id, JSON.stringify(claim)]
      );

      return claim;
    });
  }

  async challengeClaim(input: ChallengeClaimInput): Promise<Challenge> {
    return this.db.transaction(async (client) => {
      const claimResult = await client.query<Claim>(
        `UPDATE claims SET state = 'CONTESTED', updated_at = NOW()
         WHERE id = $1 AND state IN ('OPEN', 'SUPPORTED')
         RETURNING *`,
        [input.claim_id]
      );

      if (claimResult.rows.length === 0) {
        throw new Error('Claim not available for challenge');
      }

      const result = await client.query<Challenge>(
        `INSERT INTO challenges (claim_id, challenger_id, content)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.claim_id, input.challenger_id, input.content]
      );

      const challenge = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['claim.challenged', 'challenge', challenge.id, JSON.stringify(challenge)]
      );

      await client.query(
        `INSERT INTO reputation_events (agent_id, event_type, dimension, value, weight, reference_type, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [input.challenger_id, 'challenge_issued', 'critique', 0.6, 0.5, 'challenge', challenge.id]
      );

      return challenge;
    });
  }

  async reproduceClaim(input: ReproduceClaimInput): Promise<Reproduction> {
    return this.db.transaction(async (client) => {
      const claim = await client.query<Claim>('SELECT * FROM claims WHERE id = $1', [input.claim_id]);
      if (claim.rows.length === 0) {
        throw new Error('Claim not found');
      }

      const claimAuthorPrincipal = await client.query(
        'SELECT principal_id FROM agents WHERE id = $1',
        [claim.rows[0].author_id]
      );

      const independenceWeight = this.calculateIndependenceWeight(
        claimAuthorPrincipal.rows[0].principal_id,
        input.reproducer_principal_id
      );

      const result = await client.query<Reproduction>(
        `INSERT INTO reproductions (claim_id, reproducer_id, reproducer_principal_id, success, independence_weight, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [
          input.claim_id,
          input.reproducer_id,
          input.reproducer_principal_id,
          input.success,
          independenceWeight,
          input.notes || null,
        ]
      );

      const reproduction = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['claim.reproduced', 'reproduction', reproduction.id, JSON.stringify(reproduction)]
      );

      const reputationValue = input.success ? 0.8 : 0.3;
      await client.query(
        `INSERT INTO reputation_events (agent_id, event_type, dimension, value, weight, reference_type, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
          input.reproducer_id,
          'reproduction_completed',
          'replication',
          reputationValue,
          independenceWeight,
          'reproduction',
          reproduction.id,
        ]
      );

      await this.updateClaimState(client, input.claim_id);

      return reproduction;
    });
  }

  private calculateIndependenceWeight(authorPrincipalId: string, reproducerPrincipalId: string): number {
    if (authorPrincipalId === reproducerPrincipalId) {
      return 0.0;
    }
    return 1.0;
  }

  private async updateClaimState(client: TransactionClient, claimId: string): Promise<void> {
    const reproductions = await client.query<Reproduction>(
      `SELECT * FROM reproductions WHERE claim_id = $1`,
      [claimId]
    );

    if (reproductions.rows.length === 0) return;

    const independentSuccesses = reproductions.rows
      .filter((r: Reproduction) => r.success && r.independence_weight > 0.5)
      .reduce((sum: number, r: Reproduction) => sum + r.independence_weight, 0);

    const independentFailures = reproductions.rows
      .filter((r: Reproduction) => !r.success && r.independence_weight > 0.5)
      .reduce((sum: number, r: Reproduction) => sum + r.independence_weight, 0);

    let newState: ClaimState | null = null;

    if (independentSuccesses >= 2.0) {
      newState = 'SUPPORTED';
    } else if (independentFailures >= 2.0) {
      newState = 'REFUTED';
    } else if (reproductions.rows.length >= 3) {
      newState = 'INDETERMINATE';
    }

    if (newState) {
      await client.query(
        `UPDATE claims SET state = $1, updated_at = NOW() WHERE id = $2`,
        [newState, claimId]
      );

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['claim.state_changed', 'claim', claimId, JSON.stringify({ claim_id: claimId, new_state: newState })]
      );
    }
  }

  async getClaim(claimId: string): Promise<Claim> {
    const result = await this.db.query<Claim>('SELECT * FROM claims WHERE id = $1', [claimId]);
    if (result.rows.length === 0) {
      throw new Error('Claim not found');
    }
    return result.rows[0];
  }

  async listClaims(projectId: string, state?: ClaimState): Promise<Claim[]> {
    const query = state
      ? 'SELECT * FROM claims WHERE project_id = $1 AND state = $2 ORDER BY created_at DESC'
      : 'SELECT * FROM claims WHERE project_id = $1 ORDER BY created_at DESC';
    
    const params = state ? [projectId, state] : [projectId];
    const result = await this.db.query<Claim>(query, params);
    return result.rows;
  }

  async getChallenges(claimId: string): Promise<Challenge[]> {
    const result = await this.db.query<Challenge>(
      'SELECT * FROM challenges WHERE claim_id = $1 ORDER BY created_at DESC',
      [claimId]
    );
    return result.rows;
  }

  async getReproductions(claimId: string): Promise<Reproduction[]> {
    const result = await this.db.query<Reproduction>(
      'SELECT * FROM reproductions WHERE claim_id = $1 ORDER BY created_at DESC',
      [claimId]
    );
    return result.rows;
  }
}
