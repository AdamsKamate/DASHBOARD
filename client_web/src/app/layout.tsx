import "./globals.css";

export const metadata = {
  title: "Dashboard",
  description: "Built by you. For you.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
