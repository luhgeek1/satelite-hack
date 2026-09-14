'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'orbitguard-panels-v1';

export function useLocalPanels() {
  const [hidden, setHidden] = useState(false);
  const [healthHidden, setHealthHidden] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      setHidden(saved.hidden === true);
      setHealthHidden(saved.healthHidden === true);
    } catch {
      setHidden(false);
      setHealthHidden(false);
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ hidden, healthHidden }));
    } catch {

    }
  }, [hidden, healthHidden]);

  return {
    hidden,
    healthHidden,
    drawerOpen,
    hide: () => setHidden(true),
    show: () => setHidden(false),
    hideHealth: () => setHealthHidden(true),
    showHealth: () => setHealthHidden(false),
    openDrawer: () => setDrawerOpen(true),
    closeDrawer: () => setDrawerOpen(false),
  };
}
