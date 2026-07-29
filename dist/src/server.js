"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const env_1 = require("./config/env");
const prisma_1 = require("./config/prisma");
const redis_1 = require("./config/redis");
const order_confirmation_sweep_1 = require("./jobs/order-confirmation-sweep");
void (0, redis_1.connectRedis)().catch((error) => {
    console.error("Redis connection failed, running without Redis", error);
});
const server = app_1.app.listen(env_1.env.PORT, () => {
    console.log(`NearCart Inventory backend running on port ${env_1.env.PORT}`);
    (0, order_confirmation_sweep_1.registerOrderConfirmationSweep)();
});
server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${env_1.env.PORT} is already in use. Stop the existing process or change PORT in .env.`);
        // `.finally()` runs the callback but still propagates a rejection from `$disconnect()` — a
        // trailing `.catch()` is needed so that rejection doesn't become an unhandled rejection on this
        // voided promise (same fire-and-forget bug class flagged elsewhere in this backend).
        void prisma_1.prisma
            .$disconnect()
            .catch((disconnectError) => {
            console.error("Error disconnecting Prisma during EADDRINUSE shutdown", disconnectError);
        })
            .finally(() => {
            process.exit(1);
        });
        return;
    }
    console.error("Server failed to start", error);
    void prisma_1.prisma
        .$disconnect()
        .catch((disconnectError) => {
        console.error("Error disconnecting Prisma during startup-failure shutdown", disconnectError);
    })
        .finally(() => {
        process.exit(1);
    });
});
async function shutdown(signal, onClosed) {
    console.log(`${signal} received, shutting down gracefully`);
    server.close(() => {
        // `server.close`'s callback type is a plain sync callback — it does not await or attach a
        // handler to whatever an async callback returns, so a rejection from an `async` callback here
        // would previously become a fully disconnected, unhandled rejection. Wrapped in try/catch so
        // shutdown always reaches `process.exit`/`onClosed` instead of risking a crash mid-shutdown.
        void (async () => {
            try {
                await prisma_1.prisma.$disconnect();
                await (0, redis_1.disconnectRedis)();
            }
            catch (error) {
                console.error(`Error during ${signal} graceful shutdown`, error);
            }
            finally {
                if (onClosed) {
                    onClosed();
                }
                else {
                    process.exit(0);
                }
            }
        })();
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
