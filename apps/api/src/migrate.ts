// Superseded by Prisma. Run `npm run migrate` from the project root instead
// (it calls `prisma migrate deploy` in packages/db). You can delete this file.
import { spawnSync } from "child_process";
import path from "path";

const script = path.resolve(__dirname, "../../../packages/db/scripts/prisma.js");
const result = spawnSync(process.execPath, [script, "migrate", "deploy"], { stdio: "inherit" });
process.exit(result.status ?? 1);
