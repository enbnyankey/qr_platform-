import "./setup";
import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import path from "node:path";
import request from "supertest";
import bcrypt from "bcryptjs";
import { createApp } from "../src/app";
import { prisma } from "../src/db";

/** Help assistant: needs sign-in, validates input, and answers from the guide without an API key. */
const api = createApp();
let agent: ReturnType<typeof request.agent>;

before(async () => {
  await prisma.$executeRawUnsafe("DROP SCHEMA IF EXISTS public CASCADE");
  await prisma.$executeRawUnsafe("CREATE SCHEMA public");
  execFileSync(process.execPath, [path.resolve(__dirname, "../../../packages/db/scripts/prisma.js"), "migrate", "deploy"], { env: process.env, stdio: "ignore" });
  await prisma.user.create({ data: { email: "helper@example.com", fullName: "Helper", passwordHash: await bcrypt.hash("Passw0rd!", 4), emailVerifiedAt: new Date() } });
  agent = request.agent(api);
  await agent.post("/auth/login").send({ email: "helper@example.com", password: "Passw0rd!" }).expect(200);
});
after(() => prisma.$disconnect());

describe("Help assistant", () => {
  test("requires sign-in", async () => {
    await request(api).post("/help/chat").send({ messages: [{ role: "user", content: "hi" }] }).expect(401);
  });

  test("rejects a conversation that doesn't end with a question", async () => {
    await agent.post("/help/chat").send({ messages: [{ role: "assistant", content: "hello" }] }).expect(400);
  });

  test("without an API key, answers from the matching guide section", async () => {
    const res = await agent.post("/help/chat").send({ messages: [{ role: "user", content: "How do I change where a code goes without reprinting?" }] }).expect(200);
    assert.equal(res.headers["x-help-mode"], "guide-search");
    assert.match(res.text, /Change where a code goes/);
    assert.match(res.text, /Destination/);
  });
});
