package com.screentimesocial.model;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@Entity
@Table(
        name = "daily_usage",
        uniqueConstraints = @UniqueConstraint(name = "uq_daily_usage_user_date", columnNames = {"user_id", "usage_date"})
)
public class DailyUsageEntity {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private UserEntity user;

    @Column(name = "usage_date", nullable = false)
    private LocalDate usageDate;

    @Column(name = "total_minutes", nullable = false)
    private int totalMinutes;

    @Column(nullable = false)
    private int pickups;

    @Column(name = "synced_at", nullable = false)
    private Instant syncedAt;

    @OneToMany(mappedBy = "dailyUsage", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<AppUsageEntity> apps = new ArrayList<>();

    protected DailyUsageEntity() {
    }

    public DailyUsageEntity(UserEntity user, LocalDate usageDate) {
        this.id = UUID.randomUUID();
        this.user = user;
        this.usageDate = usageDate;
        this.syncedAt = Instant.now();
    }

    public void replaceUsage(int totalMinutes, int pickups, List<AppUsageValue> newApps) {
        this.totalMinutes = totalMinutes;
        this.pickups = pickups;
        this.syncedAt = Instant.now();
        Map<String, AppUsageEntity> existingByAppId = new HashMap<>();
        this.apps.forEach(app -> existingByAppId.put(app.getAppId(), app));
        this.apps.removeIf(app -> newApps.stream()
                .noneMatch(incoming -> incoming.appId().equals(app.getAppId())));
        newApps.forEach(app -> {
            AppUsageEntity existing = existingByAppId.get(app.appId());
            if (existing == null) {
                this.apps.add(new AppUsageEntity(this, app.appId(), app.displayName(), app.minutes()));
            } else {
                existing.update(app.displayName(), app.minutes());
            }
        });
    }

    public UUID getId() {
        return id;
    }

    public UUID getUserId() {
        return user.getId();
    }

    public LocalDate getUsageDate() {
        return usageDate;
    }

    public int getTotalMinutes() {
        return totalMinutes;
    }

    public int getPickups() {
        return pickups;
    }

    public Instant getSyncedAt() {
        return syncedAt;
    }

    public List<AppUsageEntity> getApps() {
        return List.copyOf(apps);
    }

    public record AppUsageValue(String appId, String displayName, int minutes) {
    }
}
