import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiClient, unwrapApiResult } from "@/api/client";
import type { components } from "@/api/generated/schema";

export type SearchHit = components["schemas"]["SearchHit"];
export type SearchResults = components["schemas"]["SearchResults"];
export type SearchEntityType = components["schemas"]["SearchEntityType"];

const KEY = "search";

/**
 * The palette's four groups, in the order they render. Declared here rather
 * than derived from the response so the order is stable regardless of which
 * groups happen to be non-empty, and so arrow-key traversal across group
 * boundaries is deterministic.
 */
export const SEARCH_GROUPS: {
  key: keyof Omit<SearchResults, "total">;
  label: string;
}[] = [
  { key: "clients", label: "Clients" },
  { key: "projects", label: "Projects" },
  { key: "environments", label: "Environments" },
  { key: "servers", label: "Servers" },
];

/**
 * Route each hit navigates to on Enter.
 *
 * Clients are the odd one out: there is no `/clients/:id` detail route in
 * AppRoutes (unlike projects, environments and servers), so a client hit
 * navigates to the list page. If a client detail page is added later, this is
 * the single place to update.
 */
export function searchHitPath(hit: SearchHit): string {
  switch (hit.type) {
    case "client":
      return "/clients";
    case "project":
      return `/projects/${hit.id}`;
    case "environment":
      return `/environments/${hit.id}`;
    case "server":
      return `/servers/${hit.id}`;
  }
}

/**
 * `term` is expected to be already debounced by the caller — this hook does no
 * debouncing of its own, so passing a raw input value here would issue one
 * request per keystroke.
 *
 * A blank term is never sent: the query is disabled, so the palette's resting
 * state costs nothing. `keepPreviousData` holds the last results on screen
 * while the next term is in flight, which stops the list from flashing empty
 * between keystrokes.
 */
export function useGlobalSearch(term: string) {
  const trimmed = term.trim();

  return useQuery({
    queryKey: [KEY, trimmed],
    enabled: trimmed.length > 0,
    placeholderData: keepPreviousData,
    queryFn: async () =>
      unwrapApiResult(
        await apiClient.GET("/api/search", { params: { query: { q: trimmed } } })
      ),
  });
}
