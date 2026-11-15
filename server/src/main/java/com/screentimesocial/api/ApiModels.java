package com.screentimesocial.api;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

public final class ApiModels {

    public static final String USERNAME_PATTERN = "^[a-zA-Z0-9_.]+$";

    private ApiModels() {
    }

    public record RegisterRequest(
            @NotBlank @Size(max = 60) String displayName,
            @NotBlank
            @Size(min = 3, max = 24)
            @Pattern(regexp = USERNAME_PATTERN, message = "can only contain letters, numbers, dots, and underscores")
            String username,
            @NotBlank @Email @Size(max = 320) String email,
            @NotBlank @Size(min = 10, max = 72) String password
    ) {
        @Override
        public String toString() {
            return "RegisterRequest[displayName=" + displayName + ", username=" + username
                    + ", email=" + email + ", password=[REDACTED]]";
        }
    }

    public record LoginRequest(
            @NotBlank @Email String email,
            @NotBlank String password
    ) {
        @Override
        public String toString() {
            return "LoginRequest[email=" + email + ", password=[REDACTED]]";
        }
    }

    public record AuthResponse(
            String accessToken,
            long expiresInSeconds,
            String refreshToken,
            Instant refreshTokenExpiresAt,
            UserResponse user
    ) {
        @Override
        public String toString() {
            return "AuthResponse[accessToken=[REDACTED], expiresInSeconds=" + expiresInSeconds
                    + ", refreshToken=[REDACTED], refreshTokenExpiresAt=" + refreshTokenExpiresAt
                    + ", user=" + user + ']';
        }
    }

    public record RefreshRequest(@NotBlank String refreshToken) {
        @Override
        public String toString() {
            return "RefreshRequest[refreshToken=[REDACTED]]";
        }
    }

    public record LogoutRequest(@NotBlank String refreshToken) {
        @Override
        public String toString() {
            return "LogoutRequest[refreshToken=[REDACTED]]";
        }
    }

    public record UpdateUsernameRequest(
            @NotBlank
            @Size(min = 3, max = 24)
            @Pattern(regexp = USERNAME_PATTERN, message = "can only contain letters, numbers, dots, and underscores")
            String username
    ) {
    }

    public record FriendRequest(@NotBlank String addresseeUsername) {
    }

    public record CreateComparisonGroupRequest(
            @NotBlank @Size(max = 60) String name,
            @NotNull @Size(min = 1, max = 19) List<UUID> memberUserIds
    ) {
    }

    public record JoinComparisonGroupRequest(
            @NotBlank @Size(min = 6, max = 10)
            @Pattern(regexp = "^[a-zA-Z0-9]+$", message = "must contain only letters and numbers")
            String inviteCode
    ) {
    }

    public record SyncUsageRequest(
            @NotNull LocalDate date,
            @Min(0) @Max(1440) int totalMinutes,
            @Min(0) int pickups,
            @NotEmpty @Valid List<AppUsageRequest> apps
    ) {
    }

    public record AppUsageRequest(
            @NotBlank @Size(max = 255) String appId,
            @NotBlank @Size(max = 120) String displayName,
            @Min(0) @Max(1440) int minutes
    ) {
    }

    public record UsernameAvailability(String username, boolean available) {
    }

    public record UserResponse(
            UUID id,
            String displayName,
            String username,
            Instant createdAt
    ) {
    }

    public record FriendshipResponse(
            UUID id,
            UserResponse requester,
            UserResponse addressee,
            String status,
            Instant createdAt,
            Instant updatedAt
    ) {
    }

    public record AppUsageResponse(String appId, String displayName, int minutes) {
    }

    public record UsageResponse(
            LocalDate date,
            int totalMinutes,
            int pickups,
            List<AppUsageResponse> apps,
            Instant syncedAt
    ) {
    }

    public record CircleMember(
            UUID userId,
            String displayName,
            String username,
            UsageResponse usage
    ) {
    }

    public record ComparisonGroupMemberResponse(
            UUID userId,
            String displayName,
            String username,
            String role,
            Instant joinedAt,
            UsageResponse usage
    ) {
    }

    public record ComparisonGroupResponse(
            UUID id,
            String name,
            String inviteCode,
            UUID ownerId,
            List<ComparisonGroupMemberResponse> members,
            Instant createdAt,
            Instant updatedAt
    ) {
    }
}
