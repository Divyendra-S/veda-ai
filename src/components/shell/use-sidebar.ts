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
 * Sets the visual state directly.
 *
 * `persist: false` is the interesting case and the one the review screen uses:
 * the design's own frames show the sidebar expanded while uploading and at the
 * rail from the moment Start Mapping is pressed, because from there on the two
 * panes need the 304px more than the nav needs its labels. That is a property
 * of the screen, not a preference — so it moves the attribute without touching
 * what the teacher last chose, and their choice comes back on the next load of
 * a screen that has room for it.
 */
export function setSidebar(collapsed: boolean, { persist = true } = {}) {
  const value = collapsed ? "collapsed" : "expanded";
  if (document.documentElement.dataset.sidebar === value) return;
  document.documentElement.dataset.sidebar = value;
  if (persist) {
    try {
      localStorage.setItem(SIDEBAR_KEY, value);
    } catch {
      // Private browsing or a blocked storage partition. The toggle still works
      // for this session; it just will not be remembered.
    }
  }
  for (const listener of listeners) listener();
}

/**
 * The *visual* state lives in the `data-sidebar` attribute on <html> and is
 * styled through the `rail:` variant, so React never renders two different
 * trees and there is nothing to mismatch on hydration. Below 64rem that
 * variant matches on the viewport instead and the toggle is not offered.
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

  const toggle = useCallback(() => setSidebar(!getSnapshot()), []);

  return { collapsed, toggle };
}
