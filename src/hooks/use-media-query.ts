"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Subscribes to a media query.
 *
 * `useSyncExternalStore` rather than an effect with `useState`, because the
 * viewport genuinely is external state that exists before React does. The
 * server snapshot is always `false`: there is no viewport to measure during
 * SSR, so the wide layout is the one that renders and hydrates, and a narrow
 * client corrects itself on its first commit rather than mismatching.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const list = window.matchMedia(query);
      list.addEventListener("change", onChange);
      return () => list.removeEventListener("change", onChange);
    },
    [query],
  );

  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}
