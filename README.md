# Fiber Planner Studio V3 V2

Standalone FTTH topology and optical-budget planner. V2 adds an FBT splitter/coupler model based on the supplied loss chart.

## Features
- Drag-and-drop OLT, feeder, splice closure, PLC splitter, FBT coupler, FAT/NAP terminal and ONU nodes.
- Connect devices on a schematic topology canvas and edit fiber lengths and losses.
- PLC splitter ratios with ideal split loss plus configurable excess insertion loss.
- FBT tap percentage selection (5% to 50%) with complementary through percentage.
- Assign each FBT-adjacent branch link as Tap output or Through output. The path calculation applies the matching chart loss when the optical path leaves the FBT node.
- Automatic per-ONU path tracing, optical budget calculation, CSV export and JSON project import/export.
- Browser local-storage persistence.

## FBT loss reference used
| Output power ratio | Loss (dB) |
|---:|---:|
| 5% | 12.4 | 10% | 10.6 | 15% | 8.8 | 20% | 7.3 | 25% | 6.1 |
| 30% | 5.6 | 35% | 4.9 | 40% | 4.2 | 45% | 3.5 | 50% | 3.1 |
| 55% | 2.8 | 60% | 2.4 | 65% | 2.1 | 70% | 1.7 | 75% | 1.4 |
| 80% | 1.1 | 85% | 0.7 | 90% | 0.6 | 95% | 0.4 |

For a selected FBT tap ratio, the other output is its complement (100% minus tap%). Example: 10/90 FBT has 10.6 dB on the 10% tap branch and 0.6 dB on the 90% through branch according to the supplied chart. Set the branch link's FBT output role correctly. The link entering the FBT is not assigned an output loss.

## Run in Termux
```bash
unzip ~/storage/downloads/fiber-planner-studio-v2.zip -d ~
cd ~/fiber-planner-studio-v2
npm install
npm run dev -- --host 0.0.0.0
```

## Calculation notes
- PLC ideal split loss = 10 × log10(N), plus configured PLC excess loss.
- FBT port loss is selected directly from the supplied percentage/loss reference table.
- Fiber loss = length (km) × attenuation (dB/km). Splice and connector losses use configured per-count assumptions.
- Estimated ONU Rx = OLT launch power minus all losses on that endpoint's path.

The supplied FBT table is treated as the reference loss table, not recalculated from an ideal optical formula. Confirm the actual FBT/PLC component specifications, OLT Tx, fiber attenuation and ONU Rx sensitivity using datasheets and field measurements. This is a planning estimate, not an OTDR or live power meter. The canvas is schematic and not a GPS street map.


## V3 improvements
- Distinct SVG material silhouettes for OLT, PLC splitter, FBT, closure, terminal, feeder and ONU.
- FBT tap output fiber is yellow; through output fiber is blue.
- Each fiber segment can be configured as single-core or dual-core. This is a cable attribute and does not double the optical budget.
- Canvas expands with node coordinates and scrolls horizontally/vertically for larger designs.
- Estimated optical power (dBm) is displayed on reachable nodes and in the inspector, calculated from the OLT launch power and upstream losses.


## V4 additions
- Materials library is collapsed behind a floating Materials (+) control to maximize canvas space.
- Topology canvas supports two-finger pinch zoom on touch devices, zoom controls, and a scrollable large workspace.
- Geographic map view supports satellite imagery (Esri World Imagery) and street map (OpenStreetMap).
- Assign GPS latitude/longitude by selecting a device and tapping its location on the map, or entering coordinates in the inspector.
- Device markers display saved coordinates; Google Maps links open the selected coordinates.
- Google Earth/Google Maps live basemap tiles are not embedded. Google Maps Platform requires an API key and billing configuration; the included satellite imagery is Esri, not Google Earth.
- Map defaults to the Camarines Sur area as a starting view; it is not a live GPS location tracker.


## V5 interface upgrades
- Compact single-row command bar with a Project dropdown for import/export/example actions.
- Dedicated undo, redo, local save, and dark/light theme controls.
- Materials drawer opens from the map toolbar beside location controls.
- Browser geolocation button centers the geographic map after permission is granted.
- Search supports place names (OpenStreetMap Nominatim) and pasted latitude,longitude coordinates.
- Automatic local storage save remains enabled; explicit Save writes the current project and settings.

- The Locate control opens the geographic map if necessary, then requests browser location permission and centers the map.


## V6 topology workspace improvements
- Materials library is a docked, collapsible side rail inside the topology/map panel; it flexes beside the canvas rather than floating over it.
- Compact Select/Move and Connect tools remain visible in the map toolbar.
- Canvas devices use professional equipment-style shape labels (OLT, PLC, FBT, FOSC, FAT, ONU, FIBER) rather than emoji glyphs.
- Hover or select a device to reveal quick actions: Edit (opens it in the inspector), Connect (sets it as the fiber source), and Delete (removes it and attached links after confirmation).
- On touch screens, device quick actions remain visible because hover is unavailable.


