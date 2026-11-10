'use strict';
// Static, inert JSON payload: no executable JS and no streaming availability.
const {extractFixedDetail}=require('./extract-seo-fixed-detail');
function embedFixedMetadata(html,ledgerRecord){
 const fixed=extractFixedDetail(ledgerRecord);
 const marker='</head>';
 if(html.split(marker).length!==2)throw Error('Expected exactly one closing head');
 // Escape characters that could terminate an HTML script element or alter parsing.
 const json=JSON.stringify(fixed).replace(/[<>&\u2028\u2029]/g,ch=>({
  '<':'\\u003c','>':'\\u003e','&':'\\u0026','\u2028':'\\u2028','\u2029':'\\u2029'
 })[ch]);
 const tag='<script type="application/json" id="doko-fixed-detail">'+json+'</script>\n';
 return html.replace(marker,tag+marker);
}
module.exports={embedFixedMetadata};
