package com.screentimesocial.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "comparison_groups")
public class ComparisonGroupEntity {

    @Id
    private UUID id;

    @Column(nullable = false, length = 60)
    private String name;

    @Column(name = "invite_code", nullable = false, unique = true, length = 10)
    private String inviteCode;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "created_by", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private UserEntity createdBy;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    @OneToMany(mappedBy = "group", cascade = CascadeType.ALL, orphanRemoval = true)
    @OrderBy("joinedAt ASC")
    private List<ComparisonGroupMemberEntity> members = new ArrayList<>();

    protected ComparisonGroupEntity() {
    }

    public ComparisonGroupEntity(String name, String inviteCode, UserEntity owner) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.name = name;
        this.inviteCode = inviteCode;
        this.createdBy = owner;
        this.createdAt = now;
        this.updatedAt = now;
        addMember(owner, ComparisonGroupMemberEntity.Role.OWNER);
    }

    public void addMember(UserEntity user, ComparisonGroupMemberEntity.Role role) {
        boolean alreadyMember = members.stream()
                .anyMatch(member -> member.getUser().getId().equals(user.getId()));
        if (!alreadyMember) {
            members.add(new ComparisonGroupMemberEntity(this, user, role));
            this.updatedAt = Instant.now();
        }
    }

    public boolean includes(UUID userId) {
        return members.stream().anyMatch(member -> member.getUser().getId().equals(userId));
    }

    public boolean isOwner(UUID userId) {
        return createdBy.getId().equals(userId);
    }

    public void removeMember(UUID userId) {
        if (isOwner(userId)) {
            throw new IllegalArgumentException("The group owner cannot be removed");
        }
        if (members.removeIf(member -> member.getUser().getId().equals(userId))) {
            this.updatedAt = Instant.now();
        }
    }

    public UUID getId() {
        return id;
    }

    public String getName() {
        return name;
    }

    public String getInviteCode() {
        return inviteCode;
    }

    public UserEntity getCreatedBy() {
        return createdBy;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

    public List<ComparisonGroupMemberEntity> getMembers() {
        return Collections.unmodifiableList(members);
    }
}
