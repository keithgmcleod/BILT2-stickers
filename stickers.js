import * as THREE from 'three';

const viewer = document.querySelector('#obsidian-model');
const status = document.querySelector('#sticker-status');
const picker = document.querySelector('.sticker-picker');
const sizeInput = document.querySelector('#sticker-size');
const rotationInput = document.querySelector('#sticker-rotation');
const foldsInput = document.querySelector('#sticker-folds');
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
let surfaceRenderer;

function cardFrame(referenceNormal) {
  let body, area = 0, dimensions;
  for (const mesh of meshes) {
    if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
    const size = mesh.geometry.boundingBox.getSize(new THREE.Vector3()).multiply(mesh.getWorldScale(new THREE.Vector3()));
    const axes = ['x', 'y', 'z'].sort((a, b) => size[b] - size[a]);
    const candidate = size[axes[0]] * size[axes[1]];
    if (candidate > area) { area = candidate; body = mesh; dimensions = { size, axes }; }
  }
  const axis = name => new THREE.Vector3().setComponent(['x', 'y', 'z'].indexOf(name), 1);
  const normal = axis(dimensions.axes[2]).applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(body.matrixWorld)).normalize();
  if (normal.dot(referenceNormal) < 0) normal.negate();
  const right = axis(dimensions.axes[0]).transformDirection(body.matrixWorld);
  const up = normal.clone().cross(right).normalize();
  return { normal, right, up, width: dimensions.size[dimensions.axes[0]] };
}

