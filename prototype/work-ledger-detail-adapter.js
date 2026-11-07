'use strict';
// Offline detail compatibility adapter. No streaming, people, seasons, or external calls.
function detailFromWork(saved, type, id) {
  if (!saved || !Array.isArray(saved.records)) throw Error('invalid ledger data');
  const record=saved.records.find(r=>r.type===type && r.id===Number(id));
  if (!record) return null;
  const f=record.fields||{};
  return {
    id:record.id,type:record.type,
    title:f.title??null,originalTitle:f.originalTitle??null,
    releaseDate:f.releaseDate??null,posterPath:f.posterPath??null,
    overview:f.overview??null,voteAverage:f.voteAverage??null,
    runtimeMinutes:f.runtimeMinutes??null,genres:f.genres??[],
    directors:f.directors??[],cast:f.cast??[],
    collectionId:f.collectionId??null,status:f.status??null,
    confirmed:record.confirmed===true,
    relatedWorkIds:[...(record.relatedWorkIds||[])],
    memberships:[...(record.memberships||[])]
  };
}
module.exports={detailFromWork};
