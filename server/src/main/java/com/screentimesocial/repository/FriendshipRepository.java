package com.screentimesocial.repository;

import com.screentimesocial.model.FriendshipEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface FriendshipRepository extends JpaRepository<FriendshipEntity, UUID> {

    @EntityGraph(attributePaths = {"requester", "addressee"})
    @Query("select f from FriendshipEntity f where f.requester.id = :userId or f.addressee.id = :userId")
    List<FriendshipEntity> findAllForUser(@Param("userId") UUID userId);

    @Query("""
            select (count(f) > 0) from FriendshipEntity f
            where f.status <> com.screentimesocial.model.FriendshipEntity.Status.DECLINED
              and ((f.requester.id = :first and f.addressee.id = :second)
                or (f.requester.id = :second and f.addressee.id = :first))
            """)
    boolean existsActiveBetween(@Param("first") UUID first, @Param("second") UUID second);

    @EntityGraph(attributePaths = {"requester", "addressee"})
    @Query("""
            select f from FriendshipEntity f
            where f.status <> com.screentimesocial.model.FriendshipEntity.Status.DECLINED
              and ((f.requester.id = :first and f.addressee.id = :second)
                or (f.requester.id = :second and f.addressee.id = :first))
            """)
    Optional<FriendshipEntity> findActiveBetween(
            @Param("first") UUID first,
            @Param("second") UUID second
    );

    @EntityGraph(attributePaths = {"requester", "addressee"})
    List<FriendshipEntity> findByAddresseeIdAndStatusOrderByCreatedAtDesc(
            UUID addresseeId,
            FriendshipEntity.Status status
    );

    @EntityGraph(attributePaths = {"requester", "addressee"})
    @Query("""
            select f from FriendshipEntity f
            where f.status = com.screentimesocial.model.FriendshipEntity.Status.ACCEPTED
              and (f.requester.id = :userId or f.addressee.id = :userId)
            """)
    List<FriendshipEntity> findAcceptedForUser(@Param("userId") UUID userId);

    @EntityGraph(attributePaths = {"requester", "addressee"})
    @Query("select f from FriendshipEntity f where f.id = :id")
    java.util.Optional<FriendshipEntity> findDetailedById(@Param("id") UUID id);
}
