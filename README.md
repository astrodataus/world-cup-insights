# Bend It Like Blobby

World Cup analytics — 2018, 2022, 2026.

Three men's World Cups — 2018, 2022 and 2026 — as one set of joined tables:
5,937 shots with pitch position and expected-goal values, plus per-player
finishing, profile and creation stats.

**Live:** https://astrodataus.github.io/world-cup-insights/

Built by **Ethan Elias** on public match data. Design: **Astrodata**, with a
footer toggle between two skins — Taliesin (the Astrodata house midnight) and
Boletin Radiante (a Mexico 68 Boletin program at full vibracion). The theme
button flips each skin to its light program.

## Views

- **The Tournament** — shots, goals, xG and conversion, by tournament, source and round
- **The Pitch** — every shot where it was taken; click one and it explains itself
- **Finishing** — goals against expected goals; over- and under-performers separate
- **The Race** — a match replayed as minute-by-minute cumulative chance value
- **Creators** — the players who make chances, with comparable radar profiles

## Files

- `index.html` — the app (loads `data/*.csv` at runtime)
- `standalone.html` — same app with the data embedded, works from a file
- `world-cup-omni-app.html` — the Omni Analytics app build (loads through
  `omni.query()` from four saved workbook queries: Shot Map, Player Finishing
  Metrics, Player Profile Radar, Creator Leaderboard)
- `data/` — the four normalized CSV exports

## Data notes

- 2018 shots carry no xG values in the source; xG figures cover 2022 and 2026.
- The player tables combine all three tournaments per player (the source
  export carries no per-tournament split).
- Every headline figure is recomputed from the raw files by an automated
  check before anything ships. Expected goals is a probability a chance is
  scored, estimated from historical shots; it is a lens, not a verdict.
