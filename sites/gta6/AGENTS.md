# GTA 6 Map Project Instructions (`sites/gta6/`)

## Task Context
- Read `sites/gta6/SPEC.md` for complete project requirements before making changes.
- Existing files in `sites/gta6/` are an unsatisfactory prototype. Inspect them for reusable data/assets, then execute a clean rebuild.

## Project-Specific Rules
- **Map Engine:** Use Leaflet.js (`L.CRS.Simple`) via pinned CDN or a dedicated pan/zoom coordinate system so markers never drift on zoom, resize, or mobile pinch.
- **Data Integrity:** Keep location data separated in `sites/gta6/data/`. Never fabricate coordinates or label community leaks/estimates as officially verified. Credit all map images and datasets clearly in the UI.
- **Handoff Artifacts:** Save inspection notes in `sites/gta6/AUDIT.md`, architecture/UX plans in `sites/gta6/PLAN.md`, and final review findings in `sites/gta6/REPORT.md`.
