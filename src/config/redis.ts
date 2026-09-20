import Redis from "ioredis";

import { env } from "./env";

type RedisCallArg = string | number;

export interface AppRedisClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, mode?: "EX", ttlSeconds?: number): Promise<"OK" | null>;
  // `call()` is for passing arbitrary/opaque commands straight through (e.g. rate-limit-redis's
  // EVALSHA scripts, whose first arg is a script hash, not a key) — it deliberately does NOT key-
  // prefix its arguments, since it has no way to know which args (if any) are keys. `del`/`ttl`
  // exist as separate, properly key-prefixed methods for the common case of operating on a single
  // known key (see the bug this fixed: otp.ts and driver-verification.service.ts were calling
  // `call("DEL"/"TTL", key)` expecting prefixing, which silently no-op'd under the Upstash REST
  // backend — the real prefixed key was never touched, so e.g. verified OTP codes stayed valid/
  // reusable until natural TTL expiry instead of being invalidated on use).
  call(command: string, ...args: RedisCallArg[]): Promise<unknown>;
  del(key: string): Promise<number>;
  ttl(key: string): Promise<number>;
  // Runs a Lua script atomically server-side. Unlike `call()`, `keys` ARE key-prefixed (each one
  // individually, same as get/set/del/ttl above) — only `args` (non-key values passed to the
  // script) are left as-is. This is what closes the otp.ts check-then-delete /
  // check-then-increment races: the whole "read attempts, compare code hash, delete-or-increment"
  // sequence runs as one atomic Redis operation instead of separate get/set round-trips a
  // concurrent request could interleave with.
  eval(script: string, keys: string[], args: RedisCallArg[]): Promise<unknown>;
  // Atomic `SET key value EX ttlSeconds NX` — true if this call actually set the key (it didn't
  // exist yet), false if it already existed (and was left untouched). Used by otp.ts's cooldown
  // claim: a plain GET-then-SET has the same class of race the Lua-scripted verify path was
  // written to close — concurrent callers could all read "no cooldown yet" before any of them
  // writes it, letting a burst of requests bypass the resend throttle entirely.
  setIfNotExists(key: string, value: string, ttlSeconds: number): Promise<boolean>;
  status: "ready" | "connecting" | "end";
  connect(): Promise<void>;
  quit(): Promise<void>;
}

class UpstashRestRedisClient implements AppRedisClient {
  status: "ready" | "connecting" | "end" = "end";

  constructor(
    private readonly restUrl: string,
    private readonly restToken: string,
    private readonly keyPrefix: string,
  ) {}

  private normalizeKey(key: string) {
    return `${this.keyPrefix}:${key}`;
  }

  private async runCommand(command: string, args: RedisCallArg[] = []) {
    const payload = [command.toUpperCase(), ...args.map((value) => String(value))];
    const response = await fetch(this.restUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.restToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    const data = (await response.json().catch(() => null)) as
      | { result?: unknown; error?: string }
      | unknown
      | null;

    if (!response.ok) {
      const errorMessage =
        typeof data === "object" && data && "error" in data && typeof data.error === "string"
          ? data.error
          : `Upstash REST request failed with status ${response.status}`;
      throw new Error(errorMessage);
    }

    if (typeof data === "object" && data && "error" in data && typeof data.error === "string") {
      throw new Error(data.error);
    }

    if (typeof data === "object" && data && "result" in data) {
      return data.result;
    }

    return data;
  }

  async get(key: string) {
    const value = await this.runCommand("GET", [this.normalizeKey(key)]);
    return typeof value === "string" ? value : null;
  }

  async set(key: string, value: string, mode?: "EX", ttlSeconds?: number) {
    const args: RedisCallArg[] = [this.normalizeKey(key), value];
    if (mode === "EX" && ttlSeconds) {
      args.push("EX", ttlSeconds);
    }

    const result = await this.runCommand("SET", args);
    return result === "OK" ? "OK" : null;
  }

  async call(command: string, ...args: RedisCallArg[]) {
    return this.runCommand(command, args);
  }

  async del(key: string) {
    const result = await this.runCommand("DEL", [this.normalizeKey(key)]);
    return Number(result) || 0;
  }

  async ttl(key: string) {
    const result = await this.runCommand("TTL", [this.normalizeKey(key)]);
    return Number(result);
  }

  async eval(script: string, keys: string[], args: RedisCallArg[]) {
    const prefixedKeys = keys.map((key) => this.normalizeKey(key));
    return this.runCommand("EVAL", [script, keys.length, ...prefixedKeys, ...args]);
  }

  async setIfNotExists(key: string, value: string, ttlSeconds: number) {
    const result = await this.runCommand("SET", [this.normalizeKey(key), value, "EX", ttlSeconds, "NX"]);
    return result === "OK";
  }

  async connect() {
    this.status = "connecting";
    await this.runCommand("PING");
    this.status = "ready";
  }

  async quit() {
    this.status = "end";
  }
}

class IoredisClientAdapter implements AppRedisClient {
  constructor(private readonly client: Redis) {}

