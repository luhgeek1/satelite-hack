'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'orbitguard-panels-v1';

export function useLocalPanels() {
  const [hidden, setHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) setHidden(JSON.parse(raw).hidden === true);
    } catch {
      setHidden(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ hidden }));
    } catch {
      /* a viewer with site data blocked simply loses the preference */
    }
  }, [hidden]);

  return {
    hidden,
    drawerOpen,
    hide: () => setHidden(true),
    show: () => setHidden(false),
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
  };
}
