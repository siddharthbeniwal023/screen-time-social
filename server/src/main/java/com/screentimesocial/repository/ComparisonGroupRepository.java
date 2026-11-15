package com.screentimesocial.repository;

import com.screentimesocial.model.ComparisonGroupEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ComparisonGroupRepository extends JpaRepository<ComparisonGroupEntity, UUID> {

    boolean existsByInviteCodeIgnoreCase(String inviteCode);

    @EntityGraph(attributePaths = {"createdBy", "members", "members.user"})
    @Query("""
            select distinct g from ComparisonGroupEntity g
            join g.members member
            where member.user.id = :userId
            order by g.updatedAt desc
            """)
    List<ComparisonGroupEntity> findAllForMember(@Param("userId") UUID userId);

    @EntityGraph(attributePaths = {"createdBy", "members", "members.user"})
    @Query("select distinct g from ComparisonGroupEntity g where g.id = :id")
    Optional<ComparisonGroupEntity> findDetailedById(@Param("id") UUID id);

    @EntityGraph(attributePaths = {"createdBy", "members", "members.user"})
    @Query("select distinct g from ComparisonGroupEntity g where upper(g.inviteCode) = upper(:inviteCode)")
    Optional<ComparisonGroupEntity> findDetailedByInviteCode(@Param("inviteCode") String inviteCode);
}
