import { useCallback, useState } from 'react';

type AsyncState<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
};

export function useApiState<T>(initialData: T | null = null) {
  const [state, setState] = useState<AsyncState<T>>({
    data: initialData,
    loading: false,
    error: null,
  });

  const run = useCallback(async (fn: () => Promise<T>) => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const data = await fn();
      setState({ data, loading: false, error: null });
      return data;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.';
      setState((prev) => ({ ...prev, loading: false, error: message }));
      throw err;
    }
  }, []);

  return {
    ...state,
    setData: (data: T | null) => setState((prev) => ({ ...prev, data })),
    setError: (error: string | null) => setState((prev) => ({ ...prev, error })),
    run,
  };
}
