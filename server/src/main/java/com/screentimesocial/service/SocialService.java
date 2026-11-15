package com.screentimesocial.service;

import com.screentimesocial.api.ApiModels;
import com.screentimesocial.model.AppUsageEntity;
import com.screentimesocial.model.ComparisonGroupEntity;
import com.screentimesocial.model.ComparisonGroupMemberEntity;
import com.screentimesocial.model.DailyUsageEntity;
import com.screentimesocial.model.FriendshipEntity;
import com.screentimesocial.model.UserEntity;
import com.screentimesocial.repository.ComparisonGroupRepository;
import com.screentimesocial.repository.DailyUsageRepository;
import com.screentimesocial.repository.FriendshipRepository;
import com.screentimesocial.repository.RefreshTokenRepository;
import com.screentimesocial.repository.UserRepository;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class SocialService {

    private final UserRepository userRepository;
    private final FriendshipRepository friendshipRepository;
    private final DailyUsageRepository dailyUsageRepository;
    private final ComparisonGroupRepository comparisonGroupRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final SecureRandom secureRandom = new SecureRandom();

    public SocialService(
            UserRepository userRepository,
            FriendshipRepository friendshipRepository,
            DailyUsageRepository dailyUsageRepository,
            ComparisonGroupRepository comparisonGroupRepository,
            RefreshTokenRepository refreshTokenRepository
    ) {
        this.userRepository = userRepository;
        this.friendshipRepository = friendshipRepository;
        this.dailyUsageRepository = dailyUsageRepository;
        this.comparisonGroupRepository = comparisonGroupRepository;
        this.refreshTokenRepository = refreshTokenRepository;
    }

    @Transactional(readOnly = true)
    public ApiModels.UserResponse profile(UUID userId) {
        return toUserResponse(requireUser(userId));
    }

    @Transactional
    public void deleteAccount(UUID userId) {
        UserEntity user = requireUser(userId);
        comparisonGroupRepository.findAllForMember(userId).forEach(group -> {
            if (group.isOwner(userId)) {
                comparisonGroupRepository.delete(group);
            } else {
                group.removeMember(userId);
            }
        });
        comparisonGroupRepository.flush();
        refreshTokenRepository.deleteAll(refreshTokenRepository.findAllByUser_Id(userId));
        friendshipRepository.deleteAll(friendshipRepository.findAllForUser(userId));
        dailyUsageRepository.deleteAll(dailyUsageRepository.findAllByUser_Id(userId));
        refreshTokenRepository.flush();
        friendshipRepository.flush();
        dailyUsageRepository.flush();
        userRepository.delete(user);
        userRepository.flush();
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

    @Transactional
    public ApiModels.UserResponse updatePrivacy(UUID userId, boolean shareAppBreakdown) {
        UserEntity user = requireUser(userId);
        user.changePrivacy(shareAppBreakdown);
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

    @Transactional
    public ApiModels.FriendshipResponse declineFriend(UUID friendshipId, UUID userId) {
        FriendshipEntity friendship = friendshipRepository.findDetailedById(friendshipId)
                .orElseThrow(() -> new NotFoundException("Friend request not found"));
        if (!friendship.getAddressee().getId().equals(userId)) {
            throw new ForbiddenException("Only the recipient can decline this request");
        }
        if (friendship.getStatus() != FriendshipEntity.Status.PENDING) {
            throw new ConflictException("This request is no longer pending");
        }
        friendship.decline();
        return toFriendshipResponse(friendship);
    }

    @Transactional
    public void removeFriend(UUID userId, UUID friendUserId) {
        if (userId.equals(friendUserId)) {
            throw new ConflictException("You cannot remove yourself");
        }
        FriendshipEntity friendship = friendshipRepository.findActiveBetween(userId, friendUserId)
                .orElseThrow(() -> new NotFoundException("Friendship not found"));
        if (friendship.getStatus() != FriendshipEntity.Status.ACCEPTED) {
            throw new ConflictException("This friendship has not been accepted");
        }
        friendshipRepository.delete(friendship);
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
        long uniqueAppIds = request.apps().stream()
                .map(app -> normalizeAppId(app.appId()))
                .distinct()
                .count();
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
                                normalizeAppId(app.appId()), app.displayName().trim(), app.minutes()))
                        .toList());
        return toUsageResponse(dailyUsageRepository.save(usage), true);
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
                    usage == null ? null : toUsageResponse(
                            usage, user.getId().equals(viewerId) || user.isShareAppBreakdown()),
                    user.getId().equals(viewerId) || user.isShareAppBreakdown()));
        });
        members.sort(Comparator.comparingInt(member ->
                member.usage() == null ? Integer.MAX_VALUE : member.usage().totalMinutes()));
        return members;
    }

    @Transactional
    public ApiModels.ComparisonGroupResponse createComparisonGroup(
            UUID ownerId,
            ApiModels.CreateComparisonGroupRequest request,
            LocalDate date
    ) {
        UserEntity owner = requireUser(ownerId);
        Set<UUID> requestedMemberIds = new HashSet<>(request.memberUserIds());
        if (requestedMemberIds.size() != request.memberUserIds().size()) {
            throw new ConflictException("Each group member can be selected only once");
        }
        if (requestedMemberIds.contains(ownerId)) {
            throw new ConflictException("You are already included as the group owner");
        }

        Map<UUID, UserEntity> acceptedFriends = new LinkedHashMap<>();
        friendshipRepository.findAcceptedForUser(ownerId).stream()
                .map(friendship -> friendship.otherUser(ownerId))
                .forEach(friend -> acceptedFriends.put(friend.getId(), friend));
        if (!acceptedFriends.keySet().containsAll(requestedMemberIds)) {
            throw new ForbiddenException("Only accepted friends can be added directly to a group");
        }

        ComparisonGroupEntity group = new ComparisonGroupEntity(
                request.name().trim(), generateInviteCode(), owner);
        requestedMemberIds.stream()
                .map(acceptedFriends::get)
                .forEach(friend -> group.addMember(friend, ComparisonGroupMemberEntity.Role.MEMBER));
        try {
            comparisonGroupRepository.saveAndFlush(group);
        } catch (DataIntegrityViolationException exception) {
            throw new ConflictException("The group could not be created. Please try again");
        }
        return toComparisonGroupResponse(group, date, ownerId);
    }

    @Transactional
    public ApiModels.ComparisonGroupResponse joinComparisonGroup(
            UUID userId,
            String requestedInviteCode,
            LocalDate date
    ) {
        UserEntity joiningUser = requireUser(userId);
        String inviteCode = requestedInviteCode.trim().toUpperCase(Locale.ROOT);
        ComparisonGroupEntity group = comparisonGroupRepository
                .findDetailedByInviteCode(inviteCode)
                .orElseThrow(() -> new NotFoundException("No group found for that invite code"));
        if (group.includes(userId)) {
            return toComparisonGroupResponse(group, date, userId);
        }
        if (group.getMembers().size() >= 20) {
            throw new ConflictException("This group has reached its 20-member limit");
        }

        List<UserEntity> existingMembers = group.getMembers().stream()
                .map(ComparisonGroupMemberEntity::getUser)
                .toList();
        existingMembers.forEach(member -> ensureAcceptedFriendship(joiningUser, member));
        group.addMember(joiningUser, ComparisonGroupMemberEntity.Role.MEMBER);
        try {
            comparisonGroupRepository.saveAndFlush(group);
        } catch (DataIntegrityViolationException exception) {
            throw new ConflictException("You could not join this group. Please try again");
        }
        return toComparisonGroupResponse(group, date, userId);
    }

    @Transactional(readOnly = true)
    public List<ApiModels.ComparisonGroupResponse> getComparisonGroups(
            UUID userId,
            LocalDate date
    ) {
        requireUser(userId);
        return comparisonGroupRepository.findAllForMember(userId).stream()
                .map(group -> toComparisonGroupResponse(group, date, userId))
                .toList();
    }

    @Transactional(readOnly = true)
    public ApiModels.ComparisonGroupResponse getComparisonGroup(
            UUID groupId,
            UUID userId,
            LocalDate date
    ) {
        ComparisonGroupEntity group = comparisonGroupRepository.findDetailedById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found"));
        if (!group.includes(userId)) {
            throw new ForbiddenException("Only group members can view this group");
        }
        return toComparisonGroupResponse(group, date, userId);
    }

    @Transactional
    public void leaveOrDeleteComparisonGroup(UUID groupId, UUID userId) {
        ComparisonGroupEntity group = comparisonGroupRepository.findDetailedById(groupId)
                .orElseThrow(() -> new NotFoundException("Group not found"));
        if (!group.includes(userId)) {
            throw new ForbiddenException("Only group members can leave this group");
        }
        if (group.isOwner(userId)) {
            comparisonGroupRepository.delete(group);
        } else {
            group.removeMember(userId);
        }
    }

    private void ensureAcceptedFriendship(UserEntity first, UserEntity second) {
        friendshipRepository.findActiveBetween(first.getId(), second.getId())
                .ifPresentOrElse(friendship -> {
                    if (friendship.getStatus() == FriendshipEntity.Status.PENDING) {
                        friendship.accept();
                    }
                }, () -> friendshipRepository.save(FriendshipEntity.accepted(first, second)));
    }

    private String generateInviteCode() {
        for (int attempt = 0; attempt < 20; attempt++) {
            StringBuilder code = new StringBuilder(8);
            for (int index = 0; index < 8; index++) {
                code.append(INVITE_CODE_ALPHABET.charAt(
                        secureRandom.nextInt(INVITE_CODE_ALPHABET.length())));
            }
            String candidate = code.toString();
            if (!comparisonGroupRepository.existsByInviteCodeIgnoreCase(candidate)) {
                return candidate;
            }
        }
        throw new ConflictException("A unique invite code could not be generated. Please try again");
    }

    private ApiModels.ComparisonGroupResponse toComparisonGroupResponse(
            ComparisonGroupEntity group,
            LocalDate date,
            UUID viewerId
    ) {
        Set<UUID> memberIds = group.getMembers().stream()
                .map(member -> member.getUser().getId())
                .collect(java.util.stream.Collectors.toSet());
        Map<UUID, DailyUsageEntity> usageByUser = new LinkedHashMap<>();
        dailyUsageRepository.findByUserIdInAndUsageDate(memberIds, date)
                .forEach(usage -> usageByUser.put(usage.getUserId(), usage));

        List<ApiModels.ComparisonGroupMemberResponse> members = group.getMembers().stream()
                .map(member -> {
                    UserEntity user = member.getUser();
                    DailyUsageEntity usage = usageByUser.get(user.getId());
                    boolean appBreakdownShared = user.getId().equals(viewerId)
                            || user.isShareAppBreakdown();
                    return new ApiModels.ComparisonGroupMemberResponse(
                            user.getId(),
                            user.getDisplayName(),
                            user.getUsername(),
                            member.getRole().name(),
                            member.getJoinedAt(),
                            usage == null ? null : toUsageResponse(usage, appBreakdownShared),
                            appBreakdownShared);
                })
                .sorted(Comparator.comparingInt(member ->
                        member.usage() == null ? Integer.MAX_VALUE : member.usage().totalMinutes()))
                .toList();
        return new ApiModels.ComparisonGroupResponse(
                group.getId(),
                group.getName(),
                group.getInviteCode(),
                group.getCreatedBy().getId(),
                members,
                group.getCreatedAt(),
                group.getUpdatedAt());
    }

    private UserEntity requireUser(UUID id) {
        return userRepository.findById(id).orElseThrow(() -> new NotFoundException("User not found"));
    }

    public static String normalizeUsername(String username) {
        return username.trim().replaceFirst("^@", "").toLowerCase(Locale.ROOT);
    }

    public static ApiModels.UserResponse toUserResponse(UserEntity user) {
        return new ApiModels.UserResponse(
                user.getId(), user.getDisplayName(), user.getUsername(), user.getCreatedAt(),
                user.isShareAppBreakdown());
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

    private static ApiModels.UsageResponse toUsageResponse(
            DailyUsageEntity usage,
            boolean includeApps
    ) {
        List<ApiModels.AppUsageResponse> apps = includeApps
                ? usage.getApps().stream()
                        .sorted(Comparator.comparingInt(AppUsageEntity::getMinutes).reversed())
                        .map(app -> new ApiModels.AppUsageResponse(
                                app.getAppId(), app.getDisplayName(), app.getMinutes()))
                        .toList()
                : List.of();
        return new ApiModels.UsageResponse(
                usage.getUsageDate(),
                usage.getTotalMinutes(),
                usage.getPickups(),
                apps,
                usage.getSyncedAt());
    }

    private static String normalizeAppId(String appId) {
        return appId.trim().toLowerCase(Locale.ROOT);
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

    public static class InvalidRequestException extends RuntimeException {
        public InvalidRequestException(String message) {
            super(message);
        }
    }

    private static final String INVITE_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
}
