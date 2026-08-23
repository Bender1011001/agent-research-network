import { Database } from '@arn/database';
import type { ReputationEvent, ReputationSnapshot } from '@arn/database';

export interface ReputationScore {
  dimension: string;
  domain_tag: string | null;
  score: number;
  effective_n: number;
  uncertainty: number;
  computed_at: Date;
}

export interface AgentReputation {
  agent_id: string;
  scores: ReputationScore[];
}

export class ReputationService {
  constructor(private db: Database) {}

  async rebuildReputation(agentId?: string): Promise<void> {
    return this.db.transaction(async (client) => {
      const whereClause = agentId ? 'WHERE agent_id = $1' : '';
      const params = agentId ? [agentId] : [];

      const events = await client.query<ReputationEvent>(
        `SELECT * FROM reputation_events ${whereClause} ORDER BY created_at`,
        params
      );

      const grouped = new Map<string, ReputationEvent[]>();

      for (const event of events.rows) {
        const key = `${event.agent_id}:${event.dimension}:${event.domain_tag || 'null'}`;
        if (!grouped.has(key)) {
          grouped.set(key, []);
        }
        grouped.get(key)!.push(event);
      }

      for (const [key, eventGroup] of grouped.entries()) {
        const [agent_id, dimension, domainTag] = key.split(':');
        const domain_tag = domainTag === 'null' ? null : domainTag;

        const score = this.calculateBayesianScore(eventGroup);

        await client.query(
          `INSERT INTO reputation_snapshots (agent_id, dimension, domain_tag, score, effective_n, uncertainty, computed_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())
           ON CONFLICT (agent_id, dimension, domain_tag)
           DO UPDATE SET score = $4, effective_n = $5, uncertainty = $6, computed_at = NOW()`,
          [agent_id, dimension, domain_tag, score.score, score.effective_n, score.uncertainty]
        );
      }
    });
  }

  private calculateBayesianScore(events: ReputationEvent[]): {
    score: number;
    effective_n: number;
    uncertainty: number;
  } {
    const alpha_prior = 2.0;
    const beta_prior = 2.0;

    const weightedSum = events.reduce((sum, e) => sum + e.value * e.weight, 0);
    const totalWeight = events.reduce((sum, e) => sum + e.weight, 0);

    const effective_n = totalWeight;

    const alpha = alpha_prior + weightedSum;
    const beta = beta_prior + (totalWeight - weightedSum);

    const score = alpha / (alpha + beta);

    const variance = (alpha * beta) / ((alpha + beta) ** 2 * (alpha + beta + 1));
    const uncertainty = Math.sqrt(variance);

    return {
      score: Number(score.toFixed(4)),
      effective_n: Math.round(effective_n),
      uncertainty: Number(uncertainty.toFixed(4)),
    };
  }

  async getAgentReputation(agentId: string): Promise<AgentReputation> {
    const result = await this.db.query<ReputationSnapshot>(
      'SELECT * FROM reputation_snapshots WHERE agent_id = $1 ORDER BY dimension, domain_tag',
      [agentId]
    );

    const scores: ReputationScore[] = result.rows.map((row) => ({
      dimension: row.dimension,
      domain_tag: row.domain_tag,
      score: Number(row.score),
      effective_n: row.effective_n,
      uncertainty: Number(row.uncertainty),
      computed_at: row.computed_at,
    }));

    return {
      agent_id: agentId,
      scores,
    };
  }

  async getTopAgents(dimension: string, limit: number = 10): Promise<AgentReputation[]> {
    const result = await this.db.query<ReputationSnapshot>(
      `SELECT * FROM reputation_snapshots 
       WHERE dimension = $1 
       ORDER BY score DESC, effective_n DESC 
       LIMIT $2`,
      [dimension, limit]
    );

    const agentIds = [...new Set(result.rows.map((r) => r.agent_id))];
    const reputations: AgentReputation[] = [];

    for (const agentId of agentIds) {
      reputations.push(await this.getAgentReputation(agentId));
    }

    return reputations;
  }

  async recordEvent(event: Omit<ReputationEvent, 'id' | 'created_at'>): Promise<ReputationEvent> {
    const result = await this.db.query<ReputationEvent>(
      `INSERT INTO reputation_events (agent_id, event_type, dimension, domain_tag, value, weight, reference_type, reference_id, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        event.agent_id,
        event.event_type,
        event.dimension,
        event.domain_tag || null,
        event.value,
        event.weight,
        event.reference_type || null,
        event.reference_id || null,
        JSON.stringify(event.metadata || {}),
      ]
    );

    return result.rows[0];
  }
}
