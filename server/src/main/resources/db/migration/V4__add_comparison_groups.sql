CREATE TABLE comparison_groups (
    id UUID PRIMARY KEY,
    name VARCHAR(60) NOT NULL,
    invite_code VARCHAR(10) NOT NULL,
    created_by UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_comparison_groups_invite_code UNIQUE (invite_code)
);

CREATE TABLE comparison_group_members (
    id UUID PRIMARY KEY,
    group_id UUID NOT NULL REFERENCES comparison_groups(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    role VARCHAR(16) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_comparison_group_member UNIQUE (group_id, user_id),
    CONSTRAINT ck_comparison_group_role CHECK (role IN ('OWNER', 'MEMBER'))
);

CREATE INDEX ix_comparison_group_members_user ON comparison_group_members(user_id);
CREATE INDEX ix_comparison_group_members_group ON comparison_group_members(group_id);
