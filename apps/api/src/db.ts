import { Prisma, prisma } from "@qr/db";

export { prisma, Prisma };

/** Either the root client or the client inside a $transaction callback. */
export type Db = Prisma.TransactionClient | typeof prisma;
