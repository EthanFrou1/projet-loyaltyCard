import path from "node:path";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Requis par le Dockerfile web qui lance `node server.js` depuis .next/standalone
  output: "standalone",
  // Monorepo: autorise le file tracing en dehors de apps/web
  experimental: {
    outputFileTracingRoot: path.join(process.cwd(), "../../"),
  },

  // Permet d'importer des packages du monorepo sans transpilation manuelle
  transpilePackages: ["@loyalty/types"],

  // Headers de sécurité de base
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
