"use client";

import { useEffect } from "react";

/**
 * Back-compat for old marketing links like `/#get-started`.
 * Hashes are client-only, so we redirect after hydration.
 */
export function GetStartedHashRedirect() {
  useEffect(() => {
    if (window.location.hash !== "#get-started") return;
    window.location.replace("/upload");
  }, []);

  return null;
}

