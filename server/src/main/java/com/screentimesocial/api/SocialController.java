package com.screentimesocial.api;

import com.screentimesocial.service.SocialService;
import jakarta.validation.Valid;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1")
public class SocialController {

    private final SocialService socialService;

    public SocialController(SocialService socialService) {
        this.socialService = socialService;
    }

    @GetMapping("/me")
    ApiModels.UserResponse profile(@AuthenticationPrincipal Jwt jwt) {
        return socialService.profile(currentUserId(jwt));
    }

    @PatchMapping("/me/username")
    ApiModels.UserResponse updateUsername(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ApiModels.UpdateUsernameRequest request
    ) {
        return socialService.updateUsername(currentUserId(jwt), request.username());
    }

    @GetMapping("/usernames/{username}/availability")
    ApiModels.UsernameAvailability usernameAvailability(@PathVariable String username) {
        return new ApiModels.UsernameAvailability(username, socialService.isUsernameAvailable(username));
    }

    @GetMapping("/users/search")
    ApiModels.UserResponse searchUser(@RequestParam String username) {
        return socialService.findByUsername(username);
    }

    @PostMapping("/friend-requests")
    @ResponseStatus(HttpStatus.CREATED)
    ApiModels.FriendshipResponse requestFriend(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ApiModels.FriendRequest request
    ) {
        return socialService.requestFriend(currentUserId(jwt), request.addresseeUsername());
    }

    @GetMapping("/me/friend-requests")
    List<ApiModels.FriendshipResponse> pendingRequests(@AuthenticationPrincipal Jwt jwt) {
        return socialService.pendingRequests(currentUserId(jwt));
    }

    @PostMapping("/friend-requests/{friendshipId}/accept")
    ApiModels.FriendshipResponse acceptFriend(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID friendshipId
    ) {
        return socialService.acceptFriend(friendshipId, currentUserId(jwt));
    }

    @PostMapping("/me/usage")
    ApiModels.UsageResponse syncUsage(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ApiModels.SyncUsageRequest request
    ) {
        return socialService.syncUsage(currentUserId(jwt), request);
    }

    @GetMapping("/me/circle")
    List<ApiModels.CircleMember> getCircle(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return socialService.getCircle(
                currentUserId(jwt), date == null ? LocalDate.now() : date);
    }

    @PostMapping("/groups")
    @ResponseStatus(HttpStatus.CREATED)
    ApiModels.ComparisonGroupResponse createComparisonGroup(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ApiModels.CreateComparisonGroupRequest request
    ) {
        return socialService.createComparisonGroup(
                currentUserId(jwt), request, LocalDate.now());
    }

    @PostMapping("/groups/join")
    ApiModels.ComparisonGroupResponse joinComparisonGroup(
            @AuthenticationPrincipal Jwt jwt,
            @Valid @RequestBody ApiModels.JoinComparisonGroupRequest request
    ) {
        return socialService.joinComparisonGroup(
                currentUserId(jwt), request.inviteCode(), LocalDate.now());
    }

    @GetMapping("/me/groups")
    List<ApiModels.ComparisonGroupResponse> comparisonGroups(
            @AuthenticationPrincipal Jwt jwt,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return socialService.getComparisonGroups(
                currentUserId(jwt), date == null ? LocalDate.now() : date);
    }

    @GetMapping("/groups/{groupId}")
    ApiModels.ComparisonGroupResponse comparisonGroup(
            @AuthenticationPrincipal Jwt jwt,
            @PathVariable UUID groupId,
            @RequestParam(required = false)
            @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date
    ) {
        return socialService.getComparisonGroup(
                groupId, currentUserId(jwt), date == null ? LocalDate.now() : date);
    }

    private UUID currentUserId(Jwt jwt) {
        return UUID.fromString(jwt.getSubject());
    }
}
