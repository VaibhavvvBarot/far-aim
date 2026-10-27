# FAR/AIM

A personal FAR/AIM reader for the iPad Mini. It's free, works offline and updates itself every night.

**Open it:** https://vaibhavvvbarot.github.io/far-aim/ in Safari, then tap Share → **Add to Home Screen**. Once it's on the home screen it opens full-screen like a normal app and works with no signal.

Unofficial. Always check the official [eCFR](https://www.ecfr.gov/current/title-14) and [FAA AIM](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/) before relying on it.

## What's in it

- All of 14 CFR Chapter I (every FAA Part, 1 through 198, read from the eCFR table of contents each night), plus 49 CFR 175 (hazmat by aircraft), 830 (NTSB) and 1552 (flight school security)
- The full AIM with figures, and the Pilot/Controller Glossary
- Type a number (`91.155`, `61.57(c)`, `3-2-4`, `part 135`) to jump straight there, or search words with partial-word and typo tolerance, `"exact phrases"`, `OR` and `-exclude`
- Highlights in five colors, notes, bookmarks with your own names, and a backup file
- What's new: every changed section with the exact words added and removed
- Tap a § reference to preview it without losing your place; tap a dotted term (defined in 14 CFR 1.1) to see its legal definition
- An outline of (a), (b), (c) for long sections; read aloud with the iPad's voices; flashcards with spaced repetition made from your highlights
- Swipe from the left edge to go back; keyboard shortcuts (⌘K search, ⌘F find, ← → sections, R read aloud)
- Light, sepia, dark and red night-cockpit themes

## How updates work

`.github/workflows/update.yml` runs every night at 03:17 Mountain time:

1. `scripts/build-data.mjs` checks the eCFR's issue dates and the AIM's effective date. If nothing moved, it only records the check time.
2. If something changed, it downloads every Part in 14 CFR Chapter I plus the Title 49 Parts listed in `scripts/parts.mjs`, the AIM and the glossary, and writes small JSON packs to `public/data/`. It compares the new text with the previous run and stores word-level diffs in `public/data/changes.json`.
3. `scripts/validate-data.mjs` checks the new data: no Part shrank, sections have text, key rules (91.155, 61.57, AIM 3-2-3…) are present, and not an implausible number of sections changed overnight. If the fetch or the checks fail, yesterday's data is kept, an issue titled "Nightly update problem" is opened, and the run is marked failed so GitHub emails you.
4. The app is rebuilt and `tests/smoke.mjs` opens it in a headless browser at iPad Mini size. If that fails, nothing is published.
5. The app is published to GitHub Pages. The next time the iPad opens the app with a connection, it downloads only the files that changed.

To add a Part, add its number to `scripts/parts.mjs`. You can also run the workflow by hand from the Actions tab.

## Develop

```sh
npm install
npm run data     # fetch the regulations (needs internet)
npm run dev      # local dev server
npm run build    # production build in dist/
```
