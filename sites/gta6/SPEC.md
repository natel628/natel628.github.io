# Project: Rebuild the GTA VI Interactive Map

Completely redesign and rebuild the GTA VI map project in `sites/gta6`.
The current map is not acceptable. Do not waste time trying to patch its existing layout. First inspect the existing files, understand what data and assets are available, and then propose and implement a proper replacement.

## Design Inspiration
- Use `https://mapgenie.io/grand-theft-auto-6/maps/leonida` as the primary UX inspiration.
- Build a polished, immersive GTA VI exploration map that feels like a professional game companion website.
- Do not copy MapGenie's proprietary code, graphics, or data.

## Core Experience
The **MAP** is the main attraction and should occupy most of the screen.

### 1. Interactive Map
- Large, detailed Leonida map.
- Smooth zooming and panning (mouse wheel zoom and mobile pinch zoom).
- Zoom controls and reset/fit-map control.
- Accurate placement of markers relative to the map across all zoom levels.
- Responsive desktop and mobile layouts.
- Full-screen map option.
- Map loads reliably without awkward blank areas.

### 2. Location Markers
Support distinct, attractive icons and colors for categories such as:
- Hidden stashes and treasure
- Collectibles and hidden packages
- Easter eggs and secrets
- Unique weapons
- Interesting locations and landmarks
- Safehouses
- Activities and challenges
- Shops and useful services

### 3. Marker Details
Clicking a marker opens a polished information panel containing:
- Location name
- Category
- Description and discovery hints
- Screenshot or reference image where available
- Exact map position
- Verification status
- Source/reference link when available

### 4. Search and Filters
- Search locations by name
- Filter by category
- Show only undiscovered locations
- Show/hide individual categories
- Clear all filters
- Display the number of visible markers

### 5. Exploration Progress
- Mark locations as discovered
- Save progress locally using `localStorage`
- Show completion percentages
- Allow progress to be reset
- Allow custom markers or notes

### 6. Navigation
- Select a destination and highlight it on the map
- Mark current in-game position manually
- Plan a route/line between manual position and destination where technically feasible
- Do not pretend to have automatic in-game GPS tracking

## Visual Direction
- Dark, sophisticated interface with GTA-inspired styling (without copying Rockstar branding).
- Excellent typography, subtle animations, beautiful marker icons, clean collapsible side panels, and minimal clutter.
- Map-first layout—avoid generic dashboard or card-grid layouts.

## Technical Requirements
- Preserve compatibility with GitHub Pages.
- Prefer vanilla HTML, CSS, and JavaScript (pinned CDN libraries like Leaflet `L.CRS.Simple` are permitted; avoid unnecessary frameworks and build steps).
- Keep map data separate from the interface (`sites/gta6/data/`).
- Ensure map coordinates and marker positions remain accurate when zooming, panning, and resizing.
- Support desktop and mobile viewports.
- Keep existing useful data and functionality where appropriate.

## Map Data and Accuracy
- Find the best legitimate, usable source for a geographically meaningful Leonida map.
- Investigate available community map datasets and their licenses; credit data and imagery appropriately in the UI.
- Do not fabricate map locations or pretend speculative discoveries are verified.
- Clearly distinguish:
  1. **Officially documented locations**
  2. **Community-reported locations**
  3. **Estimated or unverified locations**
- If the current map asset is inaccurate, replace it rather than building around it.

## Implementation & Handoff Process
1. **Freebuff (Inspect & Plan):** Inspect `sites/gta6/`, document flaws and licensed map assets/datasets in `sites/gta6/AUDIT.md`, and write the architecture/data schema in `sites/gta6/PLAN.md`.
2. **Kilo (UX/UI Review):** Evaluate the proposed layout and update `sites/gta6/PLAN.md` with UX/UI refinements.
3. **Cline (Build & Test):** Implement the replacement in `sites/gta6/` and verify interactions, marker positioning, filters, progress tracking, and mobile responsiveness in a local browser.
4. **OpenCode (Code Review & Report):** Audit the finished implementation, fix identified issues, and write the final report (changed files, features, limitations, tests) to `sites/gta6/REPORT.md`.

## Constraints
- Do not modify unrelated websites in this repository.
- Do not push to GitHub or deploy without user approval.
