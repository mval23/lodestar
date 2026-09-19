# Lodestar brand & design system

> Source of truth for Lodestar's identity. Visual version: [`lodestar-identity.html`](lodestar-identity.html). Tokens: [`tokens.css`](tokens.css), [`tokens.json`](tokens.json). Logo files: [`logo/`](logo/).
> Status: **approved direction, v0.3, 19 Sep 2026.** No final vector artwork yet; the SVGs in `logo/` are construction-accurate working files.

---

## 1. Decisions (approved)

| Topic | Decision |
|---|---|
| Name | **Lodestar**, pending trademark and domain clearance |
| Product | Private personal-finance web app for individuals. Each person has their own private account, with no shared or household access: accounts, manual transactions, categories, transfers, budgets, goals, bills and subscriptions, cash-flow and net-worth reports, CSV import/export. Bank sync comes later. |
| Concept | **Bearing**: the precision of a navigational instrument |
| Interface style | **Apple-style**: clarity, restraint, soft depth, system type, one tint color |
| Color | **Stone** warm greys + **Electric blue** `#1F4BFF` as the only accent |
| Logo | **Axes & Fix** (see §4) |
| Tagline | **Know where you stand.** |
| Language | **English only.** No Spanish or other localization. |

**Rejected. Do not reintroduce:** the spruce/brass/harbor palette ("felt like a boring office"); Cobalt & Marigold, Graphite & Tangerine, Lagoon & Coral, Raspberry & Butter; the name Constella; any Spanish copy.

## 2. Brand strategy

- **Brand idea:** A fixed point in a moving picture. Money keeps moving, and Lodestar is the steady reference that shows where you are.
- **Promise:** You will always know where you stand, and what a sensible next move looks like.
- **Pillars:** Orientation (one accurate picture), Precision (every number traceable), Privacy (your data is yours).
- **Personality:** Steady · Exact · Candid · Unhurried · Encouraging.
- **Descriptor:** Private personal-finance tracker.
- **Elevator pitch:** Lodestar is a private finance tracker that brings your accounts, budgets, bills and goals into one calm, precise view, so you always know where you stand and what to do next.
- **Alternative taglines:** Find your bearings. Keep your course. · A steady point for moving money. · Private by design. Clear by default. · Every account. One clear picture. · Clear on today. Steady on tomorrow.
- **It must feel:** trustworthy, calm, clear, intelligent, private, precise, modern, approachable, quietly optimistic.
- **It must not feel:** corporate, cold, childish, crypto or speculative, luxury, or like generic fintech.

## 3. Visual clichés to avoid

Literal stars, dot-to-dot constellations, rockets, galaxies or space imagery, glows, purple-blue gradients, dark navy everywhere, generic upward arrows, dollar signs, coins, wallets, piggy banks, bank buildings, and complex emblems that fail at small sizes.

## 4. Logo: Axes & Fix

An L-shaped corner (your position, and the initial L) with one small square in the open quadrant (the fixed point you steer by).

**Geometry** (16 × 16 unit grid, 2-unit margin, 12 × 12 live area):

```svg
<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
  <path d="M2 2H5V11H14V14H2Z" fill="#1C1A17"/>        <!-- axes: ink -->
  <rect x="8" y="5" width="3" height="3" fill="#1F4BFF"/> <!-- fix: electric blue -->
</svg>
```

