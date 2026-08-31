import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Suspense, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';

/**
 * The 3D half of the landing hero: a slowly-turning carousel of photo tiles
 * (students, founders, people at work) orbiting a drifting point cloud. The
 * whole ring also leans toward the cursor, so moving the mouse anywhere on the
 * page parallax-tilts the scene.
 *
 * Hand-built on @react-three/fiber (no drei/Spline) and loaded through
 * React.lazy only when the hero is on screen and reduced-motion is off — see
 * HeroScene.jsx. Textures are bundled under /public/hero, so they load
 * same-origin (no CORS) and production never depends on a third-party host.
 */

const BASE = import.meta.env.BASE_URL || '/';
const IMAGES = [
  'hero/student-1.jpg',
  'hero/founder-1.jpg',
  'hero/work-1.jpg',
  'hero/student-2.jpg',
  'hero/founder-2.jpg',
  'hero/work-2.jpg',
  'hero/student-3.jpg',
  'hero/founder-3.jpg',
].map((path) => BASE + path);

/** Cursor position in -1..1, tracked at the window so it works even though the
 *  canvas itself is pointer-events:none (it sits behind the hero copy). */
function usePointer() {
  const pointer = useRef({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (event) => {
      pointer.current.x = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.current.y = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);
  return pointer;
}

function PhotoRing({ pointer }) {
  const tilt = useRef();
  const spin = useRef();
  const textures = useLoader(THREE.TextureLoader, IMAGES);

  const tiles = useMemo(() => {
    const radius = 2.9;
    return textures.map((tex, i) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 8;
      const angle = (i / textures.length) * Math.PI * 2;
      return {
        tex,
        angle,
        position: [Math.sin(angle) * radius, 0, Math.cos(angle) * radius],
      };
    });
  }, [textures]);

  useFrame((_state, delta) => {
    if (spin.current) spin.current.rotation.y += delta * 0.12;
    if (tilt.current) {
      // Ease toward the cursor instead of snapping — a spring, not a stick.
      const targetX = pointer.current.y * 0.35;
      const targetY = pointer.current.x * 0.5;
      tilt.current.rotation.x += (targetX - tilt.current.rotation.x) * 0.06;
      tilt.current.rotation.y += (targetY - tilt.current.rotation.y) * 0.06;
    }
  });

  return (
    <group ref={tilt}>
      <group ref={spin}>
        {tiles.map((tile, i) => (
          <group key={i} position={tile.position} rotation={[0, tile.angle, 0]}>
            {/* A brand-tinted backing plane reads as a thin frame behind each photo. */}
            <mesh position={[0, 0, -0.02]}>
              <planeGeometry args={[1.62, 1.62]} />
              <meshBasicMaterial color="#ffffff" />
            </mesh>
            <mesh>
              <planeGeometry args={[1.5, 1.5]} />
              <meshBasicMaterial map={tile.tex} toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          </group>
        ))}
      </group>
    </group>
  );
}

function Dust({ count = 220 }) {
  const points = useRef();
  const geometry = useMemo(() => {
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const radius = 3.4 + Math.random() * 2.2;
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
    if (points.current) points.current.rotation.y -= delta * 0.04;
  });

  return (
    <points ref={points} geometry={geometry}>
      <pointsMaterial size={0.03} color="#94a3b8" transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

export default function HeroCanvas() {
  const pointer = usePointer();
  return (
    <Canvas
      camera={{ position: [0, 0, 6.4], fov: 45 }}
      dpr={[1, 1.75]}
      gl={{ antialias: true, alpha: true, powerPreference: 'low-power' }}
      style={{ pointerEvents: 'none' }}
    >
      <Dust />
      <Suspense fallback={null}>
        <PhotoRing pointer={pointer} />
      </Suspense>
    </Canvas>
  );
}
