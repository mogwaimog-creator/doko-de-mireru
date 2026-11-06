// SEO pilot routing middleware. PREVIEW ONLY; no Redis or TMDB access.
// IMPORTANT: do not enable in production until Vercel preview validates routing,
// static file generation and request-cost impact.
const allowed=new Set(['movie-157336.html','tv-202879.html','person-1813.html']);
export const config={matcher:['/detail.html','/person.html']};
export default function middleware(request){
  if(process.env.VERCEL_ENV!=='preview'||process.env.SEO_STATIC_ROUTING_PILOT!=='1')return;
  const url=new URL(request.url);
  const id=url.searchParams.get('id');
  if(!id||!/^[1-9]\d{0,9}$/.test(id)||url.searchParams.getAll('id').length!==1)return;
  const type=url.pathname==='/person.html'?'person':url.searchParams.get('type')||'movie';
  if(!['movie','tv','person'].includes(type))return;
  if(url.pathname==='/person.html'&&url.searchParams.has('type'))return;
  if(url.pathname==='/detail.html'&&url.searchParams.getAll('type').length>1)return;
  const filename=type+'-'+id+'.html';
  if(!allowed.has(filename))return;
  return Response.redirect(new URL('/seo-routing-preview/'+filename,url),307);
}
