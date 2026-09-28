'use client';

import { createContext, useContext, useState, ReactNode, useCallback } from 'react';

type PanelType = 'booking' | 'events' | 'cookie' | null;

const FloatingPanelContext = createContext<{
  activePanel: PanelType;
  setActivePanel: (panel: PanelType) => void;
  panelTimestamps: Partial<Record<Exclude<PanelType, null>, number>>;
  setPanelTimestamp: (panel: PanelType) => void;
}>({
  activePanel: null,
  setActivePanel: () => {},
  panelTimestamps: {},
  setPanelTimestamp: () => {},
});

export function useFloatingPanels() {
  return useContext(FloatingPanelContext);
}

export function FloatingPanelProvider({ children }: { children: ReactNode }) {
  const [activePanel, setActivePanel] = useState<PanelType>(null);
  const [panelTimestamps, setPanelTimestamps] = useState<Partial<Record<Exclude<PanelType, null>, number>>>({});

  const setPanelTimestamp = useCallback((panel: PanelType) => {
    if (panel) setPanelTimestamps(prev => ({ ...prev, [panel]: Date.now() }));
  }, []);

  return (
    <FloatingPanelContext.Provider value={{ activePanel, setActivePanel, panelTimestamps, setPanelTimestamp }}>
      {children}
    </FloatingPanelContext.Provider>
  );
}