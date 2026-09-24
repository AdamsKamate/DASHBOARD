"use client";

import { useRouter } from "next/navigation";
import { Button, Card } from "@/components/ui";
import { useAuth } from "@/lib/auth/AuthProvider";
import { RequireAuth } from "@/lib/auth/guards";

// The dashboard is the main authenticated page. The widget grid arrives
// with card 1.10.
function DashboardContent() {
  const { user, logout } = useAuth();
  const router = useRouter();

  async function handleLogout() {
    await logout();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-ink">
      <header className="flex items-center justify-between border-b border-line px-6 py-4">
        <h1 className="text-xl font-semibold text-white">Dashboard</h1>
        <div className="flex items-center gap-4">
          <span className="text-sm text-slate-400">{user?.email}</span>
          <Button variant="secondary" onClick={handleLogout}>
            Se déconnecter
          </Button>
        </div>
      </header>

      <div className="p-6">
        <Card title="Mes widgets">
          <p className="text-slate-400 text-sm">
            La grille de widgets arrive avec la carte 1.10.
          </p>
        </Card>
      </div>
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
