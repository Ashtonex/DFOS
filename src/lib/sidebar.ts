"use client";
import { useSyncExternalStore } from "react";

const KEY = "dfos.sidebarCollapsed";
const EVENT = "dfos:sidebar";

function read() {
  return document.documentElement.dataset.sidebar === "collapsed";
}

function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
}

export function useSidebarCollapsed() {
  return useSyncExternalStore(subscribe, read, () => false);
}

export function setSidebarCollapsed(collapsed: boolean) {
  if (collapsed) document.documentElement.dataset.sidebar = "collapsed";
  else delete document.documentElement.dataset.sidebar;
  try {
    localStorage.setItem(KEY, collapsed ? "1" : "0");
  } catch {
    /* preference only */
  }
  window.dispatchEvent(new Event(EVENT));
}
