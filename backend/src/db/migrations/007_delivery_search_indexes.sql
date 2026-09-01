-- Global search (⌘K palette) across the DELIVERY entities: clients, projects,
-- environments, servers.
--
-- The search is deliberately HYBRID rather than pure full-text:
--
--   * Full-text (tsvector/ts_rank) covers the prose fields — name, description,
--     notes — where lexeme matching and relevance ranking genuinely help.
--   * ILIKE covers the identifier fields — hostname, ip_address, display_name.
--     Postgres' 'english' parser treats `web-prod-01.example.com` and
--     `10.0.2.15` as single opaque host/numeric tokens, so `prod` and `10.0.2`
--     match neither under FTS. Those substring lookups already work today via
--     the list endpoints' ILIKE filters (servers.service.ts), and dropping to
--     pure FTS would visibly regress them.
--
-- The GIN indexes below back the FTS half. Their expressions must stay
-- character-for-character in step with the to_tsvector() calls in
-- services/search.service.ts, or Postgres will silently plan a sequential scan
-- instead of using them.
--
-- The ILIKE half is intentionally unindexed: a leading-wildcard '%term%' cannot
-- use a btree index, and adding pg_trgm for it is not justified at DELIVERY
-- table sizes (tens of clients, low hundreds of servers). Revisit if these
-- tables grow by orders of magnitude.

CREATE INDEX idx_clients_search_gin ON clients
  USING GIN (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));

CREATE INDEX idx_projects_search_gin ON projects
  USING GIN (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));

CREATE INDEX idx_environments_search_gin ON environments
  USING GIN (to_tsvector('english', coalesce(name, '') || ' ' || coalesce(description, '')));

-- Servers fold display_name and hostname into the FTS document as well as
-- matching them by ILIKE: a multi-word display_name ("Atlas Prod Web Node")
-- benefits from lexeme matching, while the hostname/IP forms need substrings.
CREATE INDEX idx_servers_search_gin ON servers
  USING GIN (to_tsvector('english',
    coalesce(display_name, '') || ' ' || coalesce(hostname, '') || ' ' || coalesce(notes, '')));
