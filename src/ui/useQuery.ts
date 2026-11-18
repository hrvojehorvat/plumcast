import { useEffect, useRef, useState } from 'react';

/**
 * Loads async data for `key`. Returns undefined until the result for the current key is in
 * (a new key never shows the old key's data). `refresh` re-runs the load but keeps showing
 * the current value meanwhile, so lists don't flash empty or lose remote focus.
 * A null key means "nothing to load" (returns undefined).
 */
export function useQuery<T>(key: string | null, load: () => Promise<T>, refresh: unknown = 0): T | undefined {
  const [state, setState] = useState<{ key: string; value: T } | null>(null);
  const loader = useRef(load);
  useEffect(() => {
    loader.current = load;
  });
  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    loader.current().then(
      (value) => !cancelled && setState({ key, value }),
      () => undefined,
    );
    return () => {
      cancelled = true;
    };
  }, [key, refresh]);
  return key !== null && state?.key === key ? state.value : undefined;
}

/** Keeps a callback's latest version in a ref, for listeners registered once. */
export function useLatest<T>(value: T) {
  const ref = useRef(value);
  useEffect(() => {
    ref.current = value;
  });
  return ref;
}
