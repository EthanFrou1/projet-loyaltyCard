/**
 * Script de création d'un utilisateur de test.
 *
 * Usage :
 *   npx dotenv -e .env -- npx tsx scripts/create-user.ts
 *
 * Variables configurables ci-dessous.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// ── Configuration ─────────────────────────────────────────────────────────────

const CONFIG = {
  email:         "pro@demo.fr",
  password:      "password123",
  businessName:  "Salon Pro Demo",
  plan:          "PRO" as const,    // STARTER | PRO | BUSINESS
};

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const slug = CONFIG.businessName
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

  // Créer le business
  const business = await prisma.business.create({
    data: {
      name:     CONFIG.businessName,
      slug:     `${slug}-${Date.now()}`,
      plan:     CONFIG.plan,
      settings_json: {},
    },
  });

  // Créer le programme fidélité par défaut
  await prisma.program.create({
    data: {
      business_id: business.id,
      name:        "Carte fidélité",
      type:        "STAMPS",
      config_json: { threshold: 10, reward_label: "10€ de réduction" },
      status:      "ACTIVE",
      version:     1,
    },
  });

  // Créer l'utilisateur admin
  const password_hash = await bcrypt.hash(CONFIG.password, 12);
  await prisma.user.create({
    data: {
      email:         CONFIG.email,
      password_hash,
      role:          "ADMIN",
      business_id:   business.id,
    },
  });

  console.log("✅ Utilisateur créé avec succès !");
  console.log(`   Email    : ${CONFIG.email}`);
  console.log(`   Password : ${CONFIG.password}`);
  console.log(`   Plan     : ${CONFIG.plan}`);
  console.log(`   Business : ${CONFIG.businessName} (id: ${business.id})`);
}

main()
  .catch((err) => {
    console.error("❌ Erreur :", err.message);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
