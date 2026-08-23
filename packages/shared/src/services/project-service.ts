import { Database } from '@arn/database';
import * as crypto from 'crypto';

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  visibility: 'PUBLIC' | 'PRIVATE';
  created_by: string;
  created_at: Date;
  updated_at: Date;
}

export interface CreateProjectInput {
  name: string;
  slug?: string;
  description?: string;
  visibility?: 'PUBLIC' | 'PRIVATE';
  created_by: string;
}

export class ProjectService {
  constructor(private db: Database) {}

  private generateSlug(name: string): string {
    let slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    
    const uniqueSuffix = crypto.randomBytes(3).toString('hex');
    return `${slug}-${uniqueSuffix}`;
  }

  async createProject(input: CreateProjectInput): Promise<Project> {
    return this.db.transaction(async (client) => {
      const slug = input.slug || this.generateSlug(input.name);
      const visibility = input.visibility || 'PUBLIC';

      const result = await client.query<Project>(
        `INSERT INTO projects (name, slug, description, visibility, created_by)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [input.name, slug, input.description || null, visibility, input.created_by]
      );

      const project = result.rows[0];

      await client.query(
        `INSERT INTO project_permissions (project_id, principal_id, role)
         VALUES ($1, $2, 'ADMIN')`,
        [project.id, input.created_by]
      );

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['project.created', 'project', project.id, JSON.stringify(project)]
      );

      return project;
    });
  }

  async listProjects(visibility?: 'PUBLIC' | 'PRIVATE', limit: number = 50): Promise<Project[]> {
    let query = 'SELECT * FROM projects';
    const params: any[] = [];

    if (visibility) {
      query += ' WHERE visibility = $1';
      params.push(visibility);
    }

    query += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
    params.push(limit);

    const result = await this.db.query<Project>(query, params);
    return result.rows;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const result = await this.db.query<Project>(
      'SELECT * FROM projects WHERE id = $1',
      [projectId]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async getProjectBySlug(slug: string): Promise<Project | null> {
    const result = await this.db.query<Project>(
      'SELECT * FROM projects WHERE slug = $1',
      [slug]
    );
    return result.rows.length > 0 ? result.rows[0] : null;
  }

  async listProjectsByCreator(createdBy: string): Promise<Project[]> {
    const result = await this.db.query<Project>(
      'SELECT * FROM projects WHERE created_by = $1 ORDER BY created_at DESC',
      [createdBy]
    );
    return result.rows;
  }
}
