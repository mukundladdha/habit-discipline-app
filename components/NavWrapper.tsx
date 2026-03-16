'use client';

import { useState, useEffect } from 'react';
import BottomNav from './BottomNav';

/**
 * Reads onboardingComplete from localStorage synchronously on first render
 * to avoid a flash. Listens for the custom 'onboardingComplete' event so it
 * shows the nav immediately when onboarding finishes — no prop drilling needed.
 */
export default function NavWrapper() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    setShow(!!localStorage.getItem('onboardingComplete'));
  }, []);

  useEffect(() => {
    const handler = () => setShow(true);
    window.addEventListener('onboardingComplete', handler);
    return () => window.removeEventListener('onboardingComplete', handler);
  }, []);

  return show ? <BottomNav /> : null;
}
