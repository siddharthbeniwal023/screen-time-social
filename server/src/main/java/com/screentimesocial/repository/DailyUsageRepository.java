package com.screentimesocial.repository;

import com.screentimesocial.model.DailyUsageEntity;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DailyUsageRepository extends JpaRepository<DailyUsageEntity, UUID> {

    List<DailyUsageEntity> findAllByUser_Id(UUID userId);

    @EntityGraph(attributePaths = "apps")
    @Query("select d from DailyUsageEntity d where d.user.id = :userId and d.usageDate = :usageDate")
    Optional<DailyUsageEntity> findByUserIdAndUsageDate(
            @Param("userId") UUID userId,
            @Param("usageDate") LocalDate usageDate
    );

    @EntityGraph(attributePaths = "apps")
    @Query("select d from DailyUsageEntity d where d.user.id in :userIds and d.usageDate = :usageDate")
    List<DailyUsageEntity> findByUserIdInAndUsageDate(
            @Param("userIds") Collection<UUID> userIds,
            @Param("usageDate") LocalDate usageDate
    );
}
