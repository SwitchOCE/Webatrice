# Task wr2r: PR R2, `refactor(game): share the zone-view dialog family`
Push branch: `claude/parity-r2-zone-view-family`. PR file: `parity-r2-zone-view-family`. Base: `origin/claude/parity-25b-board-prefs` (af3cfc1; 25b on restack-16).
Spec: `/tmp/notes/specs/aud2.md` (the architecture audit). Follow the refactor idioms of PR 05/09: characterization specs first (pin current behaviour and request shapes before moving code), then move, then delete. No behaviour change unless the audit names a bug; list any such fixes separately in the PR file. Every commit typechecks. Gate: the full gate plus webatrice e2e on all browsers.
Implement aud2 §4 R2 in full, plus duplicates D3 and D8, plus the HandZone/StackColumn direct `lookupCard` calls (rv15 follow-up), which move onto `useCardCatalogMeta`:
- shared `dialogs/shared/{useFloatingPanelGeometry,useZoneViewPreferences,useCardCatalogMeta}.ts` + `ZoneCardGroups`/`ZoneCardCell`;
- move `ZoneViewPanel`, `IncomingRevealDialog` and `ZoneRevealPanel` onto them;
- `useIncomingReveal` owns the selectors and dispatches;
- one `ZoneName`-keyed label map with i18n keys;
- the marquee reuses `useSeatMarquee`.

Leave the ZoneStack library-menu dedupe to PR 30. Keep 25b's search autofocus and group/sort prefs working, pinned by specs.
