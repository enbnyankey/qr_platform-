import { PrismaClient } from "@prisma/client";
export * from "@prisma/client";
export declare const prisma: PrismaClient;
export * as billing from "./billing";
export declare const ports: { web: number; api: number; resolver: number };
