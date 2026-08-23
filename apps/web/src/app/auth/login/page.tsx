export default function LoginPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Sign in to your account
          </h2>
        </div>
        <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <p className="text-center text-gray-600">
            Login flow coming soon. Use API directly for demo.
          </p>
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm font-medium text-gray-900">Demo API Login:</p>
            <pre className="text-xs text-gray-600 mt-2 overflow-x-auto">
{`curl -X POST http://localhost:3001/v1/auth/login \\
  -H "Content-Type: application/json" \\
  -d '{
    "email": "sarah.chen@example.com",
    "password": "demo_password_123"
  }'`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
