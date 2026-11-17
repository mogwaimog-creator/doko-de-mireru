'use strict';
// Aiven-only native Valkey adapter. No Upstash REST transport or legacy fallback.
// This module is isolated until the release application is explicitly wired and tested.
const { createClient } = require('redis');

function createAivenConnection(env = process.env, factory = createClient) {
  const raw = env.AIVEN_REDIS_URL;
  if (!raw) throw new Error('AIVEN_REDIS_URL is required');
  const url = new URL(raw);
  if (url.protocol === 'valkeys:') url.protocol = 'rediss:';
  if (url.protocol !== 'rediss:' || !url.hostname || !url.port || url.search || url.hash) {
    throw new Error('Aiven requires a TLS Valkey URL without query or fragment');
  }
  const client = factory({
    url: url.toString(),
    disableOfflineQueue: true,
    socket: {
      tls: true,
      connectTimeout: 8000,
      reconnectStrategy: false,
      ...(env.REDIS_CA_CERT ? { ca: env.REDIS_CA_CERT } : {})
    }
  });
  client.on('error', () => {});
  let opening;
  async function ensureOpen() {
    if (opening) return opening;
    if (client.isOpen) return;
    opening = client.connect().finally(() => { opening = undefined; });
    return opening;
  }
  async function command(args) {
    if (!Array.isArray(args) || args.length === 0 ||
        args.some(v => typeof v !== 'string' && typeof v !== 'number')) {
      throw new Error('Invalid Aiven command');
    }
    await ensureOpen();
    return client.sendCommand(args.map(String), {
      abortSignal: AbortSignal.timeout(8000)
    });
  }
  return {
    command,
    read: key => command(['GET', key]),
    readMany: keys => keys.length ? command(['MGET', ...keys]) : Promise.resolve([]),
    // Callers must explicitly choose a key; no implicit overwrite of production records.
    writeTest: (key, value, ttlSeconds = 60) => {
      if (!key.startsWith('chatgpt:connection-test:') ||
          !Number.isInteger(ttlSeconds) || ttlSeconds < 1 || ttlSeconds > 300) {
        throw new Error('Test writes require a temporary test key');
      }
      return command(['SET', key, value, 'NX', 'EX', ttlSeconds]);
    },
    close: () => { if (client.isOpen) client.destroy(); }
  };
}
module.exports = { createAivenConnection };
