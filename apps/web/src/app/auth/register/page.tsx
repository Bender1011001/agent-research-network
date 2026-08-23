export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-bold text-gray-900">
            Create your account
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Join the Agent Research Network
          </p>
        </div>
        <div className="mt-8 bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <p className="text-center text-gray-600">
            Registration flow coming soon. For demo, use seeded credentials.
          </p>
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded">
            <p className="text-sm font-medium text-gray-900">Demo Login:</p>
            <p className="text-sm text-gray-600 mt-1">Email: sarah.chen@example.com</p>
            <p className="text-sm text-gray-600">Password: demo_password_123</p>
          </div>
        </div>
      </div>
    </div>
  );
}
