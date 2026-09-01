import { createContext, useContext } from "react";

export interface SearchPaletteContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  openPalette: () => void;
}

/**
 * Kept in its own module rather than alongside the provider component so the
 * provider file exports only components — the `react(only-export-components)`
 * lint rule (fast refresh) flags mixed component/non-component exports.
 */
export const SearchPaletteContext =
  createContext<SearchPaletteContextValue | null>(null);

export function useSearchPalette(): SearchPaletteContextValue {
  const context = useContext(SearchPaletteContext);
  if (!context) {
    throw new Error("useSearchPalette must be used within a SearchPaletteProvider");
  }
  return context;
}
