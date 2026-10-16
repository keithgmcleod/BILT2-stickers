import * as THREE from 'three';
import { DecalGeometry } from 'https://cdn.jsdelivr.net/npm/three@0.174.0/examples/jsm/geometries/DecalGeometry.js';

const viewer = document.querySelector('#obsidian-model');
const status = document.querySelector('#sticker-status');
const picker = document.querySelector('.sticker-picker');
const sizeInput = document.querySelector('#sticker-size');
const rotationInput = document.querySelector('#sticker-rotation');
const assets = [
  ['v-ring-seal-bilt-neighborhood', 'Bilt neighborhood'],
  ['v-diecut-rent-day', 'Rent day'],
  ['v-badge-have-a-good-rent-day', 'Have a good rent day'],
  ['v-diecut-home', 'Home'],
  ['v-shield-bilt-10x', 'Bilt 10x'],
  ['v-hello-soho', 'Hello Soho'],
];
const designs = assets.map(([slug, label]) => ({ url: `./stickers/${slug}.webp`, label }));
const loader = new THREE.TextureLoader();
const textureCache = new Map();
const cards = new Map();
let scene, model, meshes = [], activeDesign = null, ready = false, generation = 0;

// Geometry attachment bridge for the pinned model-viewer 4.1.0. Keep isolated:
// the public materials API cannot add decal meshes. Fail visibly on API changes.
function getScene() {
  const symbol = Object.getOwnPropertySymbols(viewer).find(key => key.description === 'scene');
  const result = symbol && viewer[symbol];
  if (!result?.model || !result?.camera || typeof result.queueRender !== 'function') {
    throw new Error('Sticker attachment is unavailable with this viewer version.');
  }
  return result;
}
const cardKey = () => viewer.getAttribute('src');
const entries = () => cards.get(cardKey()) || [];
function message(text) { status.textContent = text; }
function render() { scene?.queueRender(); }
function setDesign(design) {
  activeDesign = design;
  viewer.classList.toggle('placing-sticker', !!design);
  picker.querySelectorAll('button').forEach((button, i) => button.setAttribute('aria-pressed', String(designs[i] === design)));
  message(design ? `${design.label} selected. Click the card surface to place it.` : 'Move your pointer to tilt the card.');
}
function addButton(design) {
  const button = document.createElement('button');
  button.type = 'button'; button.title = design.label;
  button.setAttribute('aria-label', design.label); button.setAttribute('aria-pressed', 'false');
  const image = document.createElement('img'); image.src = design.url; image.alt = '';
  button.append(image);
  button.addEventListener('click', () => setDesign(design)); picker.append(button);
}
designs.forEach(addButton);
function textureFor(design) {
  if (!textureCache.has(design.url)) {
    textureCache.set(design.url, loader.loadAsync(design.url).then(texture => {
      texture.colorSpace = THREE.SRGBColorSpace; texture.anisotropy = 8; return texture;
    }).catch(error => { textureCache.delete(design.url); throw error; }));
  }
  return textureCache.get(design.url);
}
function disposeDecal(entry) {
  entry.decal?.removeFromParent(); entry.decal?.geometry.dispose();
  entry.decal?.material.dispose(); entry.decal = null;
}
function rebuild(entry) {
  disposeDecal(entry);
  const target = meshes[entry.meshIndex];
  if (!target) return;
  model.updateWorldMatrix(true, true);
  const worldPoint = target.localToWorld(entry.point.clone());
  const worldNormal = entry.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(target.matrixWorld)).normalize();
  const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), worldNormal);
  orientation.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), THREE.MathUtils.degToRad(entry.rotation)));
  if (!target.geometry.boundingBox) target.geometry.computeBoundingBox();
  const dimensions = target.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(target.getWorldScale(new THREE.Vector3()));
  const width = Math.max(dimensions.x, dimensions.y, dimensions.z) * entry.size / 100;
  const image = entry.texture.image;
  // Shallow projection clips the decal to the hit surface, not the reverse face.
  const geometry = new DecalGeometry(target, worldPoint, new THREE.Euler().setFromQuaternion(orientation), new THREE.Vector3(width, width * image.height / image.width, width * 0.035));
  geometry.applyMatrix4(target.matrixWorld.clone().invert());
  const material = new THREE.MeshStandardMaterial({ map: entry.texture, transparent: true,
    alphaTest: 0.025, roughness: 0.42, metalness: 0, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  entry.decal = new THREE.Mesh(geometry, material); entry.decal.name = 'Card sticker';
  entry.decal.renderOrder = 10 + entries().indexOf(entry); entry.decal.userData.cardSticker = true;
  target.add(entry.decal); render();
}
async function place(event) {
  if (!ready || !activeDesign) return;
  const rect = viewer.getBoundingClientRect();
  const ray = new THREE.Raycaster(); model.updateWorldMatrix(true, true);
  ray.setFromCamera(new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2), scene.camera);
  const hit = ray.intersectObjects(meshes, false).find(result => result.face);
  if (!hit) { message('Click directly on the card to attach a sticker.'); return; }
  const stamp = generation, key = cardKey(), design = activeDesign;
  const entry = { meshIndex: meshes.indexOf(hit.object), point: hit.object.worldToLocal(hit.point.clone()),
    normal: hit.face.normal.clone(), size: Number(sizeInput.value), rotation: Number(rotationInput.value), decal: null };
  message('Attaching sticker…');
  try {
    entry.texture = await textureFor(design);
    if (generation !== stamp || cardKey() !== key) return;
    if (!cards.has(key)) cards.set(key, []);
    cards.get(key).push(entry); rebuild(entry);
    message(`${design.label} attached. Adjust size or rotation, or click to place another.`);
  } catch (error) { console.error(error); message('Could not load this sticker. Try importing a PNG or WebP.'); }
}
viewer.addEventListener('click', place);
viewer.addEventListener('load', () => {
  generation++; ready = false;
  try {
    scene = getScene(); model = scene.model; meshes = [];
    model.traverse(object => { if (object.isMesh && !object.userData.cardSticker) meshes.push(object); });
    entries().forEach(rebuild); ready = true;
    message(activeDesign ? 'Click the card surface to attach your sticker.' : 'Pick a sticker, then click the card to attach it.');
  } catch (error) { console.error(error); message(error.message); }
});
new MutationObserver(() => { ready = false; generation++; }).observe(viewer, { attributes: true, attributeFilter: ['src'] });
document.querySelector('#sticker-done').addEventListener('click', () => setDesign(null));
document.querySelector('#sticker-undo').addEventListener('click', () => {
  generation++; const entry = entries().pop(); if (entry) disposeDecal(entry);
  render(); message(entry ? 'Last sticker removed.' : 'This card has no stickers yet.');
});
document.querySelector('#sticker-clear').addEventListener('click', () => {
  generation++; entries().forEach(disposeDecal); cards.set(cardKey(), []); render(); message('Stickers cleared from this card.');
});
for (const input of [sizeInput, rotationInput]) input.addEventListener('input', () => {
  if (!ready) return;
  const entry = entries().at(-1); if (!entry) return;
  entry.size = Number(sizeInput.value); entry.rotation = Number(rotationInput.value); rebuild(entry);
});
document.querySelector('#sticker-file').addEventListener('change', async event => {
  const file = event.target.files[0]; if (!file) return;
  if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    message('Choose a PNG, WebP, or JPEG image under 20 MB.'); return;
  }
  const url = URL.createObjectURL(file), design = { url, label: file.name };
  try { await textureFor(design); designs.push(design); addButton(design); setDesign(design); }
  catch { URL.revokeObjectURL(url); message('This image could not be opened.'); }
  event.target.value = '';
});
