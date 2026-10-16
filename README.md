# BILT card sticker viewer

Blue and Obsidian 3D cards with six surface-attached sticker designs, image import, size, rotation and folds controls, undo, and separate placements when switching cards. Stickers bridge raised lettering and chip geometry as flexible vinyl sheets, with creases and lifted edges. Pick a design, then click an empty card area to add it. Click and drag any existing sticker to reposition it; its grabbed point stays under the pointer. Drag past any card edge to fold the overhang around the side and onto the back. Drag back onto the face to unfold it. Movement is limited so some of the sheet stays attached. The controls adjust the selected sticker, including older stickers. Dragging pauses card tilt and reshapes the sheet over its new surface. Choose **Done placing** to return to pointer tilt. Refreshing resets placements. Imported images stay in the browser.

## Publish

Set **Settings → Pages → Source → GitHub Actions** once. The **Publish sticker viewer** workflow builds and deploys the website on every push to `main`; it can also be run manually from Actions.

Expected URL: https://keithgmcleod.github.io/BILT2-stickers/

## Local preview

Use Python 3.12 or newer:

```sh
python scripts/build_site.py
python -m http.server 8000 --directory _site
```

Open http://localhost:8000. No npm installation is needed. The build downloads the public model files from the pinned BILT2 commit `888c107f91eed8b635882032377b3a39eaa8c7a0`, verifies their Git blob hashes, selects the dedicated Blue model scene, and generates the lighting environment. The deployed site includes those model files and does not load them from the original BILT2 website.

## Implementation and validation

An orthographic height pass captures the whole card, including separate chip and logo meshes and previous stickers. A subdivided sheet bridges the captured surface, with clearance, deterministic folds and a lifted corner. A rounded rectangular boundary and the card's measured thickness map overhang through a semicircular bend onto the back, with an additional back-surface height pass. Texture coordinates stay on the sheet, and the material has a vinyl finish with a white reverse side. Ray picking rejects sticker faces hidden behind the card. Sheets are parented to the card geometry and follow its motion. This is a geometric approximation for these card models, not the full Street Stickers foil/draping or cloth-simulation renderer. Geometry attachment uses an isolated bridge to the existing pinned model-viewer 4.1.0 scene; retest before upgrading. The height pass uses a separate offscreen WebGL context.

Browser checks cover both card variants, placement, tilt, size, rotation, switching, imports, undo, clear, and mobile width. The original BILT2 repository is unchanged.

The included sticker artwork retains its original ownership and licensing. Publishing this version does not grant reuse rights to visitors.
