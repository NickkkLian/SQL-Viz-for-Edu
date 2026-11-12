# Query Mirror: checks in detail

The full test suite, moved here from the README. The README keeps the main command (`node check.mjs`).

## Checks

```bash
node check.mjs
node tests/upgrade.mjs
node tests/variants.mjs
node tests/schema.mjs
node tests/schema.mjs --mutations
node tests/upgrade-browser.mjs
```

It covers the vendored sql.js hashes, the engine loading as a browser global, **31 fixtures** (a click state, its pinned SQL, and the row and column counts it returns when executed in SQLite), the URL codec round-trip, the practice grader (column and row order, renamed columns, NULLs, float tolerance, one-statement rule, naming the wrong column) and page hygiene.

The upgrade checks execute all 32 exercise targets against independent handwritten reference queries in the vendored SQLite, then check executable displayed `LIMIT`, quoted text, `AND`/`OR` precedence, `LIKE` wildcards, task links and progress storage. The variant checks (`tests/variants.mjs`) run fifteen mistakes that pass the teaching data (eight boundary mistakes, three `LIKE` patterns, two first-name sorts and two `DISTINCT`s that hide a repeat) and the hardcoded answers against the counterexample datasets: each must fail there, while the reference and an equivalent rewrite pass. The browser checks use installed Chrome with HTTP(S) page requests blocked; they cover hints, draft restoration, grading, completion, next task and unavailable storage. No package install or server is required.

Schema checks cover parsing, multi-join paths, aliases, self-joins, composite keys, the no-foreign-key note, unsupported scopes and agreement with SQLite. `--mutations` breaks the schema reader, alias resolution, self-join handling, multi-join extraction and missing-FK note one at a time; each must fail its intended test. Browser checks also exercise the diagram, keyboard disclosure/scrolling, practice target privacy and last-run behavior. Set `QM_SCREENSHOTS=docs/erd-proof` to capture desktop (1440px) and phone (390px) multi-join, self-join and missing-FK states with HTTP(S) blocked.

```bash
node check.mjs --break
```

Alters one fixture's SQL and another's row count and must exit non-zero. If it ever passes, the fixture checks are not actually running.

```bash
git show 6d58775c8a619a9c990ddd2a2f40a1b392885bee:index.html > /tmp/explorer-6d58775c8a619a9c990ddd2a2f40a1b392885bee.html
node tests/parity.mjs /tmp/explorer-6d58775c8a619a9c990ddd2a2f40a1b392885bee.html
```

The fixtures pin the behaviour of the explorer this project started as. `tests/parity.mjs` loads the query builder out of that original single-file app (commit `6d58775c8a619a9c990ddd2a2f40a1b392885bee`), runs it in a sandbox over every fixture state and compares ordered row values and column counts. Join queries also retain byte-identical SQL. Single-table queries use plain column names and no AS labels.

```bash
node tests/boot-failure.mjs
```

Opens the page in headless Chrome with a broken engine (truncated, garbage, empty and non-base64 wasm) and requires the "SQLite could not start" alert and its Reload button to still be there after 1.5 s, past the 300 ms loading timer. A copy with the real engine must reach "SQLite ready", so a harness that sees nothing cannot pass. Set `CHROME=/path/to/chrome` if Chrome is not in a usual place.

CI runs all of these on every push (`.github/workflows/check.yml`).
