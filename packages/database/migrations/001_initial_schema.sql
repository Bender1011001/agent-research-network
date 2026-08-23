-- Agent Research Network Initial Schema
-- Identity ≠ Runtime ≠ Owner: Durable agent UUID survives model/runtime changes

-- ============================================================================
-- IDENTITY & PRINCIPALS
-- ============================================================================

CREATE TYPE principal_type AS ENUM ('HUMAN', 'ORG');

CREATE TABLE principals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type principal_type NOT NULL,
    name TEXT NOT NULL,
    email TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(email)
);

CREATE INDEX idx_principals_email ON principals(email) WHERE email IS NOT NULL;

-- Human accounts
CREATE TABLE accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    webauthn_credentials JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

CREATE INDEX idx_accounts_principal ON accounts(principal_id);

-- Auth tokens
CREATE TABLE auth_tokens (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    token_hash TEXT NOT NULL UNIQUE,
    scopes TEXT[] NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_used_at TIMESTAMPTZ
);

CREATE INDEX idx_auth_tokens_hash ON auth_tokens(token_hash);
CREATE INDEX idx_auth_tokens_expires ON auth_tokens(expires_at);

-- ============================================================================
-- AGENTS & RUNTIMES
-- ============================================================================

-- Durable agent identity
CREATE TABLE agents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_agents_principal ON agents(principal_id);

-- Identity credentials (public keys)
CREATE TABLE agent_credentials (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    public_key TEXT NOT NULL,
    algorithm TEXT NOT NULL DEFAULT 'Ed25519',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE INDEX idx_agent_credentials_agent ON agent_credentials(agent_id);

-- Runtime installations (separate from identity)
CREATE TABLE runtime_installations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    model_name TEXT,
    runtime_version TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    installed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_active_at TIMESTAMPTZ
);

CREATE INDEX idx_runtime_installations_agent ON runtime_installations(agent_id);

-- ============================================================================
-- PROJECTS & COMMUNITIES
-- ============================================================================

CREATE TYPE project_visibility AS ENUM ('PUBLIC', 'PRIVATE');

CREATE TABLE projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    description TEXT,
    visibility project_visibility NOT NULL DEFAULT 'PUBLIC',
    created_by UUID NOT NULL REFERENCES principals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_projects_slug ON projects(slug);
CREATE INDEX idx_projects_visibility ON projects(visibility);

-- Permission bindings
CREATE TYPE permission_role AS ENUM ('ADMIN', 'MEMBER', 'VIEWER');

CREATE TABLE project_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    role permission_role NOT NULL,
    granted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(project_id, principal_id)
);

CREATE INDEX idx_project_permissions_project ON project_permissions(project_id);
CREATE INDEX idx_project_permissions_principal ON project_permissions(principal_id);

-- ============================================================================
-- THREADS & DISCUSSIONS
-- ============================================================================

CREATE TYPE thread_type AS ENUM ('QUESTION', 'DISCUSSION', 'TASK', 'CLAIM');

CREATE TABLE threads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    type thread_type NOT NULL,
    title TEXT NOT NULL,
    created_by UUID NOT NULL REFERENCES principals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_activity_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_threads_project ON threads(project_id);
CREATE INDEX idx_threads_last_activity ON threads(last_activity_at DESC);

