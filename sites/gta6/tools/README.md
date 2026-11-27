# Audit tools

Plain Node (18+), no dependencies, no build step. Run them from the repo root.

| Command | What it does |
| --- | --- |
| `node sites/gta6/tools/validate.mjs` | Schema, id, category, region, county, source and marker-link check over `data/`. Exit 1 on errors, warnings on things to look at. |
| `node sites/gta6/tools/audit-markers.mjs` | Re-runs the GTABase cross-check: verifies every linked pin against its marker and lists pins whose best same-name marker is more than 500 m away. |
| `node sites/gta6/tools/link-markers.mjs` | Proposes (or with `--write`, records) the marker id on curated records. |

## Where the marker data comes from

`data/gtabase-markers.json` is a snapshot of the GTABase GTA VI map's marker list — 6,510
community-submitted markers with ids like `weapon-spawn-025` — trimmed to the fields an audit needs.
`data/gtabase-markers.meta.json` records the capture date, the source, and the SHA-256 of the file, so a
result can be tied to the exact snapshot it came from.

The site does not publish a documented API for this list; it is the payload its own map loads. To refresh
it, save that payload again and trim to `id, name, category, x, y, description`, then update the `sha256`
and `captured` fields in the meta file. Refreshing is a deliberate act: a re-run against a new snapshot can
turn today's passing audit into a list of differences, which is the point.

Coordinates are in the same metre frame as `data/locations.json`, so distances are plain Pythagoras.

## How a record claims a marker

```json
"position": { "x": -3571, "y": -4081, "method": "reported", "accuracy": 40 },
"marker": { "source": "gtabase", "id": "weapon-spawn-025", "name": "Swamp Bait Akulus" }
```

Only pins whose position *came from* a marker carry one. A pin that is an estimate keeps
`method: "estimated"` and no link, and shows up in the audit's candidate list if a marker with the same
name is far away — which is exactly how the crab lab (§14), the Gullet Marsh hut and eleven others (§16)
were found.

The marker's `name` is stored alongside the id because names change. If a future snapshot renames
`weapon-spawn-025`, the audit still reports which marker the record meant.

## What the audit does and does not decide

- **It fails** when a linked pin is more than 60 m from its marker (`--marker-tolerance`), when a linked
  marker id is missing from the snapshot, or when a collection pin has drifted from its own `_gb.id`.
- **It reports candidates**, never conclusions: a record with no link whose best same-name marker is more
  than `--threshold` (default 500 m) away, needing at least two shared name words and one of them
  distinctive. `--strict` makes candidates fail too.
- The artwork decides. A candidate is a question for a human with the tile crops open (REPORT §16); the
  script never moves a pin.

Useful flags:

```bash
node sites/gta6/tools/audit-markers.mjs --threshold 300          # wider net
node sites/gta6/tools/audit-markers.mjs --json > /tmp/audit.json  # machine-readable
node sites/gta6/tools/link-markers.mjs --include-estimated        # what would linking an estimate look like
node sites/gta6/tools/link-markers.mjs --set some-record=marker-id --write
```

`--include-estimated` is a review aid only: a record whose pin is an estimate should be upgraded to
`reported` with a 40 m accuracy (or moved) before it claims a marker, and that is a data decision, not a
script one.
