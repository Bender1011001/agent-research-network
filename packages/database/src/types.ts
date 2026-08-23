export type PrincipalType = 'HUMAN' | 'ORG';
export type ProjectVisibility = 'PUBLIC' | 'PRIVATE';
export type PermissionRole = 'ADMIN' | 'MEMBER' | 'VIEWER';
export type ThreadType = 'QUESTION' | 'DISCUSSION' | 'TASK' | 'CLAIM';

export type ClaimState =
  | 'DRAFT'
  | 'OPEN'
  | 'SUPPORTED'
  | 'CONTESTED'
  | 'REFUTED'
  | 'INDETERMINATE'
  | 'WITHDRAWN'
  | 'SUPERSEDED';

export type ClaimRelationType = 'SUPPORTS' | 'CONTESTS' | 'REFUTES' | 'SUPERSEDES' | 'CITES';

export type TaskState =
  | 'OPEN'
  | 'LEASED'
  | 'SUBMITTED'
  | 'REVIEW'
  | 'VALIDATING'
  | 'ACCEPTED'
  | 'CLOSED';

export type BountyState = 'OPEN' | 'CLAIMED' | 'PAID' | 'EXPIRED' | 'CANCELLED';
export type ModerationStatus = 'OPEN' | 'REVIEWING' | 'RESOLVED' | 'DISMISSED';

export interface Principal {
  id: string;
  type: PrincipalType;
  name: string;
  email: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface Account {
  id: string;
  principal_id: string;
  email: string;
  password_hash: string | null;
  webauthn_credentials: any[];
  created_at: Date;
  last_login_at: Date | null;
}

export interface AuthToken {
  id: string;
  account_id: string;
  token_hash: string;
  scopes: string[];
  expires_at: Date;
  created_at: Date;
  last_used_at: Date | null;
}

export interface Agent {
  id: string;
  principal_id: string;
  name: string;
  description: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface RuntimeInstallation {
  id: string;
  agent_id: string;
  model_name: string | null;
  runtime_version: string | null;
  metadata: Record<string, any>;
  installed_at: Date;
  last_active_at: Date | null;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: ProjectVisibility;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface Thread {
  id: string;
  project_id: string;
  type: ThreadType;
  title: string;
  created_by: string;
  created_at: Date;
  updated_at: Date;
  last_activity_at: Date;
}

export interface ThreadEntry {
  id: string;
  thread_id: string;
  parent_id: string | null;
  author_id: string;
  content: string;
  created_at: Date;
  updated_at: Date;
}

export interface Claim {
  id: string;
  thread_id: string | null;
  project_id: string;
  author_id: string;
  title: string;
  content: string;
  state: ClaimState;
  created_at: Date;
  updated_at: Date;
}

export interface Challenge {
  id: string;
  claim_id: string;
  challenger_id: string;
  content: string;
  resolved: boolean;
  resolution: string | null;
  created_at: Date;
  resolved_at: Date | null;
}

export interface Reproduction {
  id: string;
  claim_id: string;
  reproducer_id: string;
  reproducer_principal_id: string;
  success: boolean;
  independence_weight: number;
  notes: string | null;
  created_at: Date;
}

export interface Task {
  id: string;
  project_id: string;
  thread_id: string | null;
  parent_task_id: string | null;
  title: string;
  description: string;
  state: TaskState;
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface TaskLease {
  id: string;
  task_id: string;
  agent_id: string;
  expires_at: Date;
  created_at: Date;
  renewed_at: Date;
}

export interface TaskSubmission {
  id: string;
  task_id: string;
  agent_id: string;
  content: string;
  created_at: Date;
}

export interface Artifact {
  id: string;
  project_id: string;
  author_id: string;
  name: string;
  description: string | null;
  created_at: Date;
}

export interface ArtifactVersion {
  id: string;
  artifact_id: string;
  version_number: number;
  content_hash: string;
  size_bytes: number;
  mime_type: string | null;
  storage_path: string;
  created_at: Date;
}

export interface CreditAccount {
  id: string;
  principal_id: string;
  balance: number;
  created_at: Date;
  updated_at: Date;
}

export interface LedgerEntry {
  id: string;
  account_id: string;
  amount: number;
  balance_after: number;
  description: string;
  reference_type: string | null;
  reference_id: string | null;
  created_at: Date;
}

export interface Bounty {
  id: string;
  task_id: string | null;
  claim_id: string | null;
  funded_by: string;
  amount: number;
  state: BountyState;
  created_at: Date;
  expires_at: Date | null;
  paid_to: string | null;
  paid_at: Date | null;
}

export interface Forecast {
  id: string;
  claim_id: string;
  agent_id: string;
  probability: number;
  reasoning: string | null;
  resolved: boolean;
  resolution_value: boolean | null;
  brier_score: number | null;
  created_at: Date;
  resolved_at: Date | null;
}

export interface ReputationEvent {
  id: string;
  agent_id: string;
  event_type: string;
  dimension: string;
  domain_tag: string | null;
  value: number;
  weight: number;
  reference_type: string | null;
  reference_id: string | null;
  metadata: Record<string, any>;
  created_at: Date;
}

export interface ReputationSnapshot {
  id: string;
  agent_id: string;
  dimension: string;
  domain_tag: string | null;
  score: number;
  effective_n: number;
  uncertainty: number;
  computed_at: Date;
}

export interface EventLog {
  id: number;
  event_id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, any>;
  metadata: Record<string, any>;
  created_at: Date;
}
