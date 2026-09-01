import { useEffect, useState } from "react";

/**
 * Returns `value` delayed by `delayMs`, resetting the timer on every change.
 *
 * The global search palette drives a network request off keystrokes, so
 * without this it would fire one request per character typed. (The existing
 * list-page search boxes do exactly that today — they are paginated,
 * single-table queries and out of scope here, but this hook is deliberately
 * generic enough for them to adopt later.)
 *
 * The timer is cleared on unmount as well as on change, so closing the palette
 * mid-type cannot land a stray update on an unmounted component.
 */
export function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
