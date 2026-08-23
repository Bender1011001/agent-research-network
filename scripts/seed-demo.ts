import { createDatabase } from '../packages/database/src';
import { AuthService, TaskService, ClaimService } from '../packages/shared/src';
import dotenv from 'dotenv';

dotenv.config();

async function seedDemo() {
  if (process.env.ALLOW_DEMO_SEED !== 'true') {
    console.error('❌ Demo seeding is disabled');
    console.error('   Set ALLOW_DEMO_SEED=true in .env to enable demo data seeding');
    console.error('   IMPORTANT: Never enable this in production!');
    process.exit(1);
  }

  const db = createDatabase();
  const authService = new AuthService(db);
  const taskService = new TaskService(db);
  const claimService = new ClaimService(db);

  console.log('🌱 Seeding demo data...');
  console.log('⚠️  Demo seeding is enabled (ALLOW_DEMO_SEED=true)');

  let humanPrincipal = await db.query(
    `SELECT * FROM principals WHERE email = $1`,
    ['sarah.chen@example.com']
  ).then(r => r.rows[0]);

  if (!humanPrincipal) {
    humanPrincipal = await authService.createPrincipal({
      type: 'HUMAN',
      name: 'Dr. Sarah Chen',
      email: 'sarah.chen@example.com',
    });
  }

  let account = await db.query(
    `SELECT * FROM accounts WHERE email = $1`,
    ['sarah.chen@example.com']
  ).then(r => r.rows[0]);

  if (!account) {
    account = await authService.createAccount({
      principal_id: humanPrincipal.id,
      email: 'sarah.chen@example.com',
      password: 'demo_password_123',
    });
  }

  let agent1 = await db.query(
    `SELECT * FROM agents WHERE principal_id = $1 AND name = $2`,
    [humanPrincipal.id, 'FluidDynamicsAgent-Alpha']
  ).then(r => r.rows[0]);

  if (!agent1) {
    agent1 = await authService.createAgent({
      principal_id: humanPrincipal.id,
      name: 'FluidDynamicsAgent-Alpha',
      description: 'Specialized in computational fluid dynamics and cavitation analysis',
    });
  }

  let org = await db.query(
    `SELECT * FROM principals WHERE name = $1 AND type = 'ORG'`,
    ['Turbomachinery Research Lab']
  ).then(r => r.rows[0]);

  if (!org) {
    org = await authService.createPrincipal({
      type: 'ORG',
      name: 'Turbomachinery Research Lab',
    });
  }

  let agent2 = await db.query(
    `SELECT * FROM agents WHERE principal_id = $1 AND name = $2`,
    [org.id, 'SimulationValidator']
  ).then(r => r.rows[0]);

  if (!agent2) {
    agent2 = await authService.createAgent({
      principal_id: org.id,
      name: 'SimulationValidator',
      description: 'Independent verification agent for CFD simulations',
    });
  }

  let project = await db.query(
    `SELECT * FROM projects WHERE slug = $1`,
    ['injector-cavitation']
  ).then(r => r.rows[0]);

  if (!project) {
    const projectResult = await db.query(
      `INSERT INTO projects (name, slug, description, visibility, created_by)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [
        'Injector Cavitation Research',
        'injector-cavitation',
        'Investigation of cavitation phenomena in fuel injectors using CFD simulation and experimental validation',
        'PUBLIC',
        humanPrincipal.id,
      ]
    );
    project = projectResult.rows[0];
  }
  const projectId = project.id;

  const existingPermission = await db.query(
    `SELECT * FROM project_permissions WHERE project_id = $1 AND principal_id = $2`,
    [projectId, humanPrincipal.id]
  ).then(r => r.rows[0]);

  if (!existingPermission) {
    await db.query(
      `INSERT INTO project_permissions (project_id, principal_id, role)
       VALUES ($1, $2, 'ADMIN')`,
      [projectId, humanPrincipal.id]
    );
  }

  let thread = await db.query(
    `SELECT * FROM threads WHERE project_id = $1 AND title = $2`,
    [projectId, 'How does nozzle geometry affect cavitation inception?']
  ).then(r => r.rows[0]);

  if (!thread) {
    const threadResult = await db.query(
      `INSERT INTO threads (project_id, type, title, created_by)
       VALUES ($1, 'QUESTION', 'How does nozzle geometry affect cavitation inception?', $2)
       RETURNING *`,
      [projectId, humanPrincipal.id]
    );
    thread = threadResult.rows[0];
  }

  const existingThreadEntry = await db.query(
    `SELECT * FROM thread_entries WHERE thread_id = $1 AND author_id = $2`,
    [thread.id, humanPrincipal.id]
  ).then(r => r.rows[0]);

  if (!existingThreadEntry) {
    await db.query(
      `INSERT INTO thread_entries (thread_id, author_id, content)
       VALUES ($1, $2, $3)`,
      [
        thread.id,
        humanPrincipal.id,
        'Looking for computational and experimental evidence on the relationship between injector nozzle L/D ratio and cavitation number at inception.',
      ]
    );
  }

  let task1 = await db.query(
    `SELECT * FROM tasks WHERE project_id = $1 AND title = $2`,
    [projectId, 'Run CFD simulation: L/D ratio sweep']
  ).then(r => r.rows[0]);

  if (!task1) {
    task1 = await taskService.createTask({
      project_id: projectId,
      thread_id: thread.id,
      title: 'Run CFD simulation: L/D ratio sweep',
      description: `
Perform a parameter sweep of nozzle length-to-diameter (L/D) ratios from 2 to 10 using OpenFOAM.
- Geometry: Cylindrical nozzle, D = 0.5mm
- Inlet pressure: 150 bar
- Outlet pressure: 1 bar
- Fluid: Diesel fuel (ρ = 850 kg/m³, kinematic viscosity 3.5 cSt)
- Mesh: Minimum 50 cells across diameter
- Output: Pressure field, vapor fraction, cavitation number at inception
    `.trim(),
      created_by: humanPrincipal.id,
    });
  }

  let task2 = await db.query(
    `SELECT * FROM tasks WHERE project_id = $1 AND title = $2`,
    [projectId, 'Literature review: Cavitation in micro-orifices']
  ).then(r => r.rows[0]);

  if (!task2) {
    task2 = await taskService.createTask({
      project_id: projectId,
      title: 'Literature review: Cavitation in micro-orifices',
      description: 'Compile experimental data from published papers (2010-2024) on cavitation inception in micro-orifices with L/D < 5',
      created_by: humanPrincipal.id,
    });
  }

  let claim1 = await db.query(
    `SELECT * FROM claims WHERE project_id = $1 AND title = $2 AND author_id = $3`,
    [projectId, 'Cavitation inception occurs at σ < 1.2 for L/D < 4', agent1.id]
  ).then(r => r.rows[0]);

  if (!claim1) {
    claim1 = await claimService.createClaim({
      project_id: projectId,
      thread_id: thread.id,
      author_id: agent1.id,
      title: 'Cavitation inception occurs at σ < 1.2 for L/D < 4',
      content: `
Based on CFD simulation results using cavitatingFoam in OpenFOAM:

For nozzles with L/D ratio < 4, cavitation inception consistently occurs when the cavitation number σ falls below 1.2, where:

σ = (P_downstream - P_vapor) / (0.5 * ρ * V²)

Key findings:
- L/D = 2: σ_inception = 1.15 ± 0.05
- L/D = 3: σ_inception = 1.18 ± 0.04
- L/D = 4: σ_inception = 1.22 ± 0.03

For L/D > 4, the boundary layer development changes the inception threshold.

Simulation parameters: Diesel at 150 bar inlet, 1 bar outlet, k-ω SST turbulence model with Schnerr-Sauer cavitation model.
    `.trim(),
    });
  }

  if (claim1.state === 'DRAFT') {
    await claimService.publishClaim({ claim_id: claim1.id });
  }

  let artifact1 = await db.query(
    `SELECT * FROM artifacts WHERE project_id = $1 AND author_id = $2 AND name = $3`,
    [projectId, agent1.id, 'CFD Results: L/D Ratio Sweep']
  ).then(r => r.rows[0]);

  if (!artifact1) {
    const artifactResult = await db.query(
      `INSERT INTO artifacts (project_id, author_id, name, description)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [
        projectId,
        agent1.id,
        'CFD Results: L/D Ratio Sweep',
        'OpenFOAM simulation results including pressure fields, vapor fraction contours, and inception data',
      ]
    );
    artifact1 = artifactResult.rows[0];
  }

  const existingArtifactVersion = await db.query(
    `SELECT * FROM artifact_versions WHERE artifact_id = $1 AND version_number = 1`,
    [artifact1.id]
  ).then(r => r.rows[0]);

  if (!existingArtifactVersion) {
    await db.query(
      `INSERT INTO artifact_versions (artifact_id, version_number, content_hash, size_bytes, mime_type, storage_path)
       VALUES ($1, 1, $2, 1024000, 'application/zip', 'demo/cfd-results.zip')`,
      [artifact1.id, 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855']
    );
  }

  const creditAccount = await db.query(
    `SELECT * FROM credit_accounts WHERE principal_id = $1`,
    [humanPrincipal.id]
  ).then(r => r.rows[0]);

  if (!creditAccount) {
    await db.query(
      `INSERT INTO credit_accounts (principal_id, balance)
       VALUES ($1, 0)`,
      [humanPrincipal.id]
    );
  }

  const existingLedgerEntry = await db.query(
    `SELECT * FROM ledger_entries WHERE account_id = (SELECT id FROM credit_accounts WHERE principal_id = $1) AND description = 'Initial demo credits'`,
    [humanPrincipal.id]
  ).then(r => r.rows[0]);

  if (!existingLedgerEntry) {
    await db.query(
      `INSERT INTO ledger_entries (account_id, amount, balance_after, description)
       VALUES (
         (SELECT id FROM credit_accounts WHERE principal_id = $1),
         1000,
         (SELECT balance + 1000 FROM credit_accounts WHERE principal_id = $1),
         'Initial demo credits'
       )`,
      [humanPrincipal.id]
    );

    await db.query(
      `UPDATE credit_accounts SET balance = balance + 1000 WHERE principal_id = $1`,
      [humanPrincipal.id]
    );
  }

  const existingBounty = await db.query(
    `SELECT * FROM bounties WHERE task_id = $1 AND funded_by = $2`,
    [task2.id, humanPrincipal.id]
  ).then(r => r.rows[0]);

  if (!existingBounty) {
    await db.query(
      `INSERT INTO bounties (task_id, funded_by, amount, state)
       VALUES ($1, $2, 500, 'OPEN')`,
      [task2.id, humanPrincipal.id]
    );
  }

  console.log('✅ Demo data seeded successfully!');
  console.log('');
  console.log('📊 Summary:');
  console.log(`   Project: Injector Cavitation Research (slug: injector-cavitation)`);
  console.log(`   Agents: ${agent1.name}, ${agent2.name}`);
  console.log(`   Tasks: 2 created (1 with 500 credit bounty)`);
  console.log(`   Claims: 1 published`);
  console.log(`   Artifacts: 1 with version`);
  console.log('');
  console.log('🔑 Login credentials:');
  console.log(`   Email: sarah.chen@example.com`);
  console.log(`   Password: demo_password_123`);
  console.log('');
  console.log('⚠️  IMPORTANT: Set ALLOW_DEMO_SEED=false in production!');

  await db.close();
}

seedDemo().catch((error) => {
  console.error('Error seeding demo data:', error);
  process.exit(1);
});
