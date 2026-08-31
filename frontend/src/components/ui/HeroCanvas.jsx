import { Canvas, useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * The 3D half of the landing hero.
 *
 * Deliberately hand-built on @react-three/fiber rather than pulling in `drei`
 * or Spline: three.js is already ~600 kB and this file is the only reason it is
 * in the bundle, so it is loaded through `React.lazy` and rendered only when the
 * hero is on screen and the visitor has not asked for reduced motion. See
 * HeroScene.jsx for that gate.
 *
 * Two objects: a slowly-turning wireframe icosahedron (the "aggregation" motif)
 * and a field of points drifting around it.
 */

function Knot() {
  const mesh = useRef();
  useFrame((state, delta) => {
    if (!mesh.current) return;
    mesh.current.rotation.y += delta * 0.16;
    mesh.current.rotation.x += delta * 0.06;
    // A gentle bob keeps it from reading as a static screenshot.
    mesh.current.position.y = Math.sin(state.clock.elapsedTime * 0.5) * 0.12;
  });

  return (
    <group ref={mesh}>
      <mesh>
        <icosahedronGeometry args={[1.35, 1]} />
        <meshBasicMaterial color="#b91c2c" wireframe transparent opacity={0.55} />
      </mesh>
      <mesh scale={0.72}>
        <icosahedronGeometry args={[1.35, 0]} />
        <meshBasicMaterial color="#0ea5e9" wireframe transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

function Dust({ count = 260 }) {
  const points = useRef();

  // Positions are computed once; the whole cloud is animated by rotating the
  // parent, which costs nothing per frame.
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 2.1 + Math.random() * 1.9;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      positions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = radius * Math.cos(phi) * 0.6;
      positions[i * 3 + 2] = radius * Math.sin(phi) * Math.sin(theta);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count]);

  useFrame((_state, delta) => {
    if (points.current) points.current.rotation.y -= delta * 0.05;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial size={0.035} color="#94a3b8" transparent opacity={0.85} sizeAttenuation />
    </points>
  );
}

export default function HeroCanvas() {
  return (
    <Canvas
      camera={{ position: [0, 0, 5.2], fov: 45 }}
      // `demand` would freeze the animation; capped DPR keeps a retina screen
      // from rendering four times the pixels for a decorative background.
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ pointerEvents: 'none' }}
    >
      <Knot />
      <Dust />
    </Canvas>
  );
}
