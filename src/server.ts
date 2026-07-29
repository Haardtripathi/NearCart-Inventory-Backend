import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";
import { connectRedis, disconnectRedis } from "./config/redis";
import { registerOrderConfirmationSweep } from "./jobs/order-confirmation-sweep";

void connectRedis().catch((error) => {
  console.error("Redis connection failed, running without Redis", error);
});

const server = app.listen(env.PORT, () => {
  console.log(`NearCart Inventory backend running on port ${env.PORT}`);
  registerOrderConfirmationSweep();
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${env.PORT} is already in use. Stop the existing process or change PORT in .env.`,
    );
    // `.finally()` runs the callback but still propagates a rejection from `$disconnect()` — a
    // trailing `.catch()` is needed so that rejection doesn't become an unhandled rejection on this
    // voided promise (same fire-and-forget bug class flagged elsewhere in this backend).
    void prisma
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
  void prisma
    .$disconnect()
    .catch((disconnectError) => {
      console.error("Error disconnecting Prisma during startup-failure shutdown", disconnectError);
    })
    .finally(() => {
      process.exit(1);
    });
});

async function shutdown(signal: string, onClosed?: () => void) {
  console.log(`${signal} received, shutting down gracefully`);
  server.close(() => {
    // `server.close`'s callback type is a plain sync callback — it does not await or attach a
    // handler to whatever an async callback returns, so a rejection from an `async` callback here
    // would previously become a fully disconnected, unhandled rejection. Wrapped in try/catch so
    // shutdown always reaches `process.exit`/`onClosed` instead of risking a crash mid-shutdown.
    void (async () => {
      try {
        await prisma.$disconnect();
        await disconnectRedis();
      } catch (error) {
        console.error(`Error during ${signal} graceful shutdown`, error);
      } finally {
        if (onClosed) {
          onClosed();
        } else {
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
