import bcrypt from "bcryptjs";
import "./config";
import { prisma } from "./db";

/** Creates (or promotes) the first Super Admin from SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD. */
async function seed() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) throw new Error("Set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD in .env");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.user.upsert({
    where: { email },
    create: { email, fullName: "Platform Admin", passwordHash, emailVerifiedAt: new Date(), isSuperAdmin: true },
    // Re-running seed resets the admin password to the one in .env, which is handy if you forget it.
    update: { isSuperAdmin: true, passwordHash, emailVerifiedAt: new Date(), status: "active" },
  });
  console.log(`Super admin ready: ${email}`);
}

seed()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err.message);
    await prisma.$disconnect();
    process.exit(1);
  });
