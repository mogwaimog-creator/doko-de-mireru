'use strict';
// Pure routing decision for the existing query-based canonical URLs.
// No network, Redis, TMDB, filesystem access, or writes.
function positiveId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d{0,9}$/.test(value)) return null;
  const id=Number(value);
  return Number.isSafeInteger(id) ? String(id) : null;
}
function resolveSeoPage(pathname, search, knownFiles) {
  if (pathname !== '/detail.html' && pathname !== '/person.html') return null;
  const params=new URLSearchParams(search || '');
  const id=positiveId(params.get('id'));
  if (!id || params.getAll('id').length !== 1) return null;
  let filename;
  if (pathname === '/person.html') {
    if (params.has('type')) return null;
    filename='person-'+id+'.html';
  } else {
    if (params.getAll('type').length > 1) return null;
    const type=params.get('type') || 'movie';
    if (type !== 'movie' && type !== 'tv') return null;
    filename=type+'-'+id+'.html';
  }
  // Unknown IDs retain their existing dynamic page; never substitute another work.
  if (!knownFiles.has(filename)) return null;
  return filename;
}
module.exports={positiveId,resolveSeoPage};
