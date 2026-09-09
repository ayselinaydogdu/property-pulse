import { PrismaClient } from "@prisma/client";

// Next.js dev'de hot reload her seferinde yeni client açmasın diye global'de tutulur.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
