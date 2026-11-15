package com.screentimesocial.service;

import com.screentimesocial.api.ApiModels;
import com.screentimesocial.model.AppUsageEntity;
import com.screentimesocial.model.DailyUsageEntity;
import com.screentimesocial.model.FriendshipEntity;
import com.screentimesocial.model.UserEntity;
import com.screentimesocial.repository.DailyUsageRepository;
import com.screentimesocial.repository.FriendshipRepository;
import com.screentimesocial.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Service
public class SocialService {

    private final UserRepository userRepository;
    private final FriendshipRepository friendshipRepository;
    private final DailyUsageRepository dailyUsageRepository;

    public SocialService(
            UserRepository userRepository,
            FriendshipRepository friendshipRepository,
            DailyUsageRepository dailyUsageRepository
    ) {
        this.userRepository = userRepository;
        this.friendshipRepository = friendshipRepository;
        this.dailyUsageRepository = dailyUsageRepository;
    }

    @Transactional(readOnly = true)
    public ApiModels.UserResponse profile(UUID userId) {
        return toUserResponse(requireUser(userId));
    }

    @Transactional
    public ApiModels.UserResponse updateUsername(UUID userId, String requestedUsername) {
        UserEntity user = requireUser(userId);
        String username = normalizeUsername(requestedUsername);
        userRepository.findByUsernameIgnoreCase(username)
                .filter(existing -> !existing.getId().equals(userId))
                .ifPresent(existing -> {
                    throw new ConflictException("Username @" + username + " is already taken");
                });
        user.changeUsername(username);
        try {
            userRepository.flush();
        } catch (DataIntegrityViolationException exception) {
            throw new ConflictException("Username @" + username + " is already taken");
        }
        return toUserResponse(user);
    }

    @Transactional(readOnly = true)
    public boolean isUsernameAvailable(String requestedUsername) {
        return !userRepository.existsByUsernameIgnoreCase(normalizeUsername(requestedUsername));
    }

    @Transactional(readOnly = true)
    public ApiModels.UserResponse findByUsername(String requestedUsername) {
        String username = normalizeUsername(requestedUsername);
        return userRepository.findByUsernameIgnoreCase(username)
                .map(SocialService::toUserResponse)
                .orElseThrow(() -> new NotFoundException("No user found for @" + username));
    }

    @Transactional
    public ApiModels.FriendshipResponse requestFriend(UUID requesterId, String addresseeUsername) {
        UserEntity requester = requireUser(requesterId);
        UserEntity addressee = userRepository.findByUsernameIgnoreCase(normalizeUsername(addresseeUsername))
                .orElseThrow(() -> new NotFoundException("No user found for @" + addresseeUsername));
        if (requester.getId().equals(addressee.getId())) {
            throw new ConflictException("You cannot add yourself");
        }
        if (friendshipRepository.existsActiveBetween(requesterId, addressee.getId())) {
            throw new ConflictException("A friendship or pending request already exists");
        }

        FriendshipEntity friendship = new FriendshipEntity(requester, addressee);
        try {
            friendshipRepository.saveAndFlush(friendship);
        } catch (DataIntegrityViolationException exception) {
            throw new ConflictException("A friendship or pending request already exists");
        }
        return toFriendshipResponse(friendship);
    }

    @Transactional
    public ApiModels.FriendshipResponse acceptFriend(UUID friendshipId, UUID userId) {
        FriendshipEntity friendship = friendshipRepository.findDetailedById(friendshipId)
                .orElseThrow(() -> new NotFoundException("Friend request not found"));
        if (!friendship.getAddressee().getId().equals(userId)) {
            throw new ForbiddenException("Only the recipient can accept this request");
        }
        if (friendship.getStatus() != FriendshipEntity.Status.PENDING) {
            throw new ConflictException("This request is no longer pending");
        }
        friendship.accept();
        return toFriendshipResponse(friendship);
    }

    @Transactional(readOnly = true)
    public List<ApiModels.FriendshipResponse> pendingRequests(UUID userId) {
        requireUser(userId);
        return friendshipRepository.findByAddresseeIdAndStatusOrderByCreatedAtDesc(
                        userId, FriendshipEntity.Status.PENDING).stream()
                .map(SocialService::toFriendshipResponse)
                .toList();
    }

