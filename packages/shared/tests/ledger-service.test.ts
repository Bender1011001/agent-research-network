import { LedgerService } from '../src/services/ledger-service';
import { AuthService } from '../src/services/auth-service';
import { createDatabase, Database } from '@arn/database';

describe('LedgerService', () => {
  let db: Database;
  let ledgerService: LedgerService;
  let authService: AuthService;
  let principal1Id: string;
  let principal2Id: string;

  beforeAll(async () => {
    db = createDatabase();
    ledgerService = new LedgerService(db);
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

    await ledgerService.ensureAccount('SYSTEM_ESCROW');

    await db.query(
      'UPDATE credit_accounts SET balance = 1000 WHERE principal_id = $1',
      [principal1Id]
    );
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Double-Entry Ledger', () => {
    it('should maintain balanced ledger after transfer', async () => {
      await ledgerService.transferCredits({
        from_principal_id: principal1Id,
        to_principal_id: principal2Id,
        amount: 100,
        description: 'Test transfer',
      });

      const verification = await ledgerService.verifyLedgerBalance();
      expect(verification.balanced).toBe(true);
    });

    it('should reject transfer with insufficient balance', async () => {
      await expect(
        ledgerService.transferCredits({
          from_principal_id: principal2Id,
          to_principal_id: principal1Id,
          amount: 10000,
          description: 'Should fail',
        })
      ).rejects.toThrow('Insufficient credits');
    });

    it('should correctly track account balances', async () => {
      const account1 = await ledgerService.getAccount(principal1Id);
      const account2 = await ledgerService.getAccount(principal2Id);

      await ledgerService.transferCredits({
        from_principal_id: principal1Id,
        to_principal_id: principal2Id,
        amount: 50,
        description: 'Balance test',
      });

      const updatedAccount1 = await ledgerService.getAccount(principal1Id);
      const updatedAccount2 = await ledgerService.getAccount(principal2Id);

      expect(updatedAccount1.balance).toBe(account1.balance - 50);
      expect(updatedAccount2.balance).toBe(account2.balance + 50);
    });
  });
});
