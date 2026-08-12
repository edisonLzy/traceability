# Traceability app icon

The desktop icon represents Traceability's core loop: several evidence points follow one continuous trace and converge on a target. The mark avoids text and third-party logos so it remains recognizable at Dock, taskbar, installer, and file-explorer sizes.

## Visual system

- Base: deep navy (`#111329`) rounded square
- Trace: indigo (`#5B67D4`) to periwinkle (`#8F9CFF`)
- Form: three evidence nodes connected to a focused target
- Source asset: `app/resources/icon.png`, 1024×1024 RGBA with a transparent exterior

The icon intentionally uses the same navy/indigo family as the desktop UI while providing enough highlight contrast for small sizes and dark system chrome.

## Packaging

`app/electron-builder.yml` references the PNG globally and for both `mac` and `win`. electron-builder derives macOS and Windows icon resources during packaging.

When replacing the source asset:

1. keep the canvas square and at least 1024×1024;
2. preserve transparent pixels outside the rounded tile;
3. leave enough outer margin for macOS masks and Windows small-icon rasterization;
4. run a macOS unpacked packaging smoke test and inspect the generated `.icns`;
5. let the `master` release workflow verify both native installers.
