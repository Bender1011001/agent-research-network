import { Database } from '@arn/database';
import type { CreditAccount, LedgerEntry, Bounty } from '@arn/database';

export interface TransferCreditsInput {
  from_principal_id: string;
  to_principal_id: string;
  amount: number;
  description: string;
  reference_type?: string;
  reference_id?: string;
}

export interface CreateBountyInput {
  task_id?: string;
  claim_id?: string;
  funded_by: string;
  amount: number;
  expires_at?: Date;
}

export interface PayBountyInput {
  bounty_id: string;
  paid_to: string;
}

export class LedgerService {
  constructor(private db: Database) {}

  async ensureAccount(principalId: string): Promise<CreditAccount> {
    return this.db.transaction(async (client) => {
      const result = await client.query<CreditAccount>(
        `INSERT INTO credit_accounts (principal_id, balance)
         VALUES ($1, 0)
         ON CONFLICT (principal_id) DO UPDATE SET updated_at = NOW()
         RETURNING *`,
        [principalId]
      );
      return result.rows[0];
    });
  }

  async getAccount(principalId: string): Promise<CreditAccount> {
    const result = await this.db.query<CreditAccount>(
      'SELECT * FROM credit_accounts WHERE principal_id = $1',
      [principalId]
    );
    if (result.rows.length === 0) {
      return await this.ensureAccount(principalId);
    }
    return result.rows[0];
  }

  async transferCredits(input: TransferCreditsInput): Promise<void> {
    if (input.amount <= 0) {
      throw new Error('Transfer amount must be positive');
    }

    return this.db.transaction(async (client) => {
      const fromAccount = await this.getAccount(input.from_principal_id);
      const toAccount = await this.getAccount(input.to_principal_id);

      if (fromAccount.balance < input.amount) {
        throw new Error('Insufficient credits');
      }

      const newFromBalance = fromAccount.balance - input.amount;
      await client.query(
        'UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE id = $2',
        [newFromBalance, fromAccount.id]
      );

      await client.query<LedgerEntry>(
        `INSERT INTO ledger_entries (account_id, amount, balance_after, description, reference_type, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          fromAccount.id,
          -input.amount,
          newFromBalance,
          input.description,
          input.reference_type || null,
          input.reference_id || null,
        ]
      );

      const newToBalance = toAccount.balance + input.amount;
      await client.query(
        'UPDATE credit_accounts SET balance = $1, updated_at = NOW() WHERE id = $2',
        [newToBalance, toAccount.id]
      );

      await client.query<LedgerEntry>(
        `INSERT INTO ledger_entries (account_id, amount, balance_after, description, reference_type, reference_id)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          toAccount.id,
          input.amount,
          newToBalance,
          input.description,
          input.reference_type || null,
          input.reference_id || null,
        ]
      );

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        [
          'credits.transferred',
          'ledger_entry',
          fromAccount.id,
          JSON.stringify({
            from: input.from_principal_id,
            to: input.to_principal_id,
            amount: input.amount,
          }),
        ]
      );
    });
  }

  async verifyLedgerBalance(): Promise<{ balanced: boolean; total_debits: number; total_credits: number }> {
    const result = await this.db.query<{ total: string }>(
      'SELECT SUM(amount) as total FROM ledger_entries'
    );

    const total = parseInt(result.rows[0].total || '0');

    return {
      balanced: total === 0,
      total_debits: total < 0 ? Math.abs(total) : 0,
      total_credits: total > 0 ? total : 0,
    };
  }

  async createBounty(input: CreateBountyInput): Promise<Bounty> {
    return this.db.transaction(async (client) => {
      const account = await this.getAccount(input.funded_by);

      if (account.balance < input.amount) {
        throw new Error('Insufficient credits for bounty');
      }

      await this.transferCredits({
        from_principal_id: input.funded_by,
        to_principal_id: 'SYSTEM_ESCROW',
        amount: input.amount,
        description: 'Bounty escrow',
        reference_type: 'bounty',
      });

      const result = await client.query<Bounty>(
        `INSERT INTO bounties (task_id, claim_id, funded_by, amount, state, expires_at)
         VALUES ($1, $2, $3, $4, 'OPEN', $5)
         RETURNING *`,
        [input.task_id || null, input.claim_id || null, input.funded_by, input.amount, input.expires_at || null]
      );

      const bounty = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['bounty.created', 'bounty', bounty.id, JSON.stringify(bounty)]
      );

      return bounty;
    });
  }

  async payBounty(input: PayBountyInput): Promise<void> {
    return this.db.transaction(async (client) => {
      const bountyResult = await client.query<Bounty>(
        `UPDATE bounties SET state = 'PAID', paid_to = $1, paid_at = NOW()
         WHERE id = $2 AND state = 'OPEN'
         RETURNING *`,
        [input.paid_to, input.bounty_id]
      );

      if (bountyResult.rows.length === 0) {
        throw new Error('Bounty not found or already paid');
      }

      const bounty = bountyResult.rows[0];

      await this.transferCredits({
        from_principal_id: 'SYSTEM_ESCROW',
        to_principal_id: input.paid_to,
        amount: bounty.amount,
        description: 'Bounty payment',
        reference_type: 'bounty',
        reference_id: bounty.id,
      });

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['bounty.paid', 'bounty', bounty.id, JSON.stringify(bounty)]
      );
    });
  }
}
