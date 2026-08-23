import { Database } from '@arn/database';
import type { Artifact, ArtifactVersion } from '@arn/database';
import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface CreateArtifactInput {
  project_id: string;
  author_id: string;
  name: string;
  description?: string;
}

export interface UploadVersionInput {
  artifact_id: string;
  file_path: string;
  mime_type?: string;
}

export class ArtifactService {
  private storageRoot: string;

  constructor(
    private db: Database,
    storageRoot: string = process.env.ARTIFACT_STORAGE_ROOT || './storage/artifacts'
  ) {
    this.storageRoot = storageRoot;
  }

  async createArtifact(input: CreateArtifactInput): Promise<Artifact> {
    return this.db.transaction(async (client) => {
      const result = await client.query<Artifact>(
        `INSERT INTO artifacts (project_id, author_id, name, description)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [input.project_id, input.author_id, input.name, input.description || null]
      );

      const artifact = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['artifact.created', 'artifact', artifact.id, JSON.stringify(artifact)]
      );

      return artifact;
    });
  }

  async uploadVersion(input: UploadVersionInput): Promise<ArtifactVersion> {
    const fileBuffer = await fs.readFile(input.file_path);
    const contentHash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
    const sizeBytes = fileBuffer.length;

    return this.db.transaction(async (client) => {
      const existingVersion = await client.query<ArtifactVersion>(
        'SELECT * FROM artifact_versions WHERE artifact_id = $1 AND content_hash = $2',
        [input.artifact_id, contentHash]
      );

      if (existingVersion.rows.length > 0) {
        return existingVersion.rows[0];
      }

      const versionResult = await client.query<{ max_version: number }>(
        'SELECT COALESCE(MAX(version_number), 0) as max_version FROM artifact_versions WHERE artifact_id = $1',
        [input.artifact_id]
      );

      const nextVersion = versionResult.rows[0].max_version + 1;

      const storagePath = path.join(contentHash.slice(0, 2), contentHash.slice(2, 4), contentHash);
      const fullPath = path.join(this.storageRoot, storagePath);

      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, fileBuffer);

      const result = await client.query<ArtifactVersion>(
        `INSERT INTO artifact_versions (artifact_id, version_number, content_hash, size_bytes, mime_type, storage_path)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [input.artifact_id, nextVersion, contentHash, sizeBytes, input.mime_type || null, storagePath]
      );

      const version = result.rows[0];

      await client.query(
        `INSERT INTO event_log (event_type, aggregate_type, aggregate_id, payload)
         VALUES ($1, $2, $3, $4)`,
        ['artifact.version_uploaded', 'artifact_version', version.id, JSON.stringify(version)]
      );

      return version;
    });
  }

  async getArtifact(artifactId: string): Promise<Artifact> {
    const result = await this.db.query<Artifact>('SELECT * FROM artifacts WHERE id = $1', [artifactId]);
    if (result.rows.length === 0) {
      throw new Error('Artifact not found');
    }
    return result.rows[0];
  }

  async getVersion(versionId: string): Promise<ArtifactVersion> {
    const result = await this.db.query<ArtifactVersion>(
      'SELECT * FROM artifact_versions WHERE id = $1',
      [versionId]
    );
    if (result.rows.length === 0) {
      throw new Error('Version not found');
    }
    return result.rows[0];
  }

  async listVersions(artifactId: string): Promise<ArtifactVersion[]> {
    const result = await this.db.query<ArtifactVersion>(
      'SELECT * FROM artifact_versions WHERE artifact_id = $1 ORDER BY version_number DESC',
      [artifactId]
    );
    return result.rows;
  }

  async getVersionContent(versionId: string): Promise<Buffer> {
    const version = await this.getVersion(versionId);
    const fullPath = path.join(this.storageRoot, version.storage_path);
    return await fs.readFile(fullPath);
  }
}
