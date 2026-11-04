'use strict';
// Offline contract prototype. Never infer a missing provider list as "not available".
const PROVIDER_FIELDS=['streaming','rental','purchase'];
function splitDetailResponse(detail){
 if(!detail||typeof detail!=='object'||Array.isArray(detail))throw Error('Invalid detail');
 if(!Number.isSafeInteger(Number(detail.id))||Number(detail.id)<=0)throw Error('Invalid detail ID');
 const fixed={},dynamic={id:detail.id};
 for(const [key,value] of Object.entries(detail)){
  if(PROVIDER_FIELDS.includes(key)){
   if(!Array.isArray(value))throw Error('Missing or invalid provider field: '+key);
   dynamic[key]=value;
  }else fixed[key]=value;
 }
 for(const key of PROVIDER_FIELDS)if(!Object.hasOwn(dynamic,key))throw Error('Missing provider field: '+key);
 return {fixed,dynamic};
}
function mergeDetailResponse(fixed,dynamic){
 if(!fixed||!dynamic||String(fixed.id)!==String(dynamic.id))throw Error('Detail identity mismatch');
 for(const key of PROVIDER_FIELDS)if(!Array.isArray(dynamic[key]))throw Error('Incomplete dynamic providers');
 for(const key of PROVIDER_FIELDS)if(Object.hasOwn(fixed,key))throw Error('Provider data in fixed record');
 return {...fixed,...dynamic};
}
module.exports={splitDetailResponse,mergeDetailResponse,PROVIDER_FIELDS};
