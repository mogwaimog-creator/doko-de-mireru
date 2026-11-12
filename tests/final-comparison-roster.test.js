'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
test('comparison uses all 13 protected series and only saved roster identities',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../streaming.html'),'utf8'),catalog=require('../data/watch-order-memberships.json'),data=JSON.parse(html.match(/<script type="application\/json" id="series-comparison-data">([\s\S]*?)<\/script>/)[1]);
 assert.deepEqual([...new Set(data.rows.map(r=>r.page))].sort(),Object.keys(catalog).sort());
 assert.equal(data.rows.length,42);assert.equal(data.snapshot,undefined,'live comparison must not embed historical availability');assert(html.includes('/api/series-watch?series='));assert(!html.includes('/api/search'));
 for(const row of data.rows)assert(catalog[row.page],'unregistered comparison series');
 const godzilla=new Set(data.rows.filter(r=>r.page==='godzilla').flatMap(r=>r.works.map(w=>w.dataKey)));assert.equal(godzilla.size,47);
});
