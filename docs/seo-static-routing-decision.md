# SEO static publishing — routing decision gate

Status: **not approved for production**. This is a design record only; no production routes are changed.

## Goal
Keep canonical URLs `/detail.html?id=N`, `/detail.html?id=N&type=tv`, and `/person.html?id=N`. Return per-record initial HTML without a per-visit Redis lookup or serverless rendering. Keep the 6:00/18:00 streaming schedule unchanged.

## Confirmed platform constraints
- Vercel `rewrites` support `has` with query matching, but ordinary rewrites check existing filesystem files first. Both `detail.html` and `person.html` currently exist.
- Movie and TV records may share the same numeric ID. Pathname-only rewriting cannot distinguish them.
- Generated pages currently exist only in an offline artifact, not in the deployment output. A manifest alone does not publish files.
- The existing offline audit deliberately reports `routingVerified:false`. Do not interpret green HTML tests as evidence of production routing.

## Candidate for isolated preview (NOT implemented)
1. In a dedicated preview build only, move the original templates to alternate filenames so their legacy URL paths can be routed conditionally. Keep their JS and UI unchanged.
2. Include a small, bounded set of generated movie, TV and person HTML in the deployed static output.
3. Try explicit query-aware rules for those exact IDs, with TV conditions before movie fallback, and preserve the visible URL. All other IDs must fall back to the original templates.
4. Verify on a deployed preview (not only `vercel dev`) that real HTTP responses for movie/TV/person contain the expected title, canonical, body, and no additional Function invocations.
5. Measure request counts and cache behavior before discussing production. No production merge or Redis writes during the experiment.

## Blocking questions
- Verify whether query capture in `has` can be substituted into `destination` for this Vercel project and whether existing-file precedence is resolved by preview-only template relocation.
- Confirm legacy fallback routing for unmatched IDs and the effect of additional query parameters.
- Confirm no duplicate-content indexing of `/seo-pages/*` and that the original URLs remain canonical.
- Confirm how a bounded export of the shared ledger is produced without new per-visitor reads or uncontrolled Redis storage.

**Decision:** no blanket `/detail.html` or `/person.html` rewrite, no middleware or function per hit, and no production route change until the preview passes.
