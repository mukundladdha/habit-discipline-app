'use client';

/**
 * SplashWrapper.tsx
 *
 * Session-gates the SplashScreen: shows it once per browser session
 * (sessionStorage key 'splashShown'). After the animation completes,
 * or on subsequent navigations within the same tab, renders nothing.
 *
 * Lazy-imports SplashScreen so it never blocks the initial HTML parse.
 */

import { useState, useEffect, lazy, Suspense } from 'react';

const SplashScreen = lazy(() => import('./SplashScreen'));

export default function SplashWrapper() {
  // null = undetermined (SSR + first paint), true = show, false = hide
  const [show, setShow] = useState<boolean | null>(null);

  useEffect(() => {
    const already = sessionStorage.getItem('splashShown');
    if (already) {
      setShow(false);
    } else {
      sessionStorage.setItem('splashShown', '1');
      setShow(true);
    }
  }, []);

  if (!show) return null;

  return (
    <Suspense fallback={null}>
      <SplashScreen onHide={() => setShow(false)} />
    </Suspense>
  );
}
