/**
 * Seed — données initiales
 *
 * Crée :
 *   - 1 business (salon de coiffure de démo)
 *   - 1 utilisateur admin
 *   - 1 programme fidélité STAMPS (10 tampons = 10€)
 *
 * Usage :
 *   cd packages/database
 *   npx dotenv -e ../../.env -- tsx src/seed.ts
 *
 * Ou depuis la racine :
 *   npm run db:seed -w @loyalty/database
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Démarrage du seed...");

  // ── Business ──────────────────────────────────────────────────────────────
  const business = await prisma.business.upsert({
    where: { slug: "salon-demo" },
    update: {},
    create: {
      name: "Salon Demo",
      slug: "salon-demo",
      settings_json: { plan: "pro" },
    },
  });

  console.log(`✓ Business créé : ${business.name} (id: ${business.id})`);

  // ── Utilisateur admin ─────────────────────────────────────────────────────
  // Mot de passe par défaut : "admin1234" — À CHANGER EN PRODUCTION
  const passwordHash = await bcrypt.hash("admin1234", 12);

  const user = await prisma.user.upsert({
    where: { email: "admin@salon-demo.fr" },
    update: {},
    create: {
      email: "admin@salon-demo.fr",
      password_hash: passwordHash,
      role: "ADMIN",
      business_id: business.id,
    },
  });

  console.log(`✓ Utilisateur admin créé : ${user.email}`);

  // ── Programme fidélité STAMPS ─────────────────────────────────────────────
  // On prend le premier programme actif du business (MVP = 1 programme par business)
  const existingProgram = await prisma.program.findFirst({
    where: { business_id: business.id, status: "ACTIVE" },
  });
  const program = existingProgram ?? await prisma.program.create({
    data: {
      business_id: business.id,
      name: "Carte fidélité — 10 tampons",
      type: "STAMPS",
      config_json: {
        threshold: 10,
        reward_label: "10€ de réduction sur votre prochaine visite",
      },
      status: "ACTIVE",
    },
  });

  console.log(`✓ Programme : ${program.name} (id: ${program.id})`);

  console.log("\n✅ Seed terminé !\n");
  console.log("─────────────────────────────────────────");
  console.log("  URL dashboard : http://localhost:3000");
  console.log("  Email         : admin@salon-demo.fr");
  console.log("  Mot de passe  : admin1234");
  console.log("─────────────────────────────────────────\n");
  console.log("⚠️  Changez le mot de passe en production !");
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed :", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
