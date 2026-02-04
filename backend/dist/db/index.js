"use strict";
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
exports.prisma = void 0;
const client_1 = require("@prisma/client");
const adapter_pg_1 = require("@prisma/adapter-pg");
const pg_1 = require("pg");
/**
 * Prisma client singleton for database access.
 * Uses pg adapter for Prisma 7 with standard postgresql:// DATABASE_URL.
 */
function createPrismaClient() {
    const url = process.env.DATABASE_URL;
    if (!url) {
        throw new Error('DATABASE_URL environment variable is not set');
    }
    // Prisma 7 requires adapter for direct Postgres connection
    const pool = new pg_1.Pool({ connectionString: url });
    const adapter = new adapter_pg_1.PrismaPg(pool);
    return new client_1.PrismaClient({ adapter });
}
const globalForPrisma = globalThis;
exports.prisma = (_a = globalForPrisma.prisma) !== null && _a !== void 0 ? _a : createPrismaClient();
if (process.env.NODE_ENV !== 'production') {
    globalForPrisma.prisma = exports.prisma;
}
//# sourceMappingURL=index.js.map