"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const prisma_1 = require("./config/prisma");
const redis_1 = require("./config/redis");
void (0, redis_1.connectRedis)().catch((error) => {
    console.error("Redis connection failed, running without Redis", error);
});
const server = app_1.app.listen(env_1.env.PORT, () => {
    console.log(`NearCart Inventory backend running on port ${env_1.env.PORT}`);
});
server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${env_1.env.PORT} is already in use. Stop the existing process or change PORT in .env.`);
        void prisma_1.prisma.$disconnect().finally(() => {
            process.exit(1);
        });
        return;
    }
    console.error("Server failed to start", error);
    void prisma_1.prisma.$disconnect().finally(() => {
        process.exit(1);
    });
});
async function shutdown(signal, onClosed) {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(async () => {
        await prisma_1.prisma.$disconnect();
        await (0, redis_1.disconnectRedis)();
        if (onClosed) {
            onClosed();
            return;
        }
        process.exit(0);
    });
}
process.on("SIGINT", () => {
    void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});
process.once("SIGUSR2", () => {
    void shutdown("SIGUSR2", () => {
        process.kill(process.pid, "SIGUSR2");
    });
});
