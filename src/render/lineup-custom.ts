// Stylised lineup models supplied by Ammar (pickup and coupe), used for those two slots.
// Front at -Z, ground at y = 0, same convention as the other parked vehicles in stage.ts.
import * as THREE from 'three';

const glassMat = new THREE.MeshPhysicalMaterial({
  color: new THREE.Color().setRGB(0.0018, 0.0024, 0.0033, THREE.LinearSRGBColorSpace),
  metalness: 0.5,
  roughness: 0.05,
  clearcoat: 1.0,
  clearcoatRoughness: 0.0,
});

const drlMat = new THREE.MeshStandardMaterial({
  color: 0x000000,
  emissive: new THREE.Color().setRGB(0.823, 0.905, 1.0, THREE.LinearSRGBColorSpace),
  emissiveIntensity: 5.0,
  roughness: 1.0,
});

const tireMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.0018, 0.0018, 0.0018, THREE.LinearSRGBColorSpace),
  roughness: 0.9,
  metalness: 0.0,
});

const darkRimMat = new THREE.MeshStandardMaterial({
  color: new THREE.Color().setRGB(0.023, 0.026, 0.033, THREE.LinearSRGBColorSpace),
  metalness: 0.8,
  roughness: 0.3,
});

function addWheel(parent: THREE.Group, x: number, y: number, z: number, radius: number, width: number, rimMat: THREE.Material) {
  const wheelGroup = new THREE.Group();
  wheelGroup.position.set(x, y, z);
  const tire = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, width, 24), tireMat);
  tire.rotation.z = Math.PI / 2;
  tire.castShadow = true;
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.65, radius * 0.65, width + 0.01, 24), rimMat);
  rim.rotation.z = Math.PI / 2;
  wheelGroup.add(tire, rim);
  parent.add(wheelGroup);
}

/** Low-poly wedge pickup with a brushed raw-metal finish that catches the stage lights. */
export function buildPickup(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'pickup';

  const brushedAlloyMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.65, 0.68, 0.72, THREE.LinearSRGBColorSpace),
    metalness: 0.85,
    roughness: 0.28,
    clearcoat: 0.25,
    clearcoatRoughness: 0.2,
    flatShading: true,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(0.0037, 0.004, 0.0052, THREE.LinearSRGBColorSpace),
    metalness: 0.4,
    roughness: 0.6,
  });

  const halfW = 1.02;
  // prettier-ignore
  const vertices = new Float32Array([
    -halfW, 0.42, -2.80,          halfW, 0.42, -2.80,        // 0,1 front lower valance
    -halfW, 1.18, -2.82,          halfW, 1.18, -2.82,        // 2,3 front hood crease
    -halfW * 0.88, 1.95, -0.35,   halfW * 0.88, 1.95, -0.35, // 4,5 cabin apex ridge
    -halfW * 0.94, 1.38,  2.78,   halfW * 0.94, 1.38,  2.78, // 6,7 rear deck edge
    -halfW, 0.46,  2.80,          halfW, 0.46,  2.80,        // 8,9 rear lower bumper
  ]);
  // prettier-ignore
  const indices = [
    0, 1, 3,  0, 3, 2,
    2, 3, 5,  2, 5, 4,
    4, 5, 7,  4, 7, 6,
    6, 7, 9,  6, 9, 8,
    8, 9, 1,  8, 1, 0,
    0, 2, 4,  0, 4, 6,  0, 6, 8,
    1, 5, 3,  1, 7, 5,  1, 9, 7,
  ];
  const bodyGeo = new THREE.BufferGeometry();
  bodyGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  bodyGeo.setIndex(indices);
  bodyGeo.computeVertexNormals();
  const bodyMesh = new THREE.Mesh(bodyGeo, brushedAlloyMat);
  bodyMesh.castShadow = true;
  bodyMesh.receiveShadow = true;
  group.add(bodyMesh);

  const canopy = new THREE.Mesh(new THREE.BoxGeometry(1.78, 0.45, 2.2), glassMat);
  canopy.position.set(0, 1.58, -0.55);
  canopy.rotation.x = 0.18;
  group.add(canopy);

  const skirt = new THREE.Mesh(new THREE.BoxGeometry(2.06, 0.12, 5.5), trimMat);
  skirt.position.set(0, 0.44, 0);
  group.add(skirt);

  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.045, 0.04), drlMat);
  lightBar.position.set(0, 1.18, -2.825);
  group.add(lightBar);

  addWheel(group, -0.93, 0.44, -1.8, 0.44, 0.3, darkRimMat);
  addWheel(group, 0.93, 0.44, -1.8, 0.44, 0.3, darkRimMat);
  addWheel(group, -0.93, 0.44, 1.85, 0.44, 0.3, darkRimMat);
  addWheel(group, 0.93, 0.44, 1.85, 0.44, 0.3, darkRimMat);
  return group;
}

/** Compact fastback coupe in champagne with cream-gold disc wheels. */
export function buildCoupe(): THREE.Group {
  const group = new THREE.Group();
  group.name = 'coupe';

  const champagneMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color().setRGB(0.55, 0.4, 0.18, THREE.LinearSRGBColorSpace),
    metalness: 0.75,
    roughness: 0.24,
    clearcoat: 1.0,
    clearcoatRoughness: 0.1,
  });
  const aeroDiscRimMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color().setRGB(0.76, 0.64, 0.42, THREE.LinearSRGBColorSpace),
    metalness: 0.65,
    roughness: 0.25,
  });

  const lowerBody = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), champagneMat);
  lowerBody.scale.set(0.96, 0.32, 2.22);
  lowerBody.position.set(0, 0.6, 0);
  lowerBody.castShadow = true;
  lowerBody.receiveShadow = true;
  const cabin = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), glassMat);
  cabin.scale.set(0.8, 0.28, 1.25);
  cabin.position.set(0, 1.05, 0.08);
  const roof = new THREE.Mesh(new THREE.SphereGeometry(1, 36, 24), champagneMat);
  roof.scale.set(0.76, 0.04, 1.05);
  roof.position.set(0, 1.3, 0.1);
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.035, 0.03), drlMat);
  lightBar.position.set(0, 0.72, -2.2);
  group.add(lowerBody, cabin, roof, lightBar);

  addWheel(group, -0.9, 0.36, -1.38, 0.36, 0.24, aeroDiscRimMat);
  addWheel(group, 0.9, 0.36, -1.38, 0.36, 0.24, aeroDiscRimMat);
  addWheel(group, -0.9, 0.36, 1.38, 0.36, 0.24, aeroDiscRimMat);
  addWheel(group, 0.9, 0.36, 1.38, 0.36, 0.24, aeroDiscRimMat);
  return group;
}
