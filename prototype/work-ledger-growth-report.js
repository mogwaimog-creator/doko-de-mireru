'use strict';
// Offline snapshots only. Does not modify the ledger or call external services.
function snapshot(ledger, timestamp = new Date().toISOString()) {
  const audit = ledger.audit();
  const sizes = Object.fromEntries(audit.items.map(x => [x.key, x.bytes]));
  return { version: 1, timestamp, count: audit.count, totalBytes: audit.totalBytes,
    errorCount: audit.errorCount, errorBytes: audit.errorBytes, sizes };
}
function compare(previous, current, options = {}) {
  if (!previous || !current || previous.version !== 1 || current.version !== 1) throw Error('invalid snapshot');
  const threshold = options.thresholdBytes ?? 4096;
  if (!Number.isSafeInteger(threshold) || threshold < 0) throw Error('invalid threshold');
  const changes = Object.entries(current.sizes).map(([key, bytes]) => {
    const old = previous.sizes[key];
    return { key, beforeBytes: old ?? null, afterBytes: bytes,
      deltaBytes: old === undefined ? bytes : bytes - old,
      newRecord: old === undefined };
  }).filter(x => x.newRecord || x.deltaBytes !== 0).sort((a,b) => b.deltaBytes - a.deltaBytes);
  return { before: previous.timestamp, after: current.timestamp,
    countDelta: current.count - previous.count,
    totalBytesDelta: current.totalBytes - previous.totalBytes,
    errorCountDelta: current.errorCount - previous.errorCount,
    errorBytesDelta: current.errorBytes - previous.errorBytes,
    growthWarnings: changes.filter(x => !x.newRecord && x.deltaBytes >= threshold),
    changes,
    removedKeys: Object.keys(previous.sizes).filter(key => !Object.hasOwn(current.sizes,key)) };
}
module.exports = { snapshot, compare };