## V7 topology usability and connection validation
- Four directional viewport buttons scroll the topology workspace up, down, left, and right to find devices outside the current view.
- Device materials are always visible in a horizontal, organized tray at the bottom of the topology/map panel. The Materials toolbar button scrolls the tray into view.
- Mobile layout prioritizes the topology canvas and reflows the material tray into a two-column card grid.
- Fiber connection rules reject incompatible device pairs and duplicate links with an explanatory notice.
- Imported project files are also checked for compatible device pairings before replacing the current project.
- Current compatibility rules:
  - OLT: feeder, splice closure, PLC splitter, FBT.
  - Feeder: OLT, feeder, closure, PLC, FBT, terminal, ONU.
  - Closure: OLT, feeder, closure, PLC, FBT, terminal.
  - PLC: OLT, feeder, closure, PLC, FBT, terminal, ONU.
  - FBT: OLT, feeder, closure, PLC, FBT, terminal, ONU.
  - Terminal: feeder, closure, PLC, FBT, terminal, ONU.
  - ONU: feeder, PLC, FBT, terminal.
- These are practical topology-editor rules, not a substitute for checking actual port types, optical interfaces, connector standards, and equipment datasheets.


## V8 canvas interaction refinements
- Removed the Materials shortcut from the topology toolbar. Materials remain available in the permanent bottom equipment tray.
- Removed the floating directional arrow pad.
- The topology viewport can be panned by dragging empty canvas space with one finger or mouse. Dragging a device still moves that device.
- Two-finger pinch zoom scales the full SVG workspace. The viewport recenters on the overall network after zoom changes.
- The initial SVG viewBox is calculated from the bounds of all devices, with balanced margins so the network is treated as the center of the workspace rather than being pinned to the top-left.
- Scrollbars remain available for navigating large plans.
- V7 project data in local storage is read as a migration fallback; future explicit saves use the V8 storage key.


## V9 touch navigation and auto-fit
- Replaced touch-event pinch handling with Pointer Events multi-pointer tracking, which is more reliable on Android Chrome and other mobile browsers.
- Canvas uses `touch-action: none` so the browser page does not consume two-finger gestures before the topology workspace receives them.
- Two-finger pinch changes the SVG viewBox scale, keeping the gesture inside the topology canvas.
- Single-finger drag on empty canvas pans the viewport; dragging a device still moves that device.
- The network bounds are calculated from all device positions and padded, then fit into the available canvas area with `preserveAspectRatio="xMidYMid meet"`.
- SVG scales to the canvas viewport instead of forcing a large fixed pixel canvas, so the background grid and devices fit the phone display.


## V10 mobile layout refinement
- Full-width, centered topology workspace with a balanced compact toolbar.
- Canvas occupies the main screen area and centers the network drawing.
- Materials are presented as a single horizontal, touch-scrollable strip with consistent 78–94 px cards and comfortable tap targets.
- Optical budget remains directly below the map and uses a horizontally scrollable table on narrow phones.
- Responsive spacing and control sizing for narrow Android screens.


## V11 mobile header refinement
- Brand/title centered above a single balanced row of project, undo, redo, save, and theme controls.
- Removed the extra brand tagline from the narrow mobile header to reduce crowding.
- Topology heading now takes the full width above its controls; its eyebrow, title, and helper text no longer collapse into a narrow vertical column.
- Map actions use a balanced four-column grid on phones with consistent touch targets.
- Desktop header and map toolbar retain their horizontal layout.


## V12 floating equipment settings and quick actions
- Selecting a device opens its own animated floating inspector. On phones it appears as a bottom sheet; on larger screens it appears centered with a dimmed backdrop.
- Device-specific settings remain in the inspector (OLT launch power, PLC ratio/excess, FBT tap percentage, ONU sensitivity/margin, coordinates, display name and position).
- Selecting a fiber link opens its floating link settings.
- Device quick actions are collapsed behind a single three-dot control and expand into Edit, Link and Replace actions.
- Replace opens a material picker. It preserves the device ID, map position and existing links, resets the selected equipment's type-specific defaults, and blocks replacement if it would make an adjacent fiber connection incompatible.
- The previous direct Delete device quick action has been removed. Fiber-link deletion remains in link settings.

## V14 — Material lock / unlock protection

- Each topology material can be locked from its Inspector panel or its canvas action menu.
- Locked materials cannot be dragged, repositioned through inspector fields, edited, replaced, or deleted.
- Locked nodes remain selectable for inspection and remain part of all optical calculations.
- A gold padlock marker identifies protected nodes on the topology canvas.
- Unlocking restores normal editing and movement.
- The `locked` flag is stored with each node in the existing local project save and JSON project export, and participates in undo/redo history.
