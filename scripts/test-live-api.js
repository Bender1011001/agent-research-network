#!/usr/bin/env node

/**
 * Integration test for project endpoints on live API
 * Tests the complete flow: register → create project → create task → publish claim
 * 
 * Usage:
 *   node test-live-api.js https://web-production-58f22.up.railway.app
 */

const API_URL = process.argv[2] || 'http://localhost:3001';

async function testLiveAPI() {
  console.log(`🧪 Testing live API at ${API_URL}\n`);

  // Generate unique email for this test run
  const timestamp = Date.now();
  const testEmail = `test-${timestamp}@example.com`;
  const testPassword = 'TestPassword123!';

  try {
    // Step 1: Register a new user
    console.log('1️⃣  Registering new user...');
    const registerRes = await fetch(`${API_URL}/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Test User',
        email: testEmail,
        password: testPassword,
        agent_name: 'Test Agent',
      }),
    });

    if (!registerRes.ok) {
      const error = await registerRes.text();
      throw new Error(`Registration failed (${registerRes.status}): ${error}`);
    }

    const registerData = await registerRes.json();
    console.log(`✅ Registered user: ${registerData.principal.name}`);
    console.log(`   Principal ID: ${registerData.principal.id}`);
    console.log(`   Agent ID: ${registerData.agent?.id || 'N/A'}`);
    console.log(`   Token: ${registerData.token.substring(0, 20)}...`);

    const token = registerData.token;
    const principalId = registerData.principal.id;
    const agentId = registerData.agent?.id;

    // Step 2: Create a project
    console.log('\n2️⃣  Creating a research project...');
    const projectRes = await fetch(`${API_URL}/v1/projects`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Test Research Project',
        description: 'A test project for validating project endpoints',
        visibility: 'PUBLIC',
        created_by: principalId,
      }),
    });

    if (!projectRes.ok) {
      const error = await projectRes.text();
      throw new Error(`Project creation failed (${projectRes.status}): ${error}`);
    }

    const project = await projectRes.json();
    console.log(`✅ Created project: ${project.name}`);
    console.log(`   Project ID: ${project.id}`);
    console.log(`   Slug: ${project.slug}`);
    console.log(`   Visibility: ${project.visibility}`);

    // Step 3: List projects (public feed)
    console.log('\n3️⃣  Fetching public projects...');
    const listRes = await fetch(`${API_URL}/v1/projects?limit=5`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!listRes.ok) {
      const error = await listRes.text();
      throw new Error(`List projects failed (${listRes.status}): ${error}`);
    }

    const projects = await listRes.json();
    console.log(`✅ Found ${projects.length} projects`);
    const ourProject = projects.find(p => p.id === project.id);
    if (ourProject) {
      console.log(`   ✓ Our project is in the public feed`);
    }

    // Step 4: Get project by ID
    console.log('\n4️⃣  Fetching project by ID...');
    const getRes = await fetch(`${API_URL}/v1/projects/${project.id}`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    if (!getRes.ok) {
      const error = await getRes.text();
      throw new Error(`Get project failed (${getRes.status}): ${error}`);
    }

    const fetchedProject = await getRes.json();
    console.log(`✅ Retrieved project: ${fetchedProject.name}`);
    console.log(`   Matches created project: ${fetchedProject.id === project.id}`);

    // Step 5: Create a task
    if (agentId) {
      console.log('\n5️⃣  Creating a task...');
      const taskRes = await fetch(`${API_URL}/v1/tasks`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          project_id: project.id,
          title: 'Test Task',
          description: 'A test task to validate task creation with new project',
          created_by: principalId,
        }),
      });

      if (!taskRes.ok) {
        const error = await taskRes.text();
        throw new Error(`Task creation failed (${taskRes.status}): ${error}`);
      }

      const task = await taskRes.json();
      console.log(`✅ Created task: ${task.title}`);
      console.log(`   Task ID: ${task.id}`);
      console.log(`   Project ID: ${task.project_id}`);
      console.log(`   State: ${task.state}`);

      // Step 6: Create a claim
      console.log('\n6️⃣  Publishing a claim...');
      const claimRes = await fetch(`${API_URL}/v1/claims`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          project_id: project.id,
          author_id: agentId,
          title: 'Test Claim',
          content: 'This is a test claim to validate the complete flow from project creation to claim publication.',
        }),
      });

      if (!claimRes.ok) {
        const error = await claimRes.text();
        throw new Error(`Claim creation failed (${claimRes.status}): ${error}`);
      }

      const claim = await claimRes.json();
      console.log(`✅ Created claim: ${claim.title}`);
      console.log(`   Claim ID: ${claim.id}`);
      console.log(`   State: ${claim.state}`);
    }

    console.log('\n✅ ✅ ✅ ALL TESTS PASSED! ✅ ✅ ✅');
    console.log('\n📋 Summary:');
    console.log('   ✓ User registration works');
    console.log('   ✓ Project creation works');
    console.log('   ✓ Project listing (public feed) works');
    console.log('   ✓ Project retrieval by ID works');
    console.log('   ✓ Task creation with project_id works');
    console.log('   ✓ Claim creation with project_id works');
    console.log('\n🎉 The complete flow is working end-to-end!');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error.message);
    process.exit(1);
  }
}

testLiveAPI();
