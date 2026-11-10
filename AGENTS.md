# Repository operating rules

## Auxiliary-key semantics

- Treat `entry.tone` as `toneKeysByTone`: its five positions mean first, second, third, fourth, and neutral tone. Never describe the literal string as the shape-key order.
- Derive `shapeKeysByMeaning` for bend, horizontal, left-falling, vertical, and dot through `tools/auxiliary_semantics.js`. The paired invariant is always `toneDigitsByShapeMeaning = 42310`; standard mappings are `AEUIO ↔ IEUAO` and `AVUIO ↔ IVUAO`.
- Treat `auxiliaryClass` and historical ID fragments `AEUIO` / `AVUIO` as reserved/top-gong key-set family labels, not ordered mappings. They may describe `reservedKeys` or `topgongReserve`, not `entry.tone`. Historical IDs are stable and must not be renamed to express semantic order.
- New code and reports must use explicit names such as `shapeKeysByMeaning`, `toneKeysByTone`, and `auxiliaryKeySet`; do not introduce ambiguous names such as `auxiliaryKeys` or `slotKeys` without a boundary adapter.
- Add or update semantic round-trip tests whenever auxiliary encoding, scheme import, naming, or CKT scoring changes.

## Keymap link colors

- Treat `tools/keymap_link_colors.js` as the source of truth for moved-initial link colors; regenerate or check the ignored R11 HTML with `tools/sync_keymap_link_colors.js`, and preserve the universal per-key OKLab chain constraint documented in `docs/keymap-link-colors.md`.
