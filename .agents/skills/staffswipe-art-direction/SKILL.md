---
name: staffswipe-art-direction
description: Brand art direction for StaffSwipe1. Use for photography, illustrations, icon style, badges, empty states, marketing-like in-product moments, visual texture, and any new asset family that changes the product's visual identity.
---

# StaffSwipe1 art direction

The goal is a recognizable hospitality marketplace: warm, premium, fast, human, and practical. Do not drift into generic SaaS, crypto, nightlife neon, or clone-dating aesthetics.

## Brand anchors

Preserve the existing visual DNA:

- burgundy/crimson as the brand accent;
- warm ivory and restaurant-like neutral surfaces in light mode;
- wine-toned dark surfaces;
- Prata for limited display moments;
- restrained gold only for premium/verified celebratory semantics already defined by the design system;
- real hospitality context over abstract tech imagery.

`theme.css`, shared components, and `DESIGN_SYSTEM.md` remain authoritative.

## Photography direction

Venue photography should feel real and useful:

- recognizable interior, bar, dining room, kitchen context, façade, or team environment;
- warm natural/ambient light where possible;
- avoid over-processed HDR, synthetic neon, stock handshake imagery, and fake luxury clichés;
- choose a focal point that survives mobile crop;
- do not place essential text permanently inside source photos;
- preserve diversity of venue types instead of making every card look fine-dining.

Worker photography, when used, should prioritize clear identity and professional neutrality without enforcing appearance stereotypes.

## Generated imagery

AI-generated imagery may support illustration/empty-state concepts but must not be presented as documentary evidence of a real venue or worker.

For marketplace identity:

- real venue/user imagery wins when available and permitted;
- generated placeholders must be visibly generic, not fake reviews or fake people presented as real users;
- never synthesize government documents, medical books, verification seals, or payment receipts.

## Illustration language

If illustrations are introduced:

- define one coherent family before making many one-offs;
- use simple hospitality motifs: tray, cup, apron, ticket, clock, table, chef tools, venue façade;
- keep line weight, corner language, perspective, and texture consistent;
- use brand tokens instead of arbitrary rainbow palettes;
- reserve illustrations for onboarding, education, empty states, and celebration—not every data-heavy screen.

## Iconography

- one icon family and stroke philosophy;
- consistent optical size inside 44px+ targets;
- filled/outline states must indicate interaction/state intentionally;
- avoid mixing platform emoji with vector icons for core navigation;
- custom icons require a clear need and should match the existing set.

## Empty states

Every major empty state should answer:

1. what happened;
2. whether it is normal or an error;
3. what the user can do next.

Prefer a small branded illustration plus one clear action over giant decorative art.

Key states include:

- no more cards;
- no matches;
- no messages;
- no saved shifts;
- no upcoming shifts;
- network/offline-like failure;
- filtered search with zero results.

## Badges and symbols

Verification/trust marks must be semantically strict. Do not create fake “official” seals, shields, or stars that imply a stronger verification process than actually exists.

## Asset performance

- prefer SVG for simple icons/illustrations;
- use optimized WebP/AVIF for raster photos when supported by the pipeline;
- provide responsive sizes or server-side transformations when available;
- lazy-load below-the-fold imagery;
- avoid video/large animation assets on the startup path;
- measure before accepting a “premium” effect that increases load cost.

## Brand drift tests

Reject or redesign if a new screen would plausibly belong to:

- a crypto wallet;
- a generic B2B dashboard;
- a neon nightclub app;
- a direct Tinder clone;
- a food-delivery marketplace with swapped labels.

StaffSwipe should communicate hospitality work, trust, speed, and real shifts immediately.

## Review checklist

- Is the asset honest about what is real versus illustrative?
- Does it fit the burgundy/ivory/wine visual world?
- Is the hospitality context visible without clichés?
- Does icon/illustration style match existing assets?
- Does it work in light and dark contexts?
- Is its byte/performance cost justified?
- Could any badge or image mislead the user about verification?

## Verification

Coordinate with `staffswipe-visual-design`, `staffswipe-performance`, `staffswipe-privacy`, `staffswipe-trust-safety`, and `staffswipe-accessibility`. Validate real crops/placeholders and not only perfect design mockups.
