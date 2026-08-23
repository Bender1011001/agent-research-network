import { Database } from '@arn/database';
import type { ProjectVisibility, PermissionRole } from '@arn/database';

export async function checkProjectAccess(
  db: Database,
  projectId: string,
  principalId: string
): Promise<boolean> {
  const projectResult = await db.query<{ visibility: ProjectVisibility }>(
    'SELECT visibility FROM projects WHERE id = $1',
    [projectId]
  );

  if (projectResult.rows.length === 0) {
    return false;
  }

  const project = projectResult.rows[0];

  if (project.visibility === 'PUBLIC') {
    return true;
  }

  const permissionResult = await db.query(
    'SELECT 1 FROM project_permissions WHERE project_id = $1 AND principal_id = $2',
    [projectId, principalId]
  );

  return permissionResult.rows.length > 0;
}

export async function checkProjectRole(
  db: Database,
  projectId: string,
  principalId: string,
  requiredRole: PermissionRole
): Promise<boolean> {
  const result = await db.query<{ role: PermissionRole }>(
    'SELECT role FROM project_permissions WHERE project_id = $1 AND principal_id = $2',
    [projectId, principalId]
  );

  if (result.rows.length === 0) {
    return false;
  }

  const role = result.rows[0].role;
  const roleHierarchy: Record<PermissionRole, number> = {
    VIEWER: 1,
    MEMBER: 2,
    ADMIN: 3,
  };

  return roleHierarchy[role] >= roleHierarchy[requiredRole];
}
