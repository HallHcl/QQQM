import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import CommandPalette from "./CommandPalette";
import { SearchPaletteContext } from "./useSearchPalette";

/**
 * Owns the palette's open state, registers the global ⌘K / Ctrl+K shortcut,
 * and renders the palette once for the whole app.
 */
export function SearchPaletteProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);

  /**
   * Where focus was when the palette opened.
   *
   * Radix Dialog restores focus on close by itself, but only to a
   * `DialogTrigger` — and this palette has none: it opens from the Topbar
   * button and from a document-level key handler. Without this, closing drops
   * focus on `<body>` and a keyboard user loses their place entirely.
   */
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  const changeOpen = useCallback((next: boolean) => {
    if (next) {
      const active = document.activeElement;
      restoreFocusRef.current = active instanceof HTMLElement ? active : null;
    }
    setOpen(next);
  }, []);

  useEffect(() => {
    if (open) return;
    const target = restoreFocusRef.current;
    if (!target || !target.isConnected) return;

    // Deferred a tick: Radix's own focus handling runs as the dialog unmounts,
    // and restoring underneath it would just be overwritten. Only reclaims
    // focus if it was actually dropped — if something else legitimately took
    // it (Radix's own restore, or a focus() in an onSelect handler), leave it.
    const timer = setTimeout(() => {
      if (document.activeElement === document.body || document.activeElement === null) {
        target.focus();
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      // metaKey for macOS, ctrlKey elsewhere. Checked on `key`, not `code`, so
      // non-QWERTY layouts still trigger on the character the user sees.
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey)) {
        return;
      }
      // Browsers bind Ctrl+K to the address bar; this is a deliberate override
      // within the app, matching the convention every ⌘K palette uses.
      event.preventDefault();
      setOpen((previous) => {
        if (!previous) {
          const active = document.activeElement;
          restoreFocusRef.current = active instanceof HTMLElement ? active : null;
        }
        return !previous;
      });
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const openPalette = useCallback(() => changeOpen(true), [changeOpen]);
  const value = useMemo(
    () => ({ open, setOpen: changeOpen, openPalette }),
    [open, changeOpen, openPalette]
  );

  return (
    <SearchPaletteContext.Provider value={value}>
      {children}
      <CommandPalette open={open} onOpenChange={changeOpen} />
    </SearchPaletteContext.Provider>
  );
}
