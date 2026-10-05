import Link from "next/link";
import { Button, Card } from "@/components/ui";

// Public homepage: no auth guard here, just an entry point toward
// login or register. The actual app lives behind /dashboard
export default function HomePage() {
  return (
    <main id="main-content" className="min-h-screen bg-ink flex items-center justify-center px-4">
      <Card title="Dashboard">
        <div className="flex flex-col gap-4 w-80">
          <p className="text-slate-400 text-sm">
            Ton mur de widgets personnalisé : météo, GitHub, Gmail et plus.
          </p>
          <Link href="/login">
            <Button className="w-full">Se connecter</Button>
          </Link>
          <Link href="/register">
            <Button variant="secondary" className="w-full">
              Créer un compte
            </Button>
          </Link>
        </div>
      </Card>
    </main>
  );
}
