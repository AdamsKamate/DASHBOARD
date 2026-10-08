import "./globals.css";
import { SettingsProvider } from "@/lib/settings/SettingsProvider";
import { AuthProvider } from "../lib/auth/AuthProvider";

export const metadata = {
  title: "Dashboard",
  description: "Built by you. For you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        {/*
          Skip link, first in the tab order and invisible until focused
          Without it, a keyboard user reaching the dashboard has to tab past
          the header, then through every widget's move handle, refresh and
          delete buttons before arriving anywhere useful
        */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50
                     focus:rounded-md focus:bg-signal focus:px-4 focus:py-2
                     focus:font-medium focus:text-ink"
        >
          Aller au contenu principal
        </a>

        {/* Every page can read the session through useAuth() */}
        <SettingsProvider>
          <AuthProvider>{children}</AuthProvider>
        </SettingsProvider>
      </body>
    </html>
  );
}
