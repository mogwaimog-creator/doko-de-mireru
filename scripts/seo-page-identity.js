'use strict';
// Pure resolver for the future static HTML pilot. No network calls.
// Query parameters win, preserving existing links and navigation context.
function resolvePageIdentity(search, embedded) {
  const params = new URLSearchParams(search || '');
  const queryId = params.get('id');
  const rawId = queryId || embedded?.id;
  if (!/^\d{1,10}$/.test(String(rawId ?? ''))) return null;
  const id = Number(rawId);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const type = params.get('type') || embedded?.type || 'movie';
  if (!['movie','tv','person'].includes(type)) return null;
  if (embedded?.type === 'person' && type !== 'person') return null;
  if (queryId && embedded?.id && Number(embedded.id) !== id) return null;
  if (embedded?.type && embedded.type !== type && queryId) return null;
  return {id,type};
}
module.exports={resolvePageIdentity};
