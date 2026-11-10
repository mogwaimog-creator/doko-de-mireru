'use strict';
// Offline only: never print values, derive endpoints, or send requests.
const names = ['TMDB_API_KEY', 'UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'];
function check(env = process.env) {
  return Object.fromEntries(names.map(name => [name, typeof env[name] === 'string' && env[name].length > 0]));
}
if (require.main === module) console.log(JSON.stringify(check()));
module.exports = {check};
