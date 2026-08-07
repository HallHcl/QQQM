ALTER TABLE environments ADD COLUMN vpn_resource_id UUID REFERENCES resources(id) ON DELETE SET NULL;
CREATE INDEX idx_environments_vpn_resource ON environments(vpn_resource_id);
