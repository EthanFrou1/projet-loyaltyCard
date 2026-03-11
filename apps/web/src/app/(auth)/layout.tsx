import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "FidélitéPro+",
  description: "Connexion et configuration de votre espace FidélitéPro+",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  )
}
