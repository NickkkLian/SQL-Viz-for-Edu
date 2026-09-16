# Vendored: sql.js 1.10.2 (SQLite compiled to WebAssembly)

| file | bytes | sha256 | origin |
|---|---|---|---|
| `sql-wasm.js` | 49857 | `3358bb12892642698c0804c85cba48de562bc2de324fe58a422f282832c79c01` | `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.js` |
| `sql-wasm.wasm` | 654690 | `4c1c978826062f7b1bb6cc811503863b01415175d0e6dd9ce8a30a81a02c0afb` | `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/sql-wasm.wasm` |
| `sql-wasm-b64.js` | generated | decodes to the `.wasm` above | `node vendor/pack.mjs` |

Both upstream files were byte-compared against the npm tarball for sql.js version 1.10.2 (`registry.npmjs.org`) on 2026-09-15: identical.
`node check.mjs` re-hashes both and fails if either drifts.

License: MIT (sql.js, © Ophir Lojkine and contributors; SQLite is public domain). Unmodified.

Why the base64 copy: a page opened from `file://` cannot fetch a sibling `.wasm` in Chromium, so `index.html`
passes the decoded bytes to `initSqlJs({ wasmBinary })`. Node (`check.mjs`) loads the `.wasm` file directly.
