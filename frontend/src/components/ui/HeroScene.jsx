import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { useReducedMotion } from 'framer-motion';

/**
 * Gate in front of the three.js hero.
 *
 * three.js is by far the heaviest thing this app can load, and it is purely
 * decorative, so it is only fetched when *all* of these hold:
 *
 *   1. the visitor has not set `prefers-reduced-motion`,
 *   2. the container has actually scrolled into view, and
 *   3. WebGL is available at all.
 *
 * Otherwise the static gradient below stands in — the landing page never waits
 * on a 3D scene to become readable.
 */
const HeroCanvas = lazy(() => import('./HeroCanvas.jsx'));

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(window.WebGLRenderingContext && canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

function StaticFallback() {
  return (
    <div
      aria-hidden
      className="h-full w-full rounded-full bg-[radial-gradient(circle_at_35%_30%,rgba(239,61,79,0.35),transparent_60%),radial-gradient(circle_at_70%_65%,rgba(14,165,233,0.30),transparent_60%)] blur-[2px]"
    />
  );
}

export function HeroScene({ className = '' }) {
  const still = useReducedMotion();
  const holder = useRef(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (still || !holder.current || !webglAvailable()) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      setShow(true);
      return undefined;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShow(true);
          observer.disconnect();
        }
      },
      { rootMargin: '120px' },
    );
    observer.observe(holder.current);
    return () => observer.disconnect();
  }, [still]);

  return (
    <div ref={holder} aria-hidden className={className}>
      {show ? (
        <Suspense fallback={<StaticFallback />}>
          <HeroCanvas />
        </Suspense>
      ) : (
        <StaticFallback />
      )}
    </div>
  );
}
