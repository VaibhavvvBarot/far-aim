# FAR/AIM

A personal FAR/AIM reader for the iPad Mini. It's free, works offline and updates itself every night.

**Open it:** https://vaibhavvvbarot.github.io/far-aim/ in Safari, then tap Share → **Add to Home Screen**. Once it's on the home screen it opens full-screen like a normal app and works with no signal.

Unofficial. Always check the official [eCFR](https://www.ecfr.gov/current/title-14) and [FAA AIM](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/) before relying on it.

## What's in it

- 14 CFR Parts 1, 43, 61, 67, 68, 71, 73, 91, 97, 103, 107, 117, 119, 135, 141, plus 49 CFR 830 (NTSB)
- The full AIM with figures, and the Pilot/Controller Glossary
- Type a number (`91.155`, `61.57(c)`, `3-2-4`, `part 135`) to jump straight there, or search words with partial-word and typo tolerance, `"exact phrases"`, `OR` and `-exclude`
- Highlights in five colors, notes, bookmarks with your own names, and a backup file
- What's new: every changed section with the exact words added and removed
- Light, sepia, dark and red night-cockpit themes

## How updates work

`.github/workflows/update.yml` runs every night at 03:17 Mountain time:

1. `scripts/build-data.mjs` checks the eCFR's issue dates and the AIM's effective date. If nothing moved, it only records the check time.
2. If something changed, it downloads the Parts listed in `scripts/parts.mjs`, the AIM and the glossary, and writes small JSON packs to `public/data/`. It compares the new text with the previous run and stores word-level diffs in `public/data/changes.json`.
3. The app is rebuilt and published to GitHub Pages. The next time the iPad opens the app with a connection, it downloads only the files that changed.

To add a Part, add its number to `scripts/parts.mjs`. You can also run the workflow by hand from the Actions tab.

## Develop

```sh
npm install
npm run data     # fetch the regulations (needs internet)
npm run dev      # local dev server
npm run build    # production build in dist/
```
