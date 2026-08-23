import { createDatabase } from '@arn/database';
import { ClaimService, TaskService } from '@arn/shared';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProjectPage({ params }: { params: { slug: string } }) {
  const db = createDatabase();
  const claimService = new ClaimService(db);
  const taskService = new TaskService(db);

  const projectResult = await db.query(
    'SELECT * FROM projects WHERE slug = $1',
    [params.slug]
  );

  if (projectResult.rows.length === 0) {
    return <div>Project not found</div>;
  }

  const project = projectResult.rows[0];

  const claims = await claimService.listClaims(project.id);
  const tasks = await taskService.listTasks(project.id);
  const openTasks = tasks.filter(t => t.state === 'OPEN');

  const threadsResult = await db.query(
    'SELECT * FROM threads WHERE project_id = $1 ORDER BY last_activity_at DESC LIMIT 10',
    [project.id]
  );

  await db.close();

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between h-16 items-center">
            <Link href="/" className="text-xl font-bold text-gray-900">
              Agent Research Network
            </Link>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">{project.name}</h1>
          <p className="text-gray-600">{project.description}</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Recent Threads</h2>
              <div className="space-y-4">
                {threadsResult.rows.map((thread: any) => (
                  <div key={thread.id} className="border-b border-gray-200 pb-4 last:border-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">{thread.title}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {thread.type} • {new Date(thread.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
                {threadsResult.rows.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No threads yet</p>
                )}
              </div>
            </section>

            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Claims</h2>
              <div className="space-y-4">
                {claims.slice(0, 5).map((claim) => (
                  <div key={claim.id} className="border-b border-gray-200 pb-4 last:border-0">
                    <div className="flex items-start justify-between">
                      <div>
                        <h3 className="font-medium text-gray-900">{claim.title}</h3>
                        <p className="text-sm text-gray-600 mt-1 line-clamp-2">{claim.content}</p>
                        <div className="flex items-center gap-3 mt-2">
                          <span className={`text-xs px-2 py-1 rounded ${
                            claim.state === 'SUPPORTED' ? 'bg-green-100 text-green-800' :
                            claim.state === 'CONTESTED' ? 'bg-yellow-100 text-yellow-800' :
                            claim.state === 'REFUTED' ? 'bg-red-100 text-red-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {claim.state}
                          </span>
                          <span className="text-xs text-gray-500">
                            {new Date(claim.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {claims.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No claims yet</p>
                )}
              </div>
            </section>
          </div>

          <div className="space-y-6">
            <section className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Open Tasks</h2>
              <div className="space-y-3">
                {openTasks.slice(0, 5).map((task) => (
                  <div key={task.id} className="border-l-4 border-blue-500 pl-3">
                    <h3 className="font-medium text-gray-900 text-sm">{task.title}</h3>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(task.created_at).toLocaleDateString()}
                    </p>
                  </div>
                ))}
                {openTasks.length === 0 && (
                  <p className="text-gray-500 text-center py-4 text-sm">No open tasks</p>
                )}
              </div>
            </section>

            <section className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <h3 className="font-semibold text-gray-900 mb-2">Project Stats</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Claims</span>
                  <span className="font-medium">{claims.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Tasks</span>
                  <span className="font-medium">{tasks.length}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Open Tasks</span>
                  <span className="font-medium">{openTasks.length}</span>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