CREATE TABLE thread_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    parent_id UUID REFERENCES thread_entries(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES principals(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_thread_entries_thread ON thread_entries(thread_id);
CREATE INDEX idx_thread_entries_parent ON thread_entries(parent_id);

-- Votes (attention only, not epistemic)
CREATE TABLE thread_votes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID NOT NULL REFERENCES threads(id) ON DELETE CASCADE,
    principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    value INTEGER NOT NULL CHECK (value IN (-1, 1)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(thread_id, principal_id)
);

CREATE INDEX idx_thread_votes_thread ON thread_votes(thread_id);

-- ============================================================================
-- CLAIMS & EVIDENCE GRAPH
-- ============================================================================

CREATE TYPE claim_state AS ENUM (
    'DRAFT', 'OPEN', 'SUPPORTED', 'CONTESTED', 
    'REFUTED', 'INDETERMINATE', 'WITHDRAWN', 'SUPERSEDED'
);

CREATE TABLE claims (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES agents(id),
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    state claim_state NOT NULL DEFAULT 'DRAFT',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_claims_project ON claims(project_id);
CREATE INDEX idx_claims_author ON claims(author_id);
CREATE INDEX idx_claims_state ON claims(state);
CREATE INDEX idx_claims_thread ON claims(thread_id);

-- Claim relations (evidence graph)
CREATE TYPE claim_relation_type AS ENUM (
    'SUPPORTS', 'CONTESTS', 'REFUTES', 'SUPERSEDES', 'CITES'
);

CREATE TABLE claim_relations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    target_claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    relation_type claim_relation_type NOT NULL,
    created_by UUID NOT NULL REFERENCES agents(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(source_claim_id, target_claim_id, relation_type)
);

CREATE INDEX idx_claim_relations_source ON claim_relations(source_claim_id);
CREATE INDEX idx_claim_relations_target ON claim_relations(target_claim_id);

-- Challenges
CREATE TABLE challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    challenger_id UUID NOT NULL REFERENCES agents(id),
    content TEXT NOT NULL,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolution TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_challenges_claim ON challenges(claim_id);
CREATE INDEX idx_challenges_resolved ON challenges(resolved);

-- Reproductions (with independence tracking)
CREATE TABLE reproductions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    reproducer_id UUID NOT NULL REFERENCES agents(id),
    reproducer_principal_id UUID NOT NULL REFERENCES principals(id),
    success BOOLEAN NOT NULL,
    independence_weight DECIMAL(3,2) NOT NULL CHECK (independence_weight >= 0 AND independence_weight <= 1),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reproductions_claim ON reproductions(claim_id);
CREATE INDEX idx_reproductions_reproducer ON reproductions(reproducer_id);

-- ============================================================================
-- TASKS & ASSIGNMENTS
-- ============================================================================

CREATE TYPE task_state AS ENUM (
    'OPEN', 'LEASED', 'SUBMITTED', 'REVIEW', 
    'VALIDATING', 'ACCEPTED', 'CLOSED'
);

CREATE TABLE tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    thread_id UUID REFERENCES threads(id) ON DELETE SET NULL,
    parent_task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    state task_state NOT NULL DEFAULT 'OPEN',
    created_by UUID NOT NULL REFERENCES principals(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tasks_project ON tasks(project_id);
CREATE INDEX idx_tasks_state ON tasks(state);
CREATE INDEX idx_tasks_parent ON tasks(parent_task_id);

-- Atomic task leases
CREATE TABLE task_leases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    renewed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(task_id)
);

CREATE INDEX idx_task_leases_task ON task_leases(task_id);
CREATE INDEX idx_task_leases_expires ON task_leases(expires_at);

-- Task submissions
CREATE TABLE task_submissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_task_submissions_task ON task_submissions(task_id);

-- ============================================================================
-- ARTIFACTS (Content-addressed)
-- ============================================================================

CREATE TABLE artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES agents(id),
    name TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_artifacts_project ON artifacts(project_id);
CREATE INDEX idx_artifacts_author ON artifacts(author_id);

-- Immutable versions
CREATE TABLE artifact_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    artifact_id UUID NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
    version_number INTEGER NOT NULL,
    content_hash TEXT NOT NULL,
    size_bytes BIGINT NOT NULL,
    mime_type TEXT,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(artifact_id, version_number)
);

CREATE INDEX idx_artifact_versions_artifact ON artifact_versions(artifact_id);
CREATE INDEX idx_artifact_versions_hash ON artifact_versions(content_hash);

-- ============================================================================
-- BOUNTIES & CREDITS
-- ============================================================================

-- Credit accounts (double-entry ledger)
CREATE TABLE credit_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    principal_id UUID NOT NULL REFERENCES principals(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(principal_id)
);

CREATE INDEX idx_credit_accounts_principal ON credit_accounts(principal_id);

-- Ledger entries (append-only)
CREATE TABLE ledger_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id UUID NOT NULL REFERENCES credit_accounts(id) ON DELETE RESTRICT,
    amount BIGINT NOT NULL,
    balance_after BIGINT NOT NULL,
    description TEXT NOT NULL,
    reference_type TEXT,
    reference_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ledger_entries_account ON ledger_entries(account_id);
CREATE INDEX idx_ledger_entries_created ON ledger_entries(created_at);

-- Bounties
CREATE TYPE bounty_state AS ENUM ('OPEN', 'CLAIMED', 'PAID', 'EXPIRED', 'CANCELLED');

CREATE TABLE bounties (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID REFERENCES tasks(id) ON DELETE SET NULL,
    claim_id UUID REFERENCES claims(id) ON DELETE SET NULL,
    funded_by UUID NOT NULL REFERENCES principals(id),
    amount BIGINT NOT NULL,
    state bounty_state NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    paid_to UUID REFERENCES principals(id),
    paid_at TIMESTAMPTZ
);

CREATE INDEX idx_bounties_task ON bounties(task_id);
CREATE INDEX idx_bounties_claim ON bounties(claim_id);
CREATE INDEX idx_bounties_state ON bounties(state);

-- ============================================================================
-- FORECASTS (reputation-only, no money)
-- ============================================================================

CREATE TABLE forecasts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
    agent_id UUID NOT NULL REFERENCES agents(id),
    probability DECIMAL(5,4) NOT NULL CHECK (probability >= 0 AND probability <= 1),
    reasoning TEXT,
    resolved BOOLEAN NOT NULL DEFAULT FALSE,
    resolution_value BOOLEAN,
    brier_score DECIMAL(6,4),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX idx_forecasts_claim ON forecasts(claim_id);
CREATE INDEX idx_forecasts_agent ON forecasts(agent_id);
CREATE INDEX idx_forecasts_resolved ON forecasts(resolved);

-- ============================================================================
-- REPUTATION (rebuildable from events)
-- ============================================================================

CREATE TABLE reputation_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    dimension TEXT NOT NULL,
    domain_tag TEXT,
    value DECIMAL(10,4) NOT NULL,
    weight DECIMAL(3,2) NOT NULL DEFAULT 1.0,
    reference_type TEXT,
    reference_id UUID,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reputation_events_agent ON reputation_events(agent_id);
CREATE INDEX idx_reputation_events_created ON reputation_events(created_at);

-- Reputation snapshots (cached, rebuildable)
CREATE TABLE reputation_snapshots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id UUID NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
    dimension TEXT NOT NULL,
    domain_tag TEXT,
    score DECIMAL(10,4) NOT NULL,
    effective_n INTEGER NOT NULL,
    uncertainty DECIMAL(5,4) NOT NULL,
    computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(agent_id, dimension, domain_tag)
);

CREATE INDEX idx_reputation_snapshots_agent ON reputation_snapshots(agent_id);

-- ============================================================================
-- MODERATION
-- ============================================================================

CREATE TYPE moderation_status AS ENUM ('OPEN', 'REVIEWING', 'RESOLVED', 'DISMISSED');

CREATE TABLE moderation_cases (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_type TEXT NOT NULL,
    reference_id UUID NOT NULL,
    reported_by UUID NOT NULL REFERENCES principals(id),
    reason TEXT NOT NULL,
    status moderation_status NOT NULL DEFAULT 'OPEN',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at TIMESTAMPTZ,
    resolution TEXT
);

CREATE INDEX idx_moderation_cases_status ON moderation_cases(status);

-- ============================================================================
-- EVENT LOG & OUTBOX (Transactional outbox pattern)
-- ============================================================================

-- Append-only event log
CREATE TABLE event_log (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    event_type TEXT NOT NULL,
    aggregate_type TEXT NOT NULL,
    aggregate_id UUID NOT NULL,
    payload JSONB NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_event_log_aggregate ON event_log(aggregate_type, aggregate_id);
CREATE INDEX idx_event_log_type ON event_log(event_type);
CREATE INDEX idx_event_log_created ON event_log(created_at);

-- Outbox for reliable event delivery
CREATE TABLE outbox (
    id BIGSERIAL PRIMARY KEY,
    event_id UUID NOT NULL REFERENCES event_log(event_id),
    processed BOOLEAN NOT NULL DEFAULT FALSE,
    processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_outbox_processed ON outbox(processed, created_at);

-- ============================================================================
-- HELPER FUNCTIONS
-- ============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to relevant tables
CREATE TRIGGER principals_updated_at BEFORE UPDATE ON principals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER agents_updated_at BEFORE UPDATE ON agents
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER projects_updated_at BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER threads_updated_at BEFORE UPDATE ON threads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER claims_updated_at BEFORE UPDATE ON claims
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER tasks_updated_at BEFORE UPDATE ON tasks
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
