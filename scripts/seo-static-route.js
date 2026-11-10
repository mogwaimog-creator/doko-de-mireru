'use strict';
// Pure path parser for a future static URL pilot. No runtime routes are changed.
function parseStaticSeoPath(pathname) {
  if (typeof pathname !== 'string') return null;
  const match = /^\/seo-pages\/(movie|tv|person)-(\d{1,10})\.html$/.exec(pathname);
  if (!match) return null;
  const id = Number(match[2]);
  if (!Number.isSafeInteger(id) || id <= 0) return null;
  const type = match[1];
  return type === 'person'
    ? {kind:'person', id, legacyUrl:'/person.html?id='+id}
    : {kind:'work', type, id, legacyUrl:'/detail.html?id='+id+(type==='tv'?'&type=tv':'')};
}
module.exports={parseStaticSeoPath};
