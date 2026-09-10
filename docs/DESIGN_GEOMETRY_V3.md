# StaffSwipe — Design Geometry V3

Pixel-level implementation rules for GPT-6 Astra. Base frame is 390×844 px. The Canva/HTML V3 pages are the visual source; these values are the geometry contract.

## Base frame and safe zones
- Frame: 390×844.
- Page padding: left/right 16; top 18; bottom 16.
- Status bar: 24 high.
- App top bar: 42 high.
- Main content width inside page padding: 358.
- Never put a critical action below the Telegram/browser safe area.

## Primary actions
- Standard full-width primary button: x=16, width=358, height=62, radius=16, horizontal padding=18.
- Sticky without bottom nav: bottom=18.
- Sticky with bottom nav: bottom=88.
- Secondary full-width button: same geometry, outline style.
- Minimum touch target for any control: 52×52.
- Destructive actions use a confirmation bottom sheet before execution.

## Bottom navigation
- Container: x=10, width=370, height=70, bottom=8, radius=22.
- Tab minimum width: 58.
- Icon visual size: 22; full tab hit target must still be >=52 high/wide.
- Worker tabs: Feed / My shifts / Profile.
- Employer tabs: Feed / People / Shifts / Profile.

## Swipe action dock
- Dock: x=16, width=358, height=76, bottom=88.
- Gap between actions: 10.
- Skip/save round control: 62×62, radius=31.
- Positive action: height=64, radius=20, flexes to remaining width; use crimson fill.
- Positive action labels: seeker `Откликнуться`; employer `Пригласить`.
- Left swipe is skip; right swipe is positive. Card returns to stack after POST /swipes failure.

## Swipe card layout
- Card-stack region height: 526.
- Back-card peek: left/right inset=12, top=8, height=505, radius=24, slight rotation ~1.7°.
- Main card fills stack minus 18 px bottom peek.
- Default hero/photo: height=302, radius=22.
- Photo scrim starts at 35% and darkens toward bottom.
- Hero copy: left/right=16, bottom=16.
- Hero title: 28 px; role/body 15 px; price 33 px.
- Badge row: top=12, left=12, right reserve=54; badge height=27; gap=6.
- Counter: top=12, right=12.
- Metadata chip: height=30; horizontal padding=10.
- Trust/order priority: role + date/time + pay + trust before secondary description.

## Forms
- Input: height=50, radius=14, horizontal padding=13.
- Label: 11 px; gap label→input=5.
- Field vertical margin=10.
- Segmented control item minimum height=40.
- List rows: minimum 52 high.
- Primary form CTA remains sticky at bottom where possible; keyboard must not cover it.

## Chat
- Pinned shift context appears above messages when the conversation is tied to a match.
- Bubble max width: 79% of page content.
- Composer: x=12, width=366, height=58, bottom=16.
- Text input height=58.
- Send button: 58×58.
- With keyboard open, composer follows visual viewport and remains visible.

## Protected shift
- Shield: 86×86, radius=28.
- Code block: full content width; code font 31; letter spacing=9; radius=16; vertical padding=15.
- Check-in code is evidence, not payment trigger.
- Show timeline/status before secondary details.

## Bottom sheets
- Full-width anchored bottom=0.
- Top corners radius=28.
- Padding: top=18, left/right=16, bottom=24.
- Grabber: 44×5.
- Primary action first, height=62; secondary below with 8 px gap.
- Use for destructive confirms, permission rationale, reschedule/actual-hours confirmations when context should remain visible.

## Typography
- Display/H1: 29 px, line-height ~1.03.
- H2: 21 px.
- Hero title: 28 px.
- Price: 33 px; large amount: 40 px.
- UI body: 13–16 px depending hierarchy.
- Small/meta: 11–12 px.
- Display typeface intent: Prata; UI: system stack.

## Colors
- Brand crimson #A51C30.
- Ivory #EFE7D3.
- Card #FFFDF8.
- Text #241F1B.
- Muted #6D6357.
- Gold #C39A3A.
- Success #2F7A4D.
- Danger #7E1322.
- Border #E4D9C2.
- Dark background #160D0F; dark card #28171B.

## Screen-template placement rules
### Feed/swipe screens
Status/top bar → optional filter row → card stack → action dock → bottom nav. Do not add another sticky CTA below the swipe dock.

### Detail screens
Status/top bar → hero/detail content → metadata/trust → body → sticky primary CTA. If bottom nav is visible, use bottom=88; otherwise bottom=18.

### List screens
Status/top bar → segment/filter → list rows/cards → bottom nav. Primary creation/search action can be sticky above nav only if it is the screen’s dominant next step.

### Match/success screens
Status/top bar → celebration/identity → agreed shift summary → primary CTA → secondary CTA. Keep primary action in lower third.

### Lifecycle screens
Status/top bar → current state/timeline → shift summary → contextual actions. Do not show actions that are invalid for current MatchStatus/time window.

### Money/support/admin
Information hierarchy first, actions second. Money screens must display commission/balance semantics from backend, never invented values. Admin screens must not expose dispute chat unless access rules permit it.

## Accessibility and responsive rules
- Touch targets never below 52×52 in V3.
- Large text must not clip or push primary CTA behind nav/safe-area.
- Respect prefers-reduced-motion.
- Dark mode uses existing dark tokens rather than new colors.
- Keyboard, Telegram viewport resize and safe-area must be tested on onboarding and chat.

## Implementation rule
For every S-ID in `UX_BLUEPRINT_V3_150.md`, combine its route/component/state/API/entry/exit contract with this geometry file. Do not infer a new API field from visual copy. If code and design disagree, working code/tests and AGENTS.md domain invariants win, then update the blueprint deliberately.
