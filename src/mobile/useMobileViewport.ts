import { useSyncExternalStore } from 'react';

export const MOBILE_QUERY = '(max-width: 767px)';
const subscribe = (notify: () => void) => {
  const query = window.matchMedia(MOBILE_QUERY);
  query.addEventListener('change', notify);
  return () => query.removeEventListener('change', notify);
};
export const useMobileViewport = () => useSyncExternalStore(subscribe,
  () => window.matchMedia(MOBILE_QUERY).matches, () => false);