  get status() {
    if (this.client.status === "ready") {
      return "ready" as const;
    }

    if (this.client.status === "connecting") {
      return "connecting" as const;
    }

    return "end" as const;
  }

  async get(key: string) {
    return this.client.get(key);
  }

  async set(key: string, value: string, mode?: "EX", ttlSeconds?: number) {
    if (mode === "EX" && ttlSeconds) {
      return this.client.set(key, value, mode, ttlSeconds);
    }

    return this.client.set(key, value);
  }

  async call(command: string, ...args: RedisCallArg[]) {
    return this.client.call(command, ...args.map((value) => String(value)));
  }

  async del(key: string) {
    return this.client.del(key);
  }

  async ttl(key: string) {
    return this.client.ttl(key);
  }

  async eval(script: string, keys: string[], args: RedisCallArg[]) {
    // ioredis's built-in `keyPrefix` option (configured where this client is constructed below)
    // transparently prefixes the key arguments of `eval`/`evalsha` calls — it inspects `numkeys`
    // to know how many of the following arguments are keys, same mechanism that already prefixes
    // plain get/set/del/ttl above without this adapter doing it manually.
    return this.client.eval(script, keys.length, ...keys, ...args.map((value) => String(value)));
  }

  async setIfNotExists(key: string, value: string, ttlSeconds: number) {
    const result = await this.client.set(key, value, "EX", ttlSeconds, "NX");
    return result === "OK";
  }

  async connect() {
    await this.client.connect();
  }

  async quit() {
    await this.client.quit();
  }
}

let configuredRedisClient: AppRedisClient | null = null;
let readyRedisClient: AppRedisClient | null = null;

if (env.REDIS_URL) {
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    keyPrefix: `${env.REDIS_KEY_PREFIX}:`,
    maxRetriesPerRequest: 2,
  });

  client.on("error", (error) => {
    console.error("Redis client error", error);
  });

  configuredRedisClient = new IoredisClientAdapter(client);
} else if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
  configuredRedisClient = new UpstashRestRedisClient(
    env.UPSTASH_REDIS_REST_URL,
    env.UPSTASH_REDIS_REST_TOKEN,
    env.REDIS_KEY_PREFIX,
  );
}

export function getRedisClient() {
  return readyRedisClient;
}

export async function connectRedis() {
  if (!configuredRedisClient) {
    return;
  }

  if (readyRedisClient?.status === "ready") {
    return;
  }

  try {
    await configuredRedisClient.connect();
    readyRedisClient = configuredRedisClient;
  } catch (error) {
    readyRedisClient = null;

    try {
      await configuredRedisClient.quit();
    } catch {
      // Ignore cleanup failures after an unsuccessful connect attempt.
    }

    configuredRedisClient = null;
    throw error;
  }
}

export async function disconnectRedis() {
  if (!configuredRedisClient) {
    return;
  }

  await configuredRedisClient.quit();
  readyRedisClient = null;
}
