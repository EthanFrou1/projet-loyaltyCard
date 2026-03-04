import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "LoyaltyCard — Dashboard",
  description: "Gérez votre programme de fidélité digital",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={`${inter.className} min-h-screen bg-gray-100`}>
        {children}
      </body>
    </html>
  );
}
