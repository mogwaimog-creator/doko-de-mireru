'use strict';
// Reuses existing discovery/filter presentation, with bounded new query transport only.
const {AsyncLocalStorage}=require('node:async_hooks'),context=new AsyncLocalStorage();
function active(){return !!context.getStore()}
function run(load,fn){return context.run({load},fn)}
async function json(url){const state=context.getStore();if(!state)throw Error('no release query context');const u=new URL(url);if(u.protocol!=='https:'||u.hostname!=='api.themoviedb.org'||!/^\/3\/(?:discover\/(?:movie|tv)|watch\/providers\/(?:movie|tv)|(?:movie|tv)\/(?:now_playing|upcoming|popular|top_rated)|trending\/(?:movie|tv|all)\/(?:day|week)|search\/(?:movie|tv|multi|person))$/.test(u.pathname))throw Error('query route cannot acquire work/provider metadata');u.searchParams.delete('api_key');return state.load(u.pathname,Object.fromEntries(u.searchParams))}
async function request(url,options){return active()?new Response(JSON.stringify(await json(url))):fetch(url,options)}
module.exports={active,run,json,request};
