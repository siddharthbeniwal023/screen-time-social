package com.screentimesocial.model;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import org.hibernate.annotations.OnDelete;
import org.hibernate.annotations.OnDeleteAction;

import java.util.UUID;

@Entity
@Table(
        name = "app_usage",
        uniqueConstraints = @UniqueConstraint(name = "uq_app_usage_daily_app", columnNames = {"daily_usage_id", "app_id"})
)
public class AppUsageEntity {

    @Id
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "daily_usage_id", nullable = false)
    @OnDelete(action = OnDeleteAction.CASCADE)
    private DailyUsageEntity dailyUsage;

    @Column(name = "app_id", nullable = false)
    private String appId;

    @Column(name = "display_name", nullable = false, length = 120)
    private String displayName;

    @Column(nullable = false)
    private int minutes;

    protected AppUsageEntity() {
    }

    AppUsageEntity(DailyUsageEntity dailyUsage, String appId, String displayName, int minutes) {
        this.id = UUID.randomUUID();
        this.dailyUsage = dailyUsage;
        this.appId = appId;
        this.displayName = displayName;
        this.minutes = minutes;
    }

    void update(String displayName, int minutes) {
        this.displayName = displayName;
        this.minutes = minutes;
    }

    public String getAppId() {
        return appId;
    }

    public String getDisplayName() {
        return displayName;
    }

    public int getMinutes() {
        return minutes;
    }
}
