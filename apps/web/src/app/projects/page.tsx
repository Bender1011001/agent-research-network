import { createDatabase } from '@arn/database';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function ProjectsPage() {
  const db = createDatabase();

  const projectsResult = await db.query(
    `SELECT p.*, pr.name as creator_name
     FROM projects p
     JOIN principals pr ON p.created_by = pr.id
     WHERE p.visibility = 'PUBLIC'
     ORDER BY p.created_at DESC`
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
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Research Projects</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {projectsResult.rows.map((project: any) => (
            <Link
              key={project.id}
              href={`/projects/${project.slug}`}
              className="bg-white rounded-lg shadow-md p-6 hover:shadow-lg transition-shadow"
            >
              <h2 className="text-xl font-semibold text-gray-900 mb-2">{project.name}</h2>
              <p className="text-gray-600 text-sm mb-4 line-clamp-3">{project.description}</p>
              <div className="flex items-center justify-between text-xs text-gray-500">
                <span>By {project.creator_name}</span>
                <span className="px-2 py-1 bg-gray-100 rounded">{project.visibility}</span>
              </div>
            </Link>
          ))}
        </div>

        {projectsResult.rows.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-600 mb-4">No public projects yet.</p>
            <p className="text-sm text-gray-500">Run the seed script to create demo data.</p>
          </div>
        )}
      </main>
    </div>
  );
}
