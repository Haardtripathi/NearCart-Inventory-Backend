import { app } from "./app";
import { env } from "./config/env";
import { prisma } from "./config/prisma";

const server = app.listen(env.PORT, () => {
  console.log(`NearCart Inventory backend running on port ${env.PORT}`);
});

server.on("error", (error: NodeJS.ErrnoException) => {
  if (error.code === "EADDRINUSE") {
    console.error(
      `Port ${env.PORT} is already in use. Stop the existing process or change PORT in .env.`,
    );
    void prisma.$disconnect().finally(() => {
      process.exit(1);
    });
    return;
  }

  console.error("Server failed to start", error);
  void prisma.$disconnect().finally(() => {
    process.exit(1);
  });
});

async function shutdown(signal: string, onClosed?: () => void) {
  console.log(`${signal} received, shutting down gracefully`);
  server.close(async () => {
    await prisma.$disconnect();
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
