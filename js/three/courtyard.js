// The setting: a sunny school courtyard (concrete, stucco building, blue sky)
// with the dark-purple perforated picnic tables.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { concreteTexture, stuccoTexture } from './textures.js';
import { createPicnicTable } from './props.js';

/**
 * opts: { floorY, sunElevationDeg, sunAzimuthDeg, tables: [{ x, z, rotDeg }] (game coords),
 *         shadowCenter: [x, z] (game coords), shadowSize }
 */
export function buildCourtyard(stage, opts = {}) {
  const { scene, renderer } = stage;
  const floorY = opts.floorY ?? -1.15;
  const elev = THREE.MathUtils.degToRad(opts.sunElevationDeg ?? 52);
  const azim = THREE.MathUtils.degToRad(opts.sunAzimuthDeg ?? 145);
  const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, azim);

  // sky
  const makeSky = () => {
    const sky = new Sky();
    sky.scale.setScalar(2000);
    const u = sky.material.uniforms;
    u.turbidity.value = 3.5;
    u.rayleigh.value = 1.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    u.sunPosition.value.copy(sunDir);
    return sky;
  };
  scene.add(makeSky());

  // image-based lighting from the same sky (realistic reflections/ambient)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(makeSky());
  const ground = new THREE.Mesh(new THREE.CircleGeometry(500, 32), new THREE.MeshBasicMaterial({ color: 0x9c9384 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -1;
  envScene.add(ground);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture;
  scene.environmentIntensity = 0.45;
  pmrem.dispose();

  // sun + fill
  const sun = new THREE.DirectionalLight(0xfff1dc, 1.9);
  const [scx, scz] = opts.shadowCenter ?? [0, 5];
  const target = new THREE.Object3D();
  target.position.set(scx, floorY, -scz);
  scene.add(target);
  sun.target = target;
  sun.position.copy(target.position).addScaledVector(sunDir, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const ss = opts.shadowSize ?? 9;
  Object.assign(sun.shadow.camera, { left: -ss, right: ss, top: ss, bottom: -ss, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x8c7f6c, 0.3));

  // concrete
  const floorSize = 160;
  const concrete = new THREE.Mesh(
    new THREE.PlaneGeometry(floorSize, floorSize),
    new THREE.MeshStandardMaterial({ map: concreteTexture([floorSize / 3, floorSize / 3]), roughness: 0.93, metalness: 0 }),
  );
  concrete.rotation.x = -Math.PI / 2;
  concrete.position.y = floorY;
  concrete.receiveShadow = true;
  scene.add(concrete);

  // the school building across the courtyard
  const bz = -(opts.buildingZ ?? 24);
  const stucco = new THREE.MeshStandardMaterial({ map: stuccoTexture([10, 2]), roughness: 0.95 });
  const wall = new THREE.Mesh(new THREE.BoxGeometry(70, 4.6, 1), stucco);
  wall.position.set(0, floorY + 2.3, bz);
  wall.receiveShadow = true;
  scene.add(wall);
  const trim = new THREE.MeshStandardMaterial({ color: 0x4b3a6b, roughness: 0.7 }); // school purple trim
  const band = new THREE.Mesh(new THREE.BoxGeometry(70, 0.45, 1.3), trim);
  band.position.set(0, floorY + 4.6, bz + 0.1);
  scene.add(band);
  const canopy = new THREE.Mesh(new THREE.BoxGeometry(70, 0.25, 3.2), new THREE.MeshStandardMaterial({ color: 0xe8e2d6, roughness: 0.8 }));
  canopy.position.set(0, floorY + 3.3, bz + 2.1);
  canopy.castShadow = true;
  canopy.receiveShadow = true;
  scene.add(canopy);
  const postMat = new THREE.MeshStandardMaterial({ color: 0x4b3a6b, roughness: 0.6, metalness: 0.3 });
  for (let x = -32; x <= 32; x += 4) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 3.3, 12), postMat);
    post.position.set(x, floorY + 1.65, bz + 3.5);
    post.castShadow = true;
    scene.add(post);
  }
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x1d2a36, roughness: 0.06, metalness: 0.1, envMapIntensity: 1.4 });
  const frameMat = new THREE.MeshStandardMaterial({ color: 0x2b2b30, roughness: 0.5, metalness: 0.4 });
  for (let x = -30; x <= 30; x += 4) {
    const isDoor = x % 12 === 2;
    const w = isDoor ? 1.8 : 2.4, h = isDoor ? 2.3 : 1.4, y = isDoor ? floorY + 1.15 : floorY + 1.9;
    const win = new THREE.Mesh(new THREE.PlaneGeometry(w, h), glass);
    win.position.set(x, y, bz + 0.51);
    scene.add(win);
    const fr = new THREE.Mesh(new THREE.BoxGeometry(w + 0.12, h + 0.12, 0.05), frameMat);
    fr.position.set(x, y, bz + 0.49);
    scene.add(fr);

  }

  // other picnic tables around the courtyard
  for (const t of opts.tables ?? []) {
    const table = createPicnicTable();
    table.position.set(t.x, floorY, -t.z);
    table.rotation.y = THREE.MathUtils.degToRad(t.rotDeg ?? 0);
    scene.add(table);
  }

  scene.fog = new THREE.Fog(0xdfe6ee, 30, 140);
  return { sun, sunDir };
}
