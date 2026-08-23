import { ProjectService } from '../src/services/project-service';
import { createDatabase, Database } from '@arn/database';

describe('ProjectService', () => {
  let db: Database;
  let projectService: ProjectService;
  let principalId: string;

  beforeAll(async () => {
    db = createDatabase();
    projectService = new ProjectService(db);

    const principal = await db.query(
      "INSERT INTO principals (type, name, email) VALUES ('HUMAN', 'Test User', 'test@example.com') RETURNING id"
    );
    principalId = principal.rows[0].id;
  });

  afterAll(async () => {
    await db.close();
  });

  describe('Project Creation', () => {
    it('should create a project with auto-generated slug', async () => {
      const project = await projectService.createProject({
        name: 'Test Research Project',
        description: 'A test project for research',
        created_by: principalId,
      });

      expect(project.id).toBeDefined();
      expect(project.name).toBe('Test Research Project');
      expect(project.slug).toMatch(/^test-research-project-[a-f0-9]{6}$/);
      expect(project.description).toBe('A test project for research');
      expect(project.visibility).toBe('PUBLIC');
      expect(project.created_by).toBe(principalId);
    });

    it('should create a project with custom slug', async () => {
      const project = await projectService.createProject({
        name: 'Custom Slug Project',
        slug: 'my-custom-slug',
        created_by: principalId,
      });

      expect(project.slug).toBe('my-custom-slug');
    });

    it('should create a private project', async () => {
      const project = await projectService.createProject({
        name: 'Private Project',
        visibility: 'PRIVATE',
        created_by: principalId,
      });

      expect(project.visibility).toBe('PRIVATE');
    });

    it('should grant ADMIN permissions to creator', async () => {
      const project = await projectService.createProject({
        name: 'Permissions Test Project',
        created_by: principalId,
      });

      const permissions = await db.query(
        'SELECT * FROM project_permissions WHERE project_id = $1 AND principal_id = $2',
        [project.id, principalId]
      );

      expect(permissions.rows).toHaveLength(1);
      expect(permissions.rows[0].role).toBe('ADMIN');
    });
  });

  describe('Project Retrieval', () => {
    let testProjectId: string;

    beforeAll(async () => {
      const project = await projectService.createProject({
        name: 'Retrieval Test Project',
        slug: 'retrieval-test',
        created_by: principalId,
      });
      testProjectId = project.id;
    });

    it('should get project by ID', async () => {
      const project = await projectService.getProject(testProjectId);

      expect(project).toBeDefined();
      expect(project?.id).toBe(testProjectId);
      expect(project?.name).toBe('Retrieval Test Project');
    });

    it('should get project by slug', async () => {
      const project = await projectService.getProjectBySlug('retrieval-test');

      expect(project).toBeDefined();
      expect(project?.id).toBe(testProjectId);
      expect(project?.slug).toBe('retrieval-test');
    });

    it('should return null for non-existent project', async () => {
      const project = await projectService.getProject('00000000-0000-0000-0000-000000000000');

      expect(project).toBeNull();
    });
  });

  describe('Project Listing', () => {
    beforeAll(async () => {
      await projectService.createProject({
        name: 'Public Project 1',
        visibility: 'PUBLIC',
        created_by: principalId,
      });

      await projectService.createProject({
        name: 'Public Project 2',
        visibility: 'PUBLIC',
        created_by: principalId,
      });

      await projectService.createProject({
        name: 'Private Project 1',
        visibility: 'PRIVATE',
        created_by: principalId,
      });
    });

    it('should list all projects when no filter is provided', async () => {
      const projects = await projectService.listProjects();

      expect(projects.length).toBeGreaterThanOrEqual(3);
    });

    it('should list only public projects when filtered', async () => {
      const projects = await projectService.listProjects('PUBLIC');

      expect(projects.length).toBeGreaterThanOrEqual(2);
      projects.forEach((project) => {
        expect(project.visibility).toBe('PUBLIC');
      });
    });

    it('should list only private projects when filtered', async () => {
      const projects = await projectService.listProjects('PRIVATE');

      expect(projects.length).toBeGreaterThanOrEqual(1);
      projects.forEach((project) => {
        expect(project.visibility).toBe('PRIVATE');
      });
    });

    it('should respect limit parameter', async () => {
      const projects = await projectService.listProjects(undefined, 2);

      expect(projects.length).toBeLessThanOrEqual(2);
    });

    it('should list projects by creator', async () => {
      const projects = await projectService.listProjectsByCreator(principalId);

      expect(projects.length).toBeGreaterThanOrEqual(3);
      projects.forEach((project) => {
        expect(project.created_by).toBe(principalId);
      });
    });
  });
});
