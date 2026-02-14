import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';

type DashboardSidebarContextValue = {
  isOverlayOpen: boolean;
  openOverlay: () => void;
  closeOverlay: () => void;
  toggleOverlay: () => void;
  isExpanded: boolean;
  toggleExpanded: () => void;
  isMobile: boolean;
};

const DashboardSidebarContext = createContext<DashboardSidebarContextValue | null>(null);

export const DashboardSidebarProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const stored = window.localStorage.getItem('dashboard-sidebar-expanded');
    return stored === null ? true : stored === 'true';
  });
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(max-width: 768px)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const handler = () => {
      setIsMobile(mq.matches);
      if (mq.matches) setIsOverlayOpen(false);
    };
    handler();
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  const openOverlay = useCallback(() => setIsOverlayOpen(true), []);
  const closeOverlay = useCallback(() => setIsOverlayOpen(false), []);
  const toggleOverlay = useCallback(() => setIsOverlayOpen((p) => !p), []);

  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      window.localStorage.setItem('dashboard-sidebar-expanded', String(next));
      return next;
    });
  }, []);

  return (
    <DashboardSidebarContext.Provider
      value={{
        isOverlayOpen,
        openOverlay,
        closeOverlay,
        toggleOverlay,
        isExpanded,
        toggleExpanded,
        isMobile,
      }}
    >
      {children}
    </DashboardSidebarContext.Provider>
  );
};

export const useDashboardSidebar = () => useContext(DashboardSidebarContext);
