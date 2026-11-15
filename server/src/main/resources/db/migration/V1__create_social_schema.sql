CREATE TABLE app_users (
    id UUID PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    display_name VARCHAR(60) NOT NULL,
    username VARCHAR(24) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_app_users_email UNIQUE (email),
    CONSTRAINT uq_app_users_username UNIQUE (username),
    CONSTRAINT ck_app_users_email_lowercase CHECK (email = LOWER(email)),
    CONSTRAINT ck_app_users_username_lowercase CHECK (username = LOWER(username))
);

CREATE TABLE friendships (
    id UUID PRIMARY KEY,
    requester_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    addressee_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    status VARCHAR(16) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT ck_friendships_different_users CHECK (requester_id <> addressee_id),
    CONSTRAINT ck_friendships_status CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED'))
);

CREATE UNIQUE INDEX uq_active_friendship_pair
    ON friendships (LEAST(requester_id, addressee_id), GREATEST(requester_id, addressee_id))
    WHERE status <> 'DECLINED';
CREATE INDEX ix_friendships_requester ON friendships(requester_id);
CREATE INDEX ix_friendships_addressee ON friendships(addressee_id);

CREATE TABLE daily_usage (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    usage_date DATE NOT NULL,
    total_minutes INTEGER NOT NULL,
    pickups INTEGER NOT NULL,
    synced_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_daily_usage_user_date UNIQUE (user_id, usage_date),
    CONSTRAINT ck_daily_usage_minutes CHECK (total_minutes BETWEEN 0 AND 1440),
    CONSTRAINT ck_daily_usage_pickups CHECK (pickups >= 0)
);

CREATE INDEX ix_daily_usage_date ON daily_usage(usage_date);

CREATE TABLE app_usage (
    id UUID PRIMARY KEY,
    daily_usage_id UUID NOT NULL REFERENCES daily_usage(id) ON DELETE CASCADE,
    app_id VARCHAR(255) NOT NULL,
    display_name VARCHAR(120) NOT NULL,
    minutes INTEGER NOT NULL,
    CONSTRAINT uq_app_usage_daily_app UNIQUE (daily_usage_id, app_id),
    CONSTRAINT ck_app_usage_minutes CHECK (minutes BETWEEN 0 AND 1440)
);
