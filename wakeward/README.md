# Wakeward

Wakeward is a standalone sailing puzzle for GroupQuest. Steer the skiff one tile at a time. The lantern follows into the skiff’s previous tile, lights buoys as it passes, and must end inside the berth. Reefs, the tow, and recent wake block movement. Currents constrain departures. Lighting the first buoy opens the tide gates.

Tap an adjacent tile, swipe on the chart, or use the arrow keys. Undo is free. A shortest route earns gold. Using a hint after the first chart caps that attempt at silver. Restart clears the attempt’s moves and hint status. The first four charts teach the main rules. Six chapters contain 24 charts in total. Campaign medals unlock four skiff finishes. The Captain’s Log tracks six achievements and daily completions.

## Run and integrate

From the parent of the extracted `wakeward/` folder, run:

```sh
python3 -m http.server 8000
```

Open `http://localhost:8000/wakeward/`. No build step or runtime packages are required. On GitHub Pages, copy the entire `wakeward/` directory into the published source and serve `wakeward/index.html` over HTTPS. Keep the sibling module and asset paths intact.

GroupQuest’s existing catalog loads static games in an iframe. A future entry can point to the game’s direct path. If the host continues to percent-encode each filename as one segment, resolve this new nested path separately in that integration. For a direct Telegram Mini App, configure the HTTPS game URL. A child on the same origin can use an available host bridge for haptics and Telegram sharing. The top-level Mini App additionally handles `ready`, `expand`, safe-area updates, fullscreen and deactivation. Browser visibility handling is independent of Telegram.

The daily chart rolls over at 00:00 UTC. A challenge URL contains the UTC date, ruleset and optional move target. Every client can replay the same chart. Candidates pass an exact solver before presentation, with a solvable mirrored campaign chart as a bounded fallback. Keep ruleset `w1` stable to preserve existing links and saves. Live sharing uses the served HTTPS URL. Telegram’s share dialog, the browser share sheet and a copyable link are supported.

## Code and save data

- `engine.mjs` and `charts.mjs` contain rules, level data and the exact shortest-path solver.
- `game.mjs`, `render.mjs`, `audio.mjs` and `telegram.mjs` handle input, drawing, sound and the optional Mini App bridge.
- `text.mjs` contains the English interface and content strings.
- `save.mjs` validates versioned localStorage records and recovers from a corrupt primary using the previous valid snapshot. Campaign and daily modes keep independent unfinished routes. Saves are local to the browser origin. The storage adapter accepts a serialized state and can be extended for a future account backend.

Game art, the Harbor at Dusk soundtrack and the bundled fonts are served locally. Font license notices are in `assets/`.

## Verify

Run `node --test wakeward/tests.mjs` from the parent directory. The suite checks optimal campaign routes, 366 daily seeds, movement rules, medals, record recovery, progression and unlocks. Browser QA covered all campaign charts, touch input on four viewport sizes, reloads, sharing and the Telegram API contract with a mock. The real Telegram iOS and Android WebViews, hardware frame rate and a deployed GitHub Pages URL require device or hosting verification.
