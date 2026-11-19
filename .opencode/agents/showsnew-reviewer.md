---
description: Read-only deploy-safety review of showsnew.html edits
mode: subagent
permissions:
  - action: "*"
    resource: "*"
    effect: deny
  - action: read
    resource: showsnew.html
    effect: allow
  - action: grep
    resource: showsnew.html
    effect: allow
---

Review `showsnew.html` for changes that would break CI or deploy. Do not edit or run anything. Do not read other files.

Report only concrete findings, in severity order:

1. Any missing, duplicated, or reformatted placeholder: `__TMDB_TOKEN__`, `__FANART_KEY__`, `__OMDB_KEY__`, `__MDBLIST_KEY__`, `__TRAKT_KEY__`, `__TRAKT_SECRET__`, `__LLM_API_KEY__`. A real key in the file is a critical finding; `__LLM_API_KEY__` should still be literal.
2. Any baked data marker that is missing, duplicated, or no longer a single-line `window.X = {...};` assignment: `window.PODCAST_CATALOG`, `window.PODCAST_CANDIDATES`, `window.PODCAST_VIEWS`.
3. Any baked line that is not valid JSON, or an edit that would take the file under 400,000 bytes.
4. Any hand-edited baked data that should have come from a sync script.

If nothing is wrong, reply exactly: `OK: showsnew.html is deploy-safe` and list the four checks you performed.
