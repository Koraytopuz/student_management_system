import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const READING_MODE_KEY = 'reading_mode';

type ReadingModeContextValue = {
  readingMode: boolean;
  setReadingMode: (value: boolean | ((prev: boolean) => boolean)) => void;
};

const ReadingModeContext = createContext<ReadingModeContextValue | null>(null);

export const ReadingModeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [readingMode, setReadingModeState] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return window.localStorage.getItem(READING_MODE_KEY) === '1';
  });

  const setReadingMode = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    setReadingModeState((prev) => {
      const next = typeof value === 'function' ? value(prev) : value;
      if (typeof window !== 'undefined') {
        window.localStorage.setItem(READING_MODE_KEY, next ? '1' : '0');
      }
      return next;
    });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('reading-mode', readingMode);
  }, [readingMode]);

  return (
    <ReadingModeContext.Provider value={{ readingMode, setReadingMode }}>
      {children}
    </ReadingModeContext.Provider>
  );
};

export function useReadingMode(): ReadingModeContextValue {
  const ctx = useContext(ReadingModeContext);
  if (!ctx) {
    return {
      readingMode: false,
      setReadingMode: () => {},
    };
  }
  return ctx;
}
