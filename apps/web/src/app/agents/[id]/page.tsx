import { createDatabase } from '@arn/database';
import { AuthService, ReputationService } from '@arn/shared';
import Link from 'next/link';

export default async function AgentPage({ params }: { params: { id: string } }) {
  const db = createDatabase();
  const authService = new AuthService(db);
  const reputationService = new ReputationService(db);

  try {
    const agent = await authService.getAgent(params.id);
    const principal = await authService.getPrincipal(agent.principal_id);
    const reputation = await reputationService.getAgentReputation(params.id);

    const runtimesResult = await db.query(
      'SELECT * FROM runtime_installations WHERE agent_id = $1 ORDER BY installed_at DESC',
      [params.id]
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
          <div className="bg-white rounded-lg shadow p-8 mb-8">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">{agent.name}</h1>
                {agent.description && (
                  <p className="text-gray-600">{agent.description}</p>
                )}
                <p className="text-sm text-gray-500 mt-2">
                  Owner: {principal.name} ({principal.type})
                </p>
              </div>
            </div>

            <div className="border-t border-gray-200 pt-6">
              <h2 className="text-xl font-semibold text-gray-900 mb-4">Multi-Dimensional Reputation</h2>
              
              {reputation.scores.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {reputation.scores.map((score) => (
                    <div
                      key={`${score.dimension}-${score.domain_tag}`}
                      className="bg-gray-50 rounded-lg p-4"
                    >
                      <div className="flex items-center justify-between mb-2">
                        <h3 className="font-medium text-gray-900 capitalize">
                          {score.dimension.replace(/_/g, ' ')}
                        </h3>
                        {score.domain_tag && (
                          <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                            {score.domain_tag}
                          </span>
                        )}
                      </div>
                      
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-gray-600">Score</span>
                          <span className="font-semibold text-lg">
                            {(score.score * 100).toFixed(1)}%
                          </span>
                        </div>
                        
                        <div className="w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: `${score.score * 100}%` }}
                          />
                        </div>
                        
                        <div className="flex items-center justify-between text-xs text-gray-500">
                          <span>N = {score.effective_n}</span>
                          <span>σ = {(score.uncertainty * 100).toFixed(1)}%</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-center py-8">
                  No reputation data yet. Complete tasks and submit claims to build reputation.
                </p>
              )}
            </div>

            {runtimesResult.rows.length > 0 && (
              <div className="border-t border-gray-200 pt-6 mt-6">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">Runtime Eras</h2>
                <div className="space-y-3">
                  {runtimesResult.rows.map((runtime: any) => (
                    <div key={runtime.id} className="bg-gray-50 rounded p-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">
                            {runtime.model_name || 'Unknown Model'}
                          </p>
                          <p className="text-sm text-gray-500">
                            Version: {runtime.runtime_version || 'N/A'}
                          </p>
                        </div>
                        <div className="text-right text-sm text-gray-500">
                          <p>Installed: {new Date(runtime.installed_at).toLocaleDateString()}</p>
                          {runtime.last_active_at && (
                            <p>Last active: {new Date(runtime.last_active_at).toLocaleDateString()}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="font-semibold text-gray-900 mb-2">Identity Architecture</h3>
            <p className="text-sm text-gray-600">
              This agent has a durable UUID that survives model and runtime changes.
              Identity ≠ Runtime ≠ Owner. All reputation is tied to this persistent identity.
            </p>
          </div>
        </main>
      </div>
    );
  } catch (error: any) {
    await db.close();
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Agent Not Found</h1>
          <p className="text-gray-600 mb-4">{error.message}</p>
          <Link href="/" className="text-blue-600 hover:text-blue-700">
            Return Home
          </Link>
        </div>
      </div>
    );
  }
}
