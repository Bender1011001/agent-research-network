import { Database } from '@arn/database';
import type { Principal, Account, Agent, AuthToken } from '@arn/database';
import * as crypto from 'crypto';

export interface CreatePrincipalInput {
  type: 'HUMAN' | 'ORG';
  name: string;
  email?: string;
}

export interface CreateAccountInput {
  principal_id: string;
  email: string;
  password?: string;
}

export interface CreateAgentInput {
  principal_id: string;
  name: string;
  description?: string;
}

export interface CreateTokenInput {
  account_id: string;
  scopes: string[];
  expires_in_days?: number;
}

export class AuthService {
  constructor(private db: Database) {}

  async createPrincipal(input: CreatePrincipalInput): Promise<Principal> {
    return this.db.transaction(async (client) => {
      const result = await client.query<Principal>(
        `INSERT INTO principals (type, name, email)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.type, input.name, input.email || null]
      );

      const principal = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['principal.created', 'principal', principal.id, JSON.stringify(principal)]
      );

      return principal;
    });
  }

  async createAccount(input: CreateAccountInput): Promise<Account> {
    return this.db.transaction(async (client) => {
      const passwordHash = input.password
        ? crypto.createHash('sha256').update(input.password).digest('hex')
        : null;

      const result = await client.query<Account>(
        `INSERT INTO accounts (principal_id, email, password_hash)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.principal_id, input.email, passwordHash]
      );

      const account = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['account.created', 'account', account.id, JSON.stringify({ account_id: account.id })]
      );

      return account;
    });
  }

  async createAgent(input: CreateAgentInput): Promise<Agent> {
    return this.db.transaction(async (client) => {
      const result = await client.query<Agent>(
        `INSERT INTO agents (principal_id, name, description)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [input.principal_id, input.name, input.description || null]
      );

      const agent = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['agent.created', 'agent', agent.id, JSON.stringify(agent)]
      );

      return agent;
    });
  }

  async createToken(input: CreateTokenInput): Promise<{ token: string; tokenRecord: AuthToken }> {
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expiresInDays = input.expires_in_days || 30;

    const result = await this.db.query<AuthToken>(
      `INSERT INTO auth_tokens (account_id, token_hash, scopes, expires_at)
       VALUES ($1, $2, $3, NOW() + INTERVAL '${expiresInDays} days')
       RETURNING *`,
      [input.account_id, tokenHash, input.scopes]
    );

    return {
      token: token,
      tokenRecord: result.rows[0],
    };
  }

  async verifyToken(token: string): Promise<AuthToken | null> {
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const result = await this.db.query<AuthToken>(
      `UPDATE auth_tokens 
       SET last_used_at = NOW()
       WHERE token_hash = $1 AND expires_at > NOW()
       RETURNING *`,
      [tokenHash]
    );

    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getAccountByEmail(email: string): Promise<Account | null> {
    const result = await this.db.query<Account>('SELECT * FROM accounts WHERE email = $1', [email]);
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getPrincipal(principalId: string): Promise<Principal> {
    const result = await this.db.query<Principal>('SELECT * FROM principals WHERE id = $1', [principalId]);
    if (result.rows.length === 0) {
      throw new Error('Principal not found');
    }
    return result.rows[0];
  }

  async getAgent(agentId: string): Promise<Agent> {
    const result = await this.db.query<Agent>('SELECT * FROM agents WHERE id = $1', [agentId]);
    if (result.rows.length === 0) {
      throw new Error('Agent not found');
    }
    return result.rows[0];
  }

  async listAgentsByPrincipal(principalId: string): Promise<Agent[]> {
    const result = await this.db.query<Agent>(
      'SELECT * FROM agents WHERE principal_id = $1 ORDER BY created_at DESC',
      [principalId]
    );
    return result.rows;
  }
}
