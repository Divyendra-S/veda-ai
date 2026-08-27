"use client";

import { useCallback, useSyncExternalStore } from "react";

export const SIDEBAR_KEY = "veda:sidebar";

/**
 * Inlined into <head> so the attribute is on <html> before the first paint.
 * Without this the sidebar renders expanded and then snaps to the rail.
 */
export const SIDEBAR_INIT_SCRIPT = `(function(){try{var v=localStorage.getItem(${JSON.stringify(
  SIDEBAR_KEY,
)});document.documentElement.dataset.sidebar=v==="collapsed"?"collapsed":"expanded"}catch(e){document.documentElement.dataset.sidebar="expanded"}})()`;

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

function getSnapshot() {
  return document.documentElement.dataset.sidebar === "collapsed";
}

/** The server has no localStorage, so it always renders the expanded state. */
function getServerSnapshot() {
  return false;
}

/**
 * The *visual* state lives in the `data-sidebar` attribute on <html> and is
 * styled through the `rail:` / `wide:` variants, so React never renders two
 * different trees and there is nothing to mismatch on hydration.
 *
 * This hook subscribes to that attribute purely so the toggle can report
 * `aria-expanded` honestly. useSyncExternalStore is the right primitive here
 * because the attribute genuinely is external state: an inline script writes it
 * before React exists.
 */
export function useSidebar() {
  const collapsed = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );

  const toggle = useCallback(() => {
    const value = getSnapshot() ? "expanded" : "collapsed";
    document.documentElement.dataset.sidebar = value;
    try {
      localStorage.setItem(SIDEBAR_KEY, value);
    } catch {
      // Private browsing or a blocked storage partition. The toggle still works
      // for this session; it just will not be remembered.
    }
    for (const listener of listeners) listener();
  }, []);

  return { collapsed, toggle };
}
