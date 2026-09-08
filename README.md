# Aleph One — company site

Source: `../Waiting on scope picks.zip` (8 Sep 2026). Replaces the previous
`aleph-one` build, which is archived on GitHub at `machtumens/Aleph.One`
(commit `c79e1f5`) and can be brought back with `git clone`.

## Running it

`.dc.html` documents are compiled in the browser: `support.js` fetches the page's
own source, resolves the `{{ }}` bindings and `<sc-if>` / `<sc-for>` directives
against the `<script type="text/x-dc">` block, and mounts through React. It has to
be served over HTTP — opening a file from `file://` gives a blank page, because
browsers block the runtime's fetch of its own document.

```bash
python3 -m http.server 8000
```

| File | What it is |
| --- | --- |
| `index.html` | The site. Hero through footer, 13 sections, price configurator. |
| `mission.html` | Launch-sequence variant. Rocket scene, ten sample worlds. |
| `art-direction.html` | Deliverable A — the three directions and the pick. |
| `screens.html` | Turn 2 screen sheet. |
| `aleph-scene.js` · `aleph-rocket.js` | three.js scenes for `index` and `mission`. |
| `aleph-prices.js` | Every price on the site. Nothing is hardcoded in markup. |
| `assets/work/` | Project media for the Work section. |

## Work section

`index.html` §07 and `mission.html` §05 show three built sites, each linking to the
live deployment:

| Project | Repository | Live |
| --- | --- | --- |
| Morrow Coffee | `machtumens/Morrow-Coffee` | https://machtumens.github.io/Morrow-Coffee/ |
| Ace House | `machtumens/Ace-House-Tennis-Club` | https://machtumens.github.io/Ace-House-Tennis-Club/ |
| OmniCare | `machtumens/OmniCare-V2.0` | https://omnicare.co.id |

Their data lives in the `WORKS` array (`index.html`) and the `WORLDS` array
(`mission.html`). The seven remaining entries in `WORLDS` are unbuilt concepts and
keep their dashed `PLACEHOLDER` box — a world gets a screenshot only when it has a
`shot` field, so adding one is what promotes it. Testimonials are still marked
placeholders; no client names or metrics are invented anywhere.