    @Transactional
    public ApiModels.UsageResponse syncUsage(UUID userId, ApiModels.SyncUsageRequest request) {
        UserEntity user = requireUser(userId);
        int appMinutes = request.apps().stream().mapToInt(ApiModels.AppUsageRequest::minutes).sum();
        if (appMinutes > request.totalMinutes()) {
            throw new ConflictException("App minutes cannot exceed total screen time");
        }
        long uniqueAppIds = request.apps().stream().map(ApiModels.AppUsageRequest::appId).distinct().count();
        if (uniqueAppIds != request.apps().size()) {
            throw new ConflictException("Each app can appear only once per day");
        }

        DailyUsageEntity usage = dailyUsageRepository.findByUserIdAndUsageDate(userId, request.date())
                .orElseGet(() -> new DailyUsageEntity(user, request.date()));
        usage.replaceUsage(
                request.totalMinutes(),
                request.pickups(),
                request.apps().stream()
                        .map(app -> new DailyUsageEntity.AppUsageValue(
                                app.appId(), app.displayName(), app.minutes()))
                        .toList());
        return toUsageResponse(dailyUsageRepository.save(usage));
    }

    @Transactional(readOnly = true)
    public List<ApiModels.CircleMember> getCircle(UUID viewerId, LocalDate date) {
        UserEntity viewer = requireUser(viewerId);
        Map<UUID, UserEntity> circle = new LinkedHashMap<>();
        circle.put(viewer.getId(), viewer);
        friendshipRepository.findAcceptedForUser(viewerId).stream()
                .map(friendship -> friendship.otherUser(viewerId))
                .forEach(friend -> circle.put(friend.getId(), friend));

        Map<UUID, DailyUsageEntity> usageByUser = new LinkedHashMap<>();
        dailyUsageRepository.findByUserIdInAndUsageDate(circle.keySet(), date)
                .forEach(usage -> usageByUser.put(usage.getUserId(), usage));

        List<ApiModels.CircleMember> members = new ArrayList<>();
        circle.values().forEach(user -> {
            DailyUsageEntity usage = usageByUser.get(user.getId());
            members.add(new ApiModels.CircleMember(
                    user.getId(),
                    user.getDisplayName(),
                    user.getUsername(),
                    usage == null ? null : toUsageResponse(usage)));
        });
        members.sort(Comparator.comparingInt(member ->
                member.usage() == null ? Integer.MAX_VALUE : member.usage().totalMinutes()));
        return members;
    }

    private UserEntity requireUser(UUID id) {
        return userRepository.findById(id).orElseThrow(() -> new NotFoundException("User not found"));
    }

    public static String normalizeUsername(String username) {
        return username.trim().replaceFirst("^@", "").toLowerCase(Locale.ROOT);
    }

    public static ApiModels.UserResponse toUserResponse(UserEntity user) {
        return new ApiModels.UserResponse(
                user.getId(), user.getDisplayName(), user.getUsername(), user.getCreatedAt());
    }

    private static ApiModels.FriendshipResponse toFriendshipResponse(FriendshipEntity friendship) {
        return new ApiModels.FriendshipResponse(
                friendship.getId(),
                toUserResponse(friendship.getRequester()),
                toUserResponse(friendship.getAddressee()),
                friendship.getStatus().name(),
                friendship.getCreatedAt(),
                friendship.getUpdatedAt());
    }

    private static ApiModels.UsageResponse toUsageResponse(DailyUsageEntity usage) {
        List<ApiModels.AppUsageResponse> apps = usage.getApps().stream()
                .sorted(Comparator.comparingInt(AppUsageEntity::getMinutes).reversed())
                .map(app -> new ApiModels.AppUsageResponse(
                        app.getAppId(), app.getDisplayName(), app.getMinutes()))
                .toList();
        return new ApiModels.UsageResponse(
                usage.getUsageDate(),
                usage.getTotalMinutes(),
                usage.getPickups(),
                apps,
                usage.getSyncedAt());
    }

    public static class NotFoundException extends RuntimeException {
        public NotFoundException(String message) {
            super(message);
        }
    }

    public static class ConflictException extends RuntimeException {
        public ConflictException(String message) {
            super(message);
        }
    }

    public static class ForbiddenException extends RuntimeException {
        public ForbiddenException(String message) {
            super(message);
        }
    }
}