- Stroke is 3 units, with square terminals and sharp corners.
- The fix is 3 × 3 units, sits 3 units from each arm, and its center lies on the 45° diagonal from the inner corner.
- **Colors:** ink axes with a blue fix. On dark grounds, use Stone-white `#EEECE7` axes and a light-blue `#6F8BFF` fix. A one-color version (all ink, or all white) is allowed anywhere.
- **The mark stays sharp** even though the interface is rounded. Never round its corners.
- **Wordmark:** "Lodestar" in sentence case, redrawn from Inter Display SemiBold. SF Pro may not be used in a logo. Refinements: the t crossbar extends right only, the L is kerned tight to the o, counters are opened slightly, and tracking is −2% at display sizes.
- **Lockups:** horizontal (the symbol's bottom arm on the baseline; symbol live area = 1.15× cap height; 4-unit gap) and compact (stacked, with the wordmark at 0.5× symbol height).
- **Clear space:** 2X on every side, where X = the side of the fix.
- **Minimum sizes:** symbol 16 px (use the 16-unit master below 24 px); horizontal lockup 88 px wide on screen or 22 mm in print; wordmark alone 64 px.
- **App icon:** Light is the default: a Stone-white tile (subtle vertical gradient from `#FFFFFF` to `#EDEBE6`), ink axes and a blue fix, with the symbol at 56% of the tile, nudged 0.5 unit up and right. Dark: tile `#1C1A17`, axes `#EEECE7`, fix `#6F8BFF`. Tinted: greyscale layers. Supply the tile, axes and fix as separate layers for Icon Composer.
- **Don't:** rotate, mirror, stretch, round the corners, outline, add glow or gradient, turn the fix into a star, move the fix, color the fix red or green, or put `#1F4BFF` on a dark ground (only 2.8:1).

## 5. Color

About 95% of every screen is Stone, white and ink; under 5% is blue. **Blue means "act" or "now"**: primary buttons, links, selected states, toggles, focus, the logo fix, the "now" marker, and the key-figure bracket. Nothing else.

| Token | Light | Dark | Use |
|---|---|---|---|
| `--ground` | `#F5F4F1` Stone | `#12110F` Night | Window and page background |
| `--surface` | `#FFFFFF` | `#1C1B18` | Grouped lists, tables, sheets |
| `--sunk` | `#EDEBE6` | `#26241F` | Fills, tracks, segmented-control background |
| `--line` | `#E2DFD8` | `#302D28` | Decorative separators |
| `--line-strong` | `#8C867C` | `#7D776D` | Input borders and control outlines (≥ 3:1) |
| `--ink` | `#1C1A17` | `#EEECE7` | Primary label, logo, money-in bars |
| `--ink-2` | `#5E5A53` | `#B3AEA5` | Secondary label |
| `--ink-3` | `#6E6961` | `#948F86` | Tertiary label (lightest allowed for text) |
| `--blue` | `#1F4BFF` | `#6F8BFF` | Tint: buttons, links, selection, focus, fix |
| `--blue-soft` | `#EEF1FF` | `#1A2040` | Selected rows, active filters, info |
| `--on-blue` | `#FFFFFF` | `#12110F` | Text on filled blue buttons |
| `--ok` / `--ok-soft` | `#1F7A35` / `#EDF7EF` | `#30D158` / `#132A1A` | Success |
| `--warn` / `--warn-soft` | `#C93400` / `#FDF1EA` | `#FF9F0A` / `#2B1F0C` | Warning |
| `--err` / `--err-soft` | `#D70015` / `#FDEDEE` | `#FF6961` / `#33161A` | Error (never used for spending) |
| `--in` / `--out` | `#1C1A17` / `#8C867C` | `#EEECE7` / `#7D776D` | Money in / money out in charts |

**Stone scale:** 0 `#FFFFFF` · 50 `#F5F4F1` · 100 `#EDEBE6` · 200 `#E2DFD8` · 300 `#CFCBC2` · 400 `#A8A298` · 500 `#8C867C` · 600 `#6E6961` · 700 `#5E5A53` · 800 `#3A3732` · 900 `#1C1A17` · 950 `#12110F`.

**Checked contrast (WCAG 2.x):** label 15.8:1 · secondary 6.2:1 · tertiary 5.0:1 · white on blue 6.0:1 · blue on Stone 5.4:1 · dark-mode blue on surface 5.6:1 · control border 3.6:1. All status text on its soft background is ≥ 4.75:1.

**Charts:**
- Charts are grey by default: money in is `--in` and money out is `--out`, told apart by lightness. Blue marks only "now."
- Category breakdowns are the only multi-color charts. They use 8 series in a fixed order, never cycled, always with a legend and direct labels. Light: `#1F4BFF #D0663A #008574 #B064AE #6D8B24 #3F95C8 #A98016 #B0525F`. Dark: `#5C7BFF #D9744A #12997F #BD72BA #7E9E35 #3A94CC #B08620 #C96170`. These pass a colorblind-safety validator; the closest neighboring pair is ~7 ΔE, so labels are mandatory.
- Never show gains and losses as red versus green. Always use signs (true minus U+2212), labels, icons, and hatching for overages.

## 6. Typography

- **Font stack:** `-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", system-ui, sans-serif`. That gives SF Pro on Apple devices and Inter elsewhere. Never self-host SF font files.
- **Mono:** `ui-monospace, "SF Mono", Menlo, Consolas, monospace`, only for reference numbers, card masks (`•••• 4821`) and CSV previews. Never for money amounts.
- **Numbers:** `font-variant-numeric: tabular-nums` on every amount. Right-align amount columns with fixed decimals per currency.

| Style | Size / line height | Weight | Tracking |
|---|---|---|---|
| Large title | 34 / 41 | 700 | −2.2% |
| Title 1 | 28 / 34 | 700 | −2% |
| Title 2 | 22 / 28 | 600 | −1.5% |
| Headline | 17 / 22 | 600 | 0 |
| Figure | 32 / 38 | 600, tabular | −2% |
| Body | 15 / 22 | 400 | 0 |
| Callout | 14 / 19 | 400 | 0 |
| Footnote | 13 / 18 | 400 | 0 |
| Caption | 12 / 16 | 500, sentence case, never all caps | 0 |
| Marketing display | 64 / 68 | 700 | −3% |

**Formatting:** use `Intl.NumberFormat` with the account currency, en-US. Examples: `$1,234.50`, `−$84.20`, `+$120.00 · +2.4%`, `EUR 1,200.00`. Use `$1.2M` in chart axes only. Dates look like `Sep 19, 2026`. Show `—` for no data. Parenthesized negatives are an optional setting, off by default.

## 7. Interface rules (Apple-style)

- **Spacing:** an 8 pt grid (4, 8, 12, 16, 20, 24, 32, 44, 64). Margins are 20 px on phones and 32 px or more on desktop.
- **Corners:** continuous corners: 8 px on small controls, 12 px on fields and buttons, 16 px on grouped containers. Buttons may be capsules.
- **Layout:** desktop uses a sidebar plus content, like macOS. Mobile uses a large title, white grouped lists on Stone, a "＋" in the navigation bar, and a tab bar (Overview, Activity, Budgets, Goals).
- **Materials:** translucent glass (blur plus saturation) only on navigation (sidebar, toolbar, tab bar). Content sits on solid white. Soft shadows only on floating layers (popovers, sheets, menus).
- **Containers:** inset grouped lists for settings, accounts and forms. Dashboards use a few large white groups, not a mosaic of floating cards. Transactions go in one continuous table.
- **Controls:** filled blue capsule for the primary action, a grey-filled button with blue text for secondary actions, segmented controls for view switches, and blue toggles.
- **Tables:** hairline separators inset from the left, a sticky header, the selected row tinted with `--blue-soft`, and pending rows in `--ink-2` with a "Pending" capsule. Rows are 44 px (36 px compact on desktop).
- **Forms:** use iOS-style sheets. The amount is the hero. Fields form one grouped list with the label on the left and the value on the right. "Save" stays dimmed until the entry is valid, and the reason is shown in words.
- **Icons:** SF Symbols in native apps. On the web, a matched rounded-stroke set (for example Lucide at 1.75 px). Icons are ink or grey, and blue only when selected.
- **Charts:** in the style of Apple's Swift Charts: rounded-top bars, a very light horizontal grid, Footnote axis labels, a hover line with the exact value, and a "Show as table" option on every chart.
- **Motion:** springs (about 0.35 s, damped, no visible bounce). Numbers cross-fade and never count up. The fix does a gentle settle. Respect Reduce Motion and Reduce Transparency.
- **Empty states:** a large light-grey icon, a one-line title, one sentence, and one blue button.

### Brand signatures (recognizability)
1. **The fix:** a blue square marking the current position (today's balance, this month). One per chart.
2. **The corner bracket:** thin blue corners with rounded ends, around the one number that matters on a screen. At most one per view.
3. **The graduated rule:** fine ticks under progress and budget capsules, with a limit tick and hatching when over plan.

### Consistency rules
1. Every color, size, radius and spring comes from tokens. No one-off hex values in product code.
2. Status colors appear only for real states, always with an icon and words.
3. Glass is only for navigation, never for content.
4. Charts are grey by default; category colors are allowed only in breakdowns.
5. Follow Apple's conventions, but never copy Apple's brand, icons or artwork.

## 8. Voice

- **Voice:** steady, exact, candid, kind. State facts and show the number behind them. Suggest a next step without pressure. Never shame.
- **Use:** where you stand, plan, on track, over plan by, left to spend, set aside, money in / money out, review, private, export.
- **Avoid:** workspace (it suggests sharing), financial freedom, get rich, build wealth, guaranteed, crush your debt, bank-grade or military-grade security, you overspent, bad, failed, to the moon, hack your money, and "AI-powered" unless it is true and meaningful.
- **Metaphors:** navigation language ("bearings") is for marketing only, never in functional labels.
- **Buttons:** Add transaction · Record transfer · Import CSV · Review 42 rows · Mark as paid · Save transaction · Export all data · Delete account and its 318 transactions.
- **Empty states:**
  - "No transactions yet. Add one by hand, or import a CSV from your bank. You'll review every row before anything is saved."
  - "A budget compares what you planned with what you spent. Start with one category you want to keep an eye on."
- **Validation messages:**
  - "Enter an amount greater than zero."
  - "Choose which account this came from."
  - "This date is in the future. Save it as a scheduled transaction?"
  - "3 rows have no date. Fix them in the preview, or skip them and import the other 39."
- **Welcome:** "Welcome to Lodestar. Let's start with where you are today: add an account and its current balance. Budgets, bills and goals can come later, whenever you're ready."
- **Privacy (needs legal and engineering approval before use):** "Your Lodestar data is private to your account. We don't sell your data or use it for advertising, and you can export or delete everything at any time."

## 9. Accessibility

- Target WCAG 2.2 AA. Text contrast is ≥ 4.5:1 and controls and graphics are ≥ 3:1.
- Focus is always visible, shown as a blue halo.
- Meaning never depends on color alone.
- Touch targets are ≥ 44 pt. Desktop web targets are ≥ 24 px.
- Support Dynamic Type natively, and 200% zoom plus 320 px reflow on the web.
- Glass must keep text at ≥ 4.5:1 and become solid under Reduce Transparency.
- Screen readers announce full amounts ("minus 64 dollars and 20 cents").

## 10. Open items (need approval)

- Trademark and domain clearance for "Lodestar" (classes 9, 36, 42).
- Final vector drawings of the symbol and wordmark, and the app icon layers checked against the current Apple Human Interface Guidelines.
- Confirming the SF Pro and Inter licensing approach.
- Legal and engineering sign-off on every privacy claim.
