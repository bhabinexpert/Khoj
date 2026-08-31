import { useEffect, useState } from 'react';

/**
 * Subscribe a component to a store created by `createLocalStore`.
 * `useSyncExternalStore` would also work; this keeps the React 18 baseline
 * explicit and readable.
 */
export function useStore(store) {
  const [value, setValue] = useState(store.get);

  useEffect(() => {
    setValue(store.get());
    return store.subscribe(setValue);
  }, [store]);

  return [value, store.set];
}
