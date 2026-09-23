import "./globals.css";
import { AuthProvider } from "../lib/auth/AuthProvider";

export const metadata = {
  title: "Dashboard",
  description: "Built by you. For you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        {/* Every page can read the session through useAuth(). */}
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
