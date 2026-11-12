# Query Mirror

**Learn SQL by clicking: every click becomes the SQL behind it, then practice shows which rows your own query gets wrong.**

For SQL learners and teachers: pick tables and filters, see the generated `SELECT`, then switch to Practice to find missing or extra rows in your answer.

**[Try the live demo](https://nickkklian.github.io/SQL-Viz-for-Edu/?db=movies&tables=film%2Cdirector)** · [Start a practice exercise](https://nickkklian.github.io/SQL-Viz-for-Edu/?db=hospital&exercise=names)

No account, install or server. Four synthetic teaching datasets run in SQLite inside your browser.

[![Query Mirror with the Toronto selection, generated SQL and three matching rows](docs/screenshot-explore.png)](https://nickkklian.github.io/SQL-Viz-for-Edu/)

## Quick start

Open the live demo above, or clone the repository and open `index.html` in any modern browser. There is no install step and no dev server: `index.html`, `engine.js`, `app.js`, the tokens, licensed fonts and `vendor/` are the whole app, and the SQLite engine is included, so it works offline.

```sh
git clone https://github.com/NickkkLian/SQL-Viz-for-Edu.git
cd SQL-Viz-for-Edu
# then open index.html
```

The opening lesson generates `SELECT first_name, city FROM patient WHERE city = 'Toronto';` and uses those column names in the chips and both tables. Matching rows includes row numbers and a Live preview status. The source preview shows four real teaching rows beside the result; Show all source rows reveals the rest. **Tables and exercises** contains all four datasets, 32 saved exercises, table selection and advanced query controls. **Result options** there contains columns, duplicate handling, sort and limit.

Explore follows your clicks; Practice hides the target SQL and compares results instead of requiring identical wording. Eight exercises per dataset include hints and save progress in this browser when storage is available. Clearing site data removes that progress. The screenshot shows the opening lesson. The demo link opens the Movies dataset.

## What it does

| | |
|---|---|
| **Explore** | Tick tables (linked tables are joined for you), add conditions, group, summarise, sort, limit. The generated SQL updates on every click and runs immediately. |
| **Practice** | The mirror is hidden. You get the expected result and write the query yourself. `Run & check` grades it and, when wrong, highlights which rows are missing and which are extra. |
| **Exercises** | Eight fixed tasks per dataset, each with a prompt and hint. Draft answers and completion stay in the browser; completing a task does not require the same SQL wording. Exercise targets stay fixed until you return to Explore. |
| **Share** | The whole state lives in the URL. `Copy task link` gives a link that opens straight into practice mode on the same task. |
| **Schema & query path** | See every table, column, primary key and foreign key from the loaded `CREATE TABLE` statements. The last executed query highlights its tables and declared relationships; a separate diagram keeps each alias distinct, including self-joins. |

## Follow the joins

Open **Schema & query path** below the mirror. Explore follows the query that just executed, including automatically added bridge tables. In Practice it follows **your last executed answer**, after **Run & check** (or Ctrl/⌘ + Enter); the hidden exercise target is never traced. Editing a draft leaves the previous executed path visible. A SQLite error clears the trace.

Solid highlighted lines correspond to declared foreign keys. A join on another column (for example `customer a JOIN customer b ON a.city=b.city`) gets a dashed query edge and the explicit note **“No declared foreign key for this join.”** Multiple aliases of the same table get separate query nodes, so `child.referred_by = parent.cust_id` is visible as a self-join. Join descriptions name the exact alias/column pairs. Composite foreign keys need all column pairs before a relationship lights up.

The teaching datasets now declare their primary and foreign keys in the SQL itself, including customer and viewer referral self-relations; checks load every row with SQLite foreign-key enforcement enabled. The diagram does not infer keys from column names or borrow the builder’s relationship list. The schema reader handles inline and table constraints, composite keys, quoted identifiers, comments and references that omit the parent’s primary-key columns. No new library or remote service is used.

Use Tab and Enter to collapse the panel or open its full text equivalent. Tab to either diagram and use arrow keys to scroll; wide diagrams stay inside their panels on phones. Keys and join status are conveyed in text as well as color.

The query reader covers a single flat `SELECT` with aliases, multiple joins, self-joins, qualified equality predicates joined by `AND`, and unambiguous `USING`. Cross/comma/natural and non-key joins show no confirmed foreign key. `OR`/`NOT` predicates are explicitly marked unconfirmed. Subqueries, CTEs, compound queries, unknown tables and ambiguous aliases show **Path unavailable** instead of guessing; SQLite execution and grading still work independently.

![Practice mode: the expected result, your SQL, and a graded verdict](docs/screenshot-practice.png)

## Datasets (synthetic)

| Dataset | Tables | What it is for |
|---|---|---|
| Hospital | Patients, Doctors, Appointments | Two joins through a fact table, aggregation |
| E-Commerce | Products, Customers, Orders, Order Items | Four-table chain, a computed column |
| Movies | Films, Directors, Viewers, Watch History, Tags | Bridge table, `LEFT JOIN`, nullable keys |
| University | Students, Courses, Enrollments | Many-to-many, `GROUP BY` + `HAVING` |

All four are generated for teaching: no real people, companies or patients. They live in `engine.js` as SQL text and are loaded into SQLite in memory when the page opens.

## Deep links

| Link | Opens |
|---|---|
| `?db=movies&tables=film,director` | Films joined to directors through the bridge table |
| `?db=university&tables=student` | Students, ready to group |
| `…&mode=practice` | The same state as a practice task |
| `?db=hospital&exercise=names` | The first Hospital exercise, in practice mode with its fixed target |

Older links using only `db` and `tables` still work. Unknown tables or columns in a link are dropped rather than trusted.

## How it is put together

```mermaid
flowchart LR
  subgraph browser["One browser tab — no server"]
    UI["app.js<br/>controls, tables, practice UI"]
    ENG["engine.js<br/>datasets · click state → SELECT<br/>formatter · grader · URL codec"]
    ER["schema.js<br/>CREATE TABLE → schema<br/>executed SELECT → alias join path"]
    WASM["vendor/sql-wasm.js + .wasm<br/>SQLite 3.45.0 via sql.js 1.10.2"]
    UI -->|"state"| ENG
    UI -->|"DDL + last executed SQL"| ER
    ENG -->|"SELECT"| WASM
    WASM -->|"rows"| UI
    UI -->|"student SQL (read-only, on a scratch copy)"| WASM
    WASM -->|"rows"| ENG
    ENG -->|"verdict + row diff"| UI
  end
  URL["URL (?db=…&tables=…&q=…&mode=practice)"] <-->|"encodeState / decodeState"| ENG
  CHECK["check.mjs<br/>31 fixtures + grader tests"] -->|"require()"| ENG
```

`engine.js` holds the builder and grader; `schema.js` reads schema declarations and query paths. Both touch no DOM and run unchanged in the page and under `node`.

## Limits

- **The mirror uses SQLite syntax, not Oracle-verified SQL.** The displayed query runs in SQLite, including a real `LIMIT` clause. `CAST(… AS TEXT)` and `LIMIT` are SQLite spellings; nothing is run against an Oracle instance.
- **A teaching subset in the click builder.** Inner and left joins along fixed schema keys, `WHERE`, `GROUP BY`, `HAVING`, `ORDER BY`, `DISTINCT`, and five aggregates. No subqueries, self-joins, window functions, unions or writes in the builder. Practice accepts SQLite read queries, and its diagram supports flat self-joins as described above.
- **Grading compares results, not SQL.** An elegant query returning different rows fails. Column names and order are ignored; row order is checked only when the task has a sort. A query that returns the right rows by luck can still pass, except on the 13 exercises that have a counterexample dataset: the AND, price and GROUP BY tasks where a `>=` written for `>` used to match the teaching data; the two `LIKE` tasks where a pattern that matches anywhere, or `'The%'` without its space, did; the two "first ten" name tasks where sorting by the first name alone did; and the ecommerce and university join tasks where a `DISTINCT` hid a real repeat (a second order, a retaken course). A small extra dataset adds the rows that tell the right query from the lucky one, and the page shows the rows, or the row order, your query gets wrong there. The other 19 exercises have none yet.
- **Joins are chosen for you.** Tables are connected along the schema's declared edges by shortest path, so the explorer cannot produce an accidental cross join — and cannot demonstrate one either.
- **Conditions use SQL precedence.** Each condition after the first chooses `AND` or `OR`; `AND` is evaluated first. Parenthesized condition groups are outside the click builder. Text `LIKE` accepts `%` (any text) and `_` (one character), using SQLite's default case rules.
- **Progress belongs to this browser.** Saved drafts and completion are local, without an account or sync. Storage can be unavailable in private/restricted contexts; practice still works and shows “saving unavailable.” Custom tasks have no saved progress. A result match counts as completion even after revealing the mirror; this is a learning aid, not an exam record.
- **Datasets are tiny** (5–50 rows per table). Good for reading a result by eye, useless for anything about performance.
- **The join diagram explains, it does not animate.** This is a static explanation of the executed SQL, not an animated SQLite execution plan or a row-by-row traversal.

## Checks

```bash
node check.mjs
```

Needs Node 20 or newer (CI runs 20 and 22). It covers the vendored sql.js hashes, the engine loading as a browser global, **31 fixtures** (a click state, its pinned SQL, and the row and column counts it returns when executed in SQLite), the URL codec round-trip, the practice grader and page hygiene. The exercise, counterexample, schema, browser, parity and boot-failure checks, and what each one covers, are in [DOCS.md](DOCS.md). CI runs all of them on every push (`.github/workflows/check.yml`).

## Self-hosted engine

sql.js 1.10.2 is vendored in `vendor/` rather than loaded from a CDN, so the page keeps working offline, behind a strict CSP, and if the CDN changes. `vendor/SOURCE.md` records the origin and hashes; `check.mjs` re-hashes on every run.

```
sql-wasm.wasm  sha256 4c1c978826062f7b1bb6cc811503863b01415175d0e6dd9ce8a30a81a02c0afb
sql-wasm.js    sha256 3358bb12892642698c0804c85cba48de562bc2de324fe58a422f282832c79c01
```

Both were byte-compared against the npm tarball for sql.js version 1.10.2. `vendor/sql-wasm-b64.js` carries the same wasm bytes as base64, because a page opened from `file://` cannot fetch a sibling `.wasm` — that is why a downloaded copy works by double-clicking `index.html`.

MIT · built by Nick Lian
