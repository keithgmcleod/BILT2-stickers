# BILT card sticker viewer

Blue and Obsidian 3D cards with six surface-attached sticker designs, image import, size and rotation controls, undo, and separate placements when switching cards. Click a sticker, then click the card. Choose **Done placing** to return to pointer tilt. Refreshing resets placements. Imported images stay in the browser.

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

Three.js DecalGeometry clips sticker meshes to the hit surface. Decals are parented to the card geometry and follow its motion. This is a surface decal implementation, not the full Street Stickers foil/wrinkle/draping renderer. Geometry attachment uses an isolated bridge to the existing pinned model-viewer 4.1.0 scene; retest before upgrading.

Browser checks cover both card variants, placement, tilt, size, rotation, switching, imports, undo, clear, and mobile width. The original BILT2 repository is unchanged.

The included sticker artwork retains its original ownership and licensing. Publishing this version does not grant reuse rights to visitors.
