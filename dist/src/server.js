"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const prisma_1 = require("./config/prisma");
const server = app_1.app.listen(env_1.env.PORT, () => {
    console.log(`NearCart Inventory backend running on port ${env_1.env.PORT}`);
});
async function shutdown(signal) {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(async () => {
        await prisma_1.prisma.$disconnect();
        process.exit(0);
    });
}
process.on("SIGINT", () => {
    void shutdown("SIGINT");
});
process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
});