// Render the complete card into an orthographic height field. This includes
// separate chip/logo meshes and prior stickers; sampling a single hit mesh
// would let those raised details punch through the new sheet.
function captureSurface(center, normal, up, width, height, cardWidth) {
  surfaceRenderer ||= new THREE.WebGLRenderer({ alpha: true, antialias: false });
  const resolution = 128, range = cardWidth * 0.2;
  const capture = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-width / 2, width / 2, height / 2, -height / 2, range * 0.01, range * 2);
  camera.position.copy(center).addScaledVector(normal, range);
  camera.up.copy(up); camera.lookAt(center); camera.updateMatrixWorld();
  const materials = [];
  model.traverse(object => {
    if (!object.isMesh || !object.visible) return;
    const material = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { mask: { value: object.userData.cardSticker ? object.material.map : null }, masked: { value: !!object.userData.cardSticker } },
      vertexShader: 'varying vec2 vUv; void main(){vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
      fragmentShader: `uniform sampler2D mask; uniform bool masked; varying vec2 vUv;
        void main(){
          if(masked && texture2D(mask,vUv).a < 0.04) discard;
          vec3 packed=fract(gl_FragCoord.z*vec3(1.0,255.0,65025.0));
          packed-=packed.yzz*vec3(1.0/255.0,1.0/255.0,0.0);
          gl_FragColor=vec4(packed,1.0);
        }`,
    });
    materials.push(material);
    const copy = new THREE.Mesh(object.geometry, material);
    copy.matrixAutoUpdate = false; copy.matrix.copy(object.matrixWorld); capture.add(copy);
  });
  const target = new THREE.WebGLRenderTarget(resolution, resolution, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
  const pixels = new Uint8Array(resolution * resolution * 4);
  try {
    surfaceRenderer.setRenderTarget(target); surfaceRenderer.setClearColor(0, 0);
    surfaceRenderer.clear(); surfaceRenderer.render(capture, camera);
    surfaceRenderer.readRenderTargetPixels(target, 0, 0, resolution, resolution, pixels);
  } finally {
    surfaceRenderer.setRenderTarget(null); target.dispose(); materials.forEach(material => material.dispose());
  }
  const elevations = new Float32Array(resolution * resolution);
  for (let i = 0; i < elevations.length; i++) {
    const offset = i * 4;
    const depth = pixels[offset] / 255 + pixels[offset + 1] / 65025 + pixels[offset + 2] / 16581375;
    elevations[i] = pixels[offset + 3] ? range - (camera.near + depth * (camera.far - camera.near)) : 0;
  }
  // Conservative dilation bridges tiny gaps, bevels and sampling boundaries.
  // A soft envelope lets vinyl bend over relief instead of copying every edge.
  const sample = (u, v) => {
    const cx = Math.round(u * (resolution - 1)), cy = Math.round(v * (resolution - 1));
    let elevation = -Infinity;
    for (let y = -3; y <= 3; y++) for (let x = -3; x <= 3; x++) {
      const ix = THREE.MathUtils.clamp(cx + x, 0, resolution - 1);
      const iy = THREE.MathUtils.clamp(cy + y, 0, resolution - 1);
      const distance = Math.hypot(x * width, y * height) / resolution;
      elevation = Math.max(elevation, elevations[iy * resolution + ix] - distance * 0.07);
    }
    return elevation;
  };
  return sample;
}

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
  const referenceNormal = entry.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(target.matrixWorld)).normalize();
  const frame = cardFrame(referenceNormal);
  const worldNormal = frame.normal;
  const angle = THREE.MathUtils.degToRad(entry.rotation);
  const right = frame.right.clone().multiplyScalar(Math.cos(angle)).addScaledVector(frame.up, Math.sin(angle));
  const up = frame.up.clone().multiplyScalar(Math.cos(angle)).addScaledVector(frame.right, -Math.sin(angle));
  const width = frame.width * entry.size / 100;
  const image = entry.texture.image;
  const height = width * image.height / image.width;
  const surface = captureSurface(worldPoint, worldNormal, up, width, height, frame.width);
  const geometry = new THREE.PlaneGeometry(width, height, 64, 64);
  const positions = geometry.attributes.position;
  const uvs = geometry.attributes.uv;
  const foldAmount = (entry.folds ?? 35) / 100;
  const clearance = frame.width * 0.0009;
  const lift = width * 0.026 * foldAmount;
  const point = new THREE.Vector3();
  for (let i = 0; i < positions.count; i++) {
    const u = uvs.getX(i), v = uvs.getY(i);
    const x = (u - 0.5) * width, y = (v - 0.5) * height;
    const diagonal = (u - 0.5) + 0.55 * (v - 0.5) - 0.06;
    const crease = Math.exp(-Math.pow(diagonal / 0.035, 2)) * Math.pow(Math.sin(Math.PI * v), 2);
    const secondary = Math.exp(-Math.pow(((v - 0.5) - 0.32 * (u - 0.5) + 0.15) / 0.026, 2)) * Math.pow(Math.sin(Math.PI * u), 2) * 0.45;
    const corner = Math.pow(Math.max(0, (u + v - 1.35) / 0.65), 2) * 1.6;
    const ripple = Math.pow(Math.sin((u * 2.7 + v * 1.3) * Math.PI), 2) * Math.pow(Math.abs(u - 0.5) * 2, 8) * 0.18;
    const elevation = surface(u, v) + clearance + lift * (crease + secondary + corner + ripple);
    point.copy(worldPoint).addScaledVector(right, x).addScaledVector(up, y).addScaledVector(worldNormal, elevation);
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.applyMatrix4(target.matrixWorld.clone().invert());
  geometry.computeVertexNormals(); geometry.computeBoundingSphere();
  const material = new THREE.MeshPhysicalMaterial({ map: entry.texture, transparent: true,
    side: THREE.DoubleSide, alphaTest: 0.025, roughness: 0.38, metalness: 0,
    clearcoat: 0.28, clearcoatRoughness: 0.42, depthWrite: true,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  material.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\nif (!gl_FrontFacing) diffuseColor.rgb = vec3(0.92);');
  };
  entry.decal = new THREE.Mesh(geometry, material); entry.decal.name = 'Card sticker';
  entry.decal.renderOrder = 10 + entries().indexOf(entry); entry.decal.userData.cardSticker = true;
  entry.decal.userData.noHit = true;
  entry.decal.userData.folds = entry.folds ?? 35;
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
    normal: hit.face.normal.clone(), size: Number(sizeInput.value), rotation: Number(rotationInput.value), folds: Number(foldsInput.value), decal: null };
  message('Attaching sticker…');
  try {
    entry.texture = await textureFor(design);
    if (generation !== stamp || cardKey() !== key) return;
    if (!cards.has(key)) cards.set(key, []);
    cards.get(key).push(entry); rebuild(entry);
    message(`${design.label} attached. Adjust size, rotation or folds, or click to place another.`);
  } catch (error) { console.error(error); message('Could not load this sticker. Try importing a PNG or WebP.'); }
}
viewer.addEventListener('click', place);
viewer.addEventListener('load', () => {
  generation++; ready = false;
  try {
    scene = getScene(); model = scene.model; meshes = [];
    model.traverse(object => { if (object.isMesh && !object.userData.cardSticker) meshes.push(object); });
    entries().forEach(disposeDecal);
    entries().forEach(rebuild); ready = true;
    message(activeDesign ? 'Click the card surface to attach your sticker.' : 'Pick a sticker, then click the card to attach it.');
  } catch (error) { console.error(error); message(error.message); }
});
// Detach custom geometry before model-viewer caches/clones a glTF scene. Its
// material API only knows the original glTF primitive associations.
function releaseSheets() {
  ready = false; generation++;
  for (const list of cards.values()) list.forEach(disposeDecal);
}
document.addEventListener('click', event => {
  const option = event.target.closest('[data-card-variant]');
  if (option && !option.disabled && option.getAttribute('aria-pressed') !== 'true') releaseSheets();
}, true);
new MutationObserver(releaseSheets).observe(viewer, { attributes: true, attributeFilter: ['src'] });
document.querySelector('#sticker-done').addEventListener('click', () => setDesign(null));
document.querySelector('#sticker-undo').addEventListener('click', () => {
  generation++; const entry = entries().pop(); if (entry) disposeDecal(entry);
  render(); message(entry ? 'Last sticker removed.' : 'This card has no stickers yet.');
});
document.querySelector('#sticker-clear').addEventListener('click', () => {
  generation++; entries().forEach(disposeDecal); cards.set(cardKey(), []); render(); message('Stickers cleared from this card.');
});
for (const input of [sizeInput, rotationInput, foldsInput]) input.addEventListener('input', () => {
  if (!ready) return;
  const entry = entries().at(-1); if (!entry) return;
  entry.size = Number(sizeInput.value); entry.rotation = Number(rotationInput.value); entry.folds = Number(foldsInput.value); rebuild(entry);
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
