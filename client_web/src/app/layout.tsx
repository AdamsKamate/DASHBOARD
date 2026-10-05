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
        {/*
          Skip link, first in the tab order and invisible until focused
          Without it, a keyboard user reaching the dashboard has to tab past
          the header, then through every widget's move handle, refresh and
          delete buttons before arriving anywhere useful. With twelve widgets
          that is thirty-odd presses on every page load
          It only appears on focus, which is the standard pattern: sighted
          mouse users never see it, keyboard users find it immediately
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
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
