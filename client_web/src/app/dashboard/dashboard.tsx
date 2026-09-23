"use client";

import { useRouter } from "next/navigation";
import { useAuth } from "../../lib/auth/AuthProvider";
import { RequireAuth } from "../../lib/auth/guards";

// The dashboard is the main authenticated page of the application.
// The widget grid arrives with card 1.10.

function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-slate-50 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-600">{user?.email}</span>
          <button
            type="button"
            onClick={handleLogout}
            className="rounded border border-slate-300 px-3 py-1 text-sm hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      </header>
      <p className="mt-6 text-slate-500">The widget grid arrives with card 1.10.</p>
    </main>
  );
}

export default function DashboardPage() {
  return (
    <RequireAuth>
      <DashboardContent />
    </RequireAuth>
  );
}
