# Folded sticker verification

Verified on October 16, 2026 in headless Google Chrome:

- Placement on Blue and Obsidian; sticker follows the card tilt.
- Size and rotation rebuild the sheet without duplicate meshes.
- Folds adjustment changes the actual vertex positions.
- A sticker centered on the Obsidian chip spans its surrounding card surface. Twenty-five sampled points were checked against the original geometry; the smallest measured clearance was approximately 0.00101 in the model's units, with no intersection at the sampled points.
- Separate placements survive switching between cards.
- Mouse dragging repositions the existing sheet without adding a new sticker. Clicking an older sticker selects it; size adjustments leave the other sticker unchanged. Picking ignores transparent cutout pixels.
- Imported WebP artwork, undo, clear, and mobile width checks pass.
- No new browser application errors or failed application assets were observed.

The Blue GLB produces three `Mesh is missing primitive index association` console messages in model-viewer 4.1.0. A separate baseline check with all sticker JavaScript disabled reproduces exactly those three messages. The card renders and the tested interactions work; this existing viewer/model warning is excluded from the new-error check.

Surface sampling uses a 128 × 128 height field and a 64 × 64 subdivided sheet. It covers the card's separate meshes rather than only the mesh clicked. Clearance and the conservative surface envelope prevent the tested raised geometry from punching through. Very fine geometry below the sampling resolution may require higher resolution.
