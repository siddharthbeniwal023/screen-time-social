package com.screentimesocial.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "comparison_group_members",
        uniqueConstraints = @UniqueConstraint(columnNames = {"group_id", "user_id"})
)
public class ComparisonGroupMemberEntity {

    public enum Role {
        OWNER,
        MEMBER
    }

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "group_id", nullable = false)
    private ComparisonGroupEntity group;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Role role;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    protected ComparisonGroupMemberEntity() {
    }

    ComparisonGroupMemberEntity(ComparisonGroupEntity group, UserEntity user, Role role) {
        this.id = UUID.randomUUID();
        this.group = group;
        this.user = user;
        this.role = role;
        this.joinedAt = Instant.now();
    }

    public UUID getId() {
        return id;
    }

    public ComparisonGroupEntity getGroup() {
        return group;
    }

    public UserEntity getUser() {
        return user;
    }

    public Role getRole() {
        return role;
    }

    public Instant getJoinedAt() {
        return joinedAt;
    }
}
