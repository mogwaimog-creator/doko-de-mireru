'use strict';
// Standalone diagnostic: no application imports, URL, environment credentials or fallback.
const fs = require('node:fs');
const net = require('node:net');
const { checkServerIdentity } = require('node:tls');
const COMMANDS = [['PING'], ['TIME'], ['INFO', 'server'], ['INFO', 'memory'], ['INFO', 'clients']];
function prompt(label, { hidden = false, input = process.stdin, output = process.stdout } = {}) {
  if (!input.isTTY || !output.isTTY || typeof input.setRawMode !== 'function') return Promise.reject(Error('Interactive terminal required'));
  return new Promise((resolve, reject) => {
    const wasRaw = Boolean(input.isRaw); let value = '', done = false;
    const finish = (error) => {
      if (done) return; done = true;
      input.removeListener('data', data); input.removeListener('error', failed); input.removeListener('end', ended);
      input.setRawMode(wasRaw); input.pause(); output.write('\n');
      const result = value; value = ''; error ? reject(Error('Input cancelled')) : resolve(result);
    };
    const failed = () => finish(true), ended = () => finish(true);
    const data = chunk => {
      for (const c of String(chunk)) {
        if (c === '\x03' || c === '\x04' || c === '\x1b') return finish(true);
        if (c === '\r' || c === '\n') return finish(false);
        if (c === '\x7f' || c === '\b') { if (value) { value = Array.from(value).slice(0, -1).join(''); if (!hidden) output.write('\b \b'); } }
        else if (c >= ' ' && c !== '\x7f') { if (value.length >= 4096) return finish(true); value += c; if (!hidden) output.write(c); }
      }
    };
    input.setEncoding('utf8'); output.write(label); input.setRawMode(true);
    input.on('data', data); input.once('error', failed); input.once('end', ended); input.resume();
  });
}
function validate({ host, port, username, password }) {
  if (typeof host !== 'string' || host.length > 253 || (!net.isIP(host) && !/^(?=.{1,253}$)[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?$/.test(host))) throw Error('Invalid host');
  if (!Number.isInteger(port) || port < 1 || port > 65535 || !username || !password) throw Error('Invalid configuration');
}
function fields(text) {
  const result = Object.create(null);
  for (const line of String(text).split('\r\n')) { const i = line.indexOf(':'); if (i > 0) result[line.slice(0, i)] = line.slice(i + 1); }
  return result;
}
async function probe(config, { createClient = require('redis').createClient, timeoutMs = 8000 } = {}) {
  validate(config);
  const socket = { host: config.host, port: config.port, tls: true, rejectUnauthorized: true,
    servername: net.isIP(config.host) ? undefined : config.host,
    checkServerIdentity: (_name, cert) => checkServerIdentity(config.host, cert),
    connectTimeout: timeoutMs, reconnectStrategy: false, ...(config.ca ? { ca: config.ca } : {}) };
  const client = createClient({ username: config.username, password: config.password, socket,
    RESP: 2, disableClientInfo: true, disableOfflineQueue: true, commandsQueueMaxLength: 1 });
  client.on('error', () => {});
  let timer;
  const deadline = promise => Promise.race([promise, new Promise((_, reject) => { timer = setTimeout(() => reject(Error('Deadline')), timeoutMs); })]).finally(() => clearTimeout(timer));
  try {
    await deadline(client.connect());
    const replies = [];
    for (const args of COMMANDS) replies.push(await deadline(client.sendCommand([...args], { abortSignal: AbortSignal.timeout(timeoutMs) })));
    if (replies[0] !== 'PONG' || !Array.isArray(replies[1]) || replies[1].length !== 2 || !replies[1].every(x => /^\d+$/.test(String(x)))) throw Error('Invalid response');
    const server = fields(replies[2]), memory = fields(replies[3]), clients = fields(replies[4]);
    const version = server.valkey_version || server.redis_version;
    if (!/^\d+\.\d+\.\d+(?:[.-][a-zA-Z0-9]+)*$/.test(version || '')) throw Error('Invalid response');
    const numeric = key => { const v = memory[key] ?? clients[key]; if (!/^\d+$/.test(v || '')) throw Error('Invalid response'); return v; };
    return { status: 'PASS', tlsVerified: true, commands: 5, version, usedMemoryBytes: numeric('used_memory'), maxmemoryBytes: numeric('maxmemory'), connectedClients: numeric('connected_clients') };
  } catch { throw Error('Connection check failed (TLS, authentication, timeout, permission or response). No retry performed.'); }
  finally { clearTimeout(timer); if (client.isOpen) client.destroy(); }
}
async function main() {
  // Ignore environment configuration and reject argv (especially credential URLs).
  if (process.argv.length !== 2) throw Error('No command-line arguments accepted');
  if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || process.env.NODE_DEBUG || process.env.DEBUG) throw Error('Disable TLS/debug overrides first');
  const host = (await prompt('Host (no URL): ')).trim();
  const port = Number(await prompt('TLS port: '));
  const username = (await prompt('Username: ')).trim();
  const caPath = (await prompt('CA certificate file path (Enter for system trust): ')).trim().replace(/^"(.*)"$/, '$1');
  const ca = caPath ? fs.readFileSync(caPath) : undefined;
  let password = await prompt('Password (hidden): ', { hidden: true });
  try { console.log(JSON.stringify(await probe({ host, port, username, password, ca }))); }
  finally { password = undefined; }
}
if (require.main === module) main().catch(() => { console.error('FAIL: check inputs, trusted CA, network, credentials and diagnostic settings. Details suppressed; no retry.'); process.exitCode = 1; });
module.exports = { prompt, probe };
