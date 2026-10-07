# Aleph One — company site

Live: <https://machtumens.github.io/Aleph.One/>

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
| `index.html` | The site. Launch sequence: rocket scene, ten worlds, mission configurator. |
| `site.html` | Long-form variant. 13 sections, work gallery, price configurator, FAQ. |
| `art-direction.html` | Deliverable A — the three directions and the pick. |
| `screens.html` | Turn 2 screen sheet. |
| `aleph-rocket.js` · `aleph-scene.js` | three.js scenes for `index` and `site`. |
| `vendor/three.module.min.js` | three.js r160, self-hosted. The scenes must not depend on a CDN. |
| `aleph-prices.js` | Every price on the site. Nothing is hardcoded in markup. |
| `worlds/` | The seven concept sites, opened full-screen from the Work section. |
| `assets/work/` | Project media for the Work section; `posters/` holds the card screenshots. |
| `uploads/aleph-mark.png` · `aleph-icon.png` | The mark cut out of the logo card (transparent, glow added in CSS) and the 180px tab / home-screen icon. The full card stays as the social image. |

## Work section

`index.html` §05 shows nine sample sites as posters (a screenshot of each site's
first screen). Clicking one opens that site full-screen in an iframe on the same
page; the poster morphs into it with the View Transitions API and covers the
iframe until it has loaded. Back, Esc or the "← Aleph One" pill closes it.
The "I want a…" preview in §08 opens the same way.

- Concept sites: `worlds/<slug>.html`, one self-contained file each, imagery
  hotlinked from Unsplash. Every one is labelled "A concept site by Aleph One"
  and its forms only show a confirmation; nothing is sent anywhere.
- Posters: `assets/work/posters/<slug>.webp` (1440×900) and `<slug>-m.webp`
  (390×760 @2x). Regenerate after changing a site's first screen, e.g. with
  headless Chromium:
  `chrome-headless-shell --headless --hide-scrollbars --window-size=1440,900 --screenshot=x.png <url>`
  then `cwebp -q 76 x.png -o <slug>.webp`.
- Adding a world: add an entry to `WORLDS` with a `slug` (and `live` if it is a
  real deployment, which is then loaded instead of `worlds/<slug>.html`).

`site.html` §07 still links its two built sites out to the live deployments:

| Project | Repository | Live |
| --- | --- | --- |
| Morrow Coffee | `machtumens/Morrow-Coffee` | https://machtumens.github.io/Morrow-Coffee/ |
| Ace House | `machtumens/Ace-House-Tennis-Club` | https://machtumens.github.io/Ace-House-Tennis-Club/ |

Their data lives in the `WORKS` array (`site.html`) and the `WORLDS` array
(`index.html`). Concepts are marked CONCEPT on their card and in the pill, and
carry no testimonials, ratings or press quotes. Testimonials elsewhere are still
marked placeholders; no client names or metrics are invented for Aleph One itself.
