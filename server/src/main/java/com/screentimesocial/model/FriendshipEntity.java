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

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "friendships")
public class FriendshipEntity {

    public enum Status {
        PENDING,
        ACCEPTED,
        DECLINED
    }

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "requester_id", nullable = false)
    private UserEntity requester;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "addressee_id", nullable = false)
    private UserEntity addressee;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private Status status;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected FriendshipEntity() {
    }

    public FriendshipEntity(UserEntity requester, UserEntity addressee) {
        Instant now = Instant.now();
        this.id = UUID.randomUUID();
        this.requester = requester;
        this.addressee = addressee;
        this.status = Status.PENDING;
        this.createdAt = now;
        this.updatedAt = now;
    }

    public static FriendshipEntity accepted(UserEntity first, UserEntity second) {
        FriendshipEntity friendship = new FriendshipEntity(first, second);
        friendship.accept();
        return friendship;
    }

    public void accept() {
        this.status = Status.ACCEPTED;
        this.updatedAt = Instant.now();
    }

    public boolean includes(UUID userId) {
        return requester.getId().equals(userId) || addressee.getId().equals(userId);
    }

    public UserEntity otherUser(UUID userId) {
        if (requester.getId().equals(userId)) {
            return addressee;
        }
        if (addressee.getId().equals(userId)) {
            return requester;
        }
        throw new IllegalArgumentException("User is not part of this friendship");
    }

    public UUID getId() {
        return id;
    }

    public UserEntity getRequester() {
        return requester;
    }

    public UserEntity getAddressee() {
        return addressee;
    }

    public Status getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }
}
