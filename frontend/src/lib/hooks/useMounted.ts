'use client';

import { useEffect, useState } from 'react';

/**
 * True only after the component has mounted on the client. Use to gate rendering
 * of values that legitimately differ between server and client (e.g. wall-clock
 * timestamps) so the first client paint matches the server HTML and React can
 * hydrate cleanly.
 */
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
