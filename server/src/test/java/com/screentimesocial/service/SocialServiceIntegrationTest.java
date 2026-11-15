package com.screentimesocial.service;

import com.screentimesocial.api.ApiModels;
import com.screentimesocial.model.UserEntity;
import com.screentimesocial.repository.UserRepository;
import com.screentimesocial.repository.RefreshTokenRepository;
import com.screentimesocial.repository.ComparisonGroupRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@ActiveProfiles("test")
@Transactional
@AutoConfigureMockMvc
class SocialServiceIntegrationTest {

    @Autowired
    private AuthService authService;

    @Autowired
    private SocialService socialService;

    @Autowired
    private UserRepository userRepository;

    @Autowired
    private JwtDecoder jwtDecoder;

    @Autowired
    private RefreshTokenRepository refreshTokenRepository;

    @Autowired
    private ComparisonGroupRepository comparisonGroupRepository;

    @Autowired
    private MockMvc mockMvc;

    @Test
    void registrationHashesPasswordsAndIssuesTokenForThePersistedUser() {
        ApiModels.AuthResponse auth = register("Maya", "MayaMoves", "maya@example.com");
        UserEntity persisted = userRepository.findByEmailIgnoreCase("maya@example.com").orElseThrow();

        assertThat(persisted.getPasswordHash()).isNotEqualTo("correct-horse-battery-staple");
        assertThat(persisted.getPasswordHash()).startsWith("$2");
        assertThat(jwtDecoder.decode(auth.accessToken()).getSubject())
                .isEqualTo(persisted.getId().toString());
        assertThat(refreshTokenRepository.findByTokenHash(auth.refreshToken())).isEmpty();
        assertThat(refreshTokenRepository.count()).isEqualTo(1);
    }

    @Test
    void refreshTokensRotateAndCannotBeReused() {
        ApiModels.AuthResponse original = register("Maya", "maya", "maya@example.com");
        ApiModels.AuthResponse rotated = authService.refresh(
                new ApiModels.RefreshRequest(original.refreshToken()));

        assertThat(rotated.refreshToken()).isNotEqualTo(original.refreshToken());
        assertThat(rotated.accessToken()).isNotEqualTo(original.accessToken());
        assertThatThrownBy(() -> authService.refresh(
                new ApiModels.RefreshRequest(original.refreshToken())))
                .isInstanceOf(AuthService.InvalidRefreshTokenException.class);
        assertThatThrownBy(() -> authService.refresh(
                new ApiModels.RefreshRequest(rotated.refreshToken())))
                .isInstanceOf(AuthService.InvalidRefreshTokenException.class);
    }

    @Test
    void logoutRevokesTheRefreshToken() {
        ApiModels.AuthResponse auth = register("Maya", "maya", "maya@example.com");
        authService.logout(new ApiModels.LogoutRequest(auth.refreshToken()));

        assertThatThrownBy(() -> authService.refresh(
                new ApiModels.RefreshRequest(auth.refreshToken())))
                .isInstanceOf(AuthService.InvalidRefreshTokenException.class);
    }

    @Test
    void deletingAnAccountCascadesItsPrivateDataAndOwnedGroups() {
        ApiModels.UserResponse owner = register("Owner", "owner", "owner@example.com").user();
        ApiModels.UserResponse friend = register("Friend", "friend", "friend@example.com").user();
        acceptFriendship(owner, friend);
        socialService.syncUsage(owner.id(), usage(80));
        socialService.createComparisonGroup(
                owner.id(),
                new ApiModels.CreateComparisonGroupRequest("Owned group", List.of(friend.id())),
                LocalDate.now());

        socialService.deleteAccount(owner.id());

        assertThat(userRepository.findById(owner.id())).isEmpty();
        assertThat(comparisonGroupRepository.count()).isZero();
        assertThat(refreshTokenRepository.findAllByUser_IdAndRevokedAtIsNull(owner.id())).isEmpty();
        assertThat(socialService.getCircle(friend.id(), LocalDate.now()))
                .extracting(ApiModels.CircleMember::username)
                .containsExactly("friend");
    }

    @Test
    void usernamesAreUniqueIgnoringCase() {
        register("Maya", "MayaMoves", "maya@example.com");

        assertThatThrownBy(() -> register("Someone else", "mayamoves", "other@example.com"))
                .isInstanceOf(SocialService.ConflictException.class);
    }

    @Test
    void registrationRejectsPasswordsThatExceedBcryptsUtf8ByteLimit() {
        String unicodePassword = "🙂".repeat(19);

        assertThatThrownBy(() -> authService.register(new ApiModels.RegisterRequest(
                "Maya", "maya", "maya@example.com", unicodePassword)))
                .isInstanceOf(SocialService.InvalidRequestException.class)
                .hasMessageContaining("72 bytes");
    }

    @Test
    void acceptedFriendsAppearInTheCircleButStrangersNeverDo() {
        ApiModels.UserResponse sender = register("Sender", "sender", "sender@example.com").user();
        ApiModels.UserResponse receiver = register("Receiver", "receiver", "receiver@example.com").user();
        register("Stranger", "stranger", "stranger@example.com");

        ApiModels.FriendshipResponse request = socialService.requestFriend(sender.id(), receiver.username());
        socialService.acceptFriend(request.id(), receiver.id());
        socialService.syncUsage(sender.id(), usage(120));
        socialService.syncUsage(receiver.id(), usage(90));

        assertThat(socialService.getCircle(sender.id(), LocalDate.now()))
                .extracting(ApiModels.CircleMember::username)
                .containsExactly("receiver", "sender")
                .doesNotContain("stranger");
    }

    @Test
    void onlyTheAuthenticatedRecipientIdentityCanAcceptARequest() {
        ApiModels.UserResponse sender = register("Sender", "sender", "sender@example.com").user();
        ApiModels.UserResponse receiver = register("Receiver", "receiver", "receiver@example.com").user();
        ApiModels.FriendshipResponse request = socialService.requestFriend(sender.id(), receiver.username());

        assertThatThrownBy(() -> socialService.acceptFriend(request.id(), sender.id()))
                .isInstanceOf(SocialService.ForbiddenException.class);
    }

    @Test
    void recipientsCanDeclineAndThePairCanSendANewRequestLater() {
        ApiModels.UserResponse sender = register("Sender", "sender", "sender@example.com").user();
        ApiModels.UserResponse receiver = register("Receiver", "receiver", "receiver@example.com").user();
        ApiModels.FriendshipResponse request = socialService.requestFriend(sender.id(), receiver.username());

        ApiModels.FriendshipResponse declined = socialService.declineFriend(request.id(), receiver.id());

        assertThat(declined.status()).isEqualTo("DECLINED");
        assertThat(socialService.pendingRequests(receiver.id())).isEmpty();
        assertThat(socialService.requestFriend(sender.id(), receiver.username()).id())
                .isNotEqualTo(request.id());
    }

    @Test
    void eitherFriendCanRemoveAnAcceptedFriendship() {
        ApiModels.UserResponse first = register("First", "first", "first@example.com").user();
        ApiModels.UserResponse second = register("Second", "second", "second@example.com").user();
        acceptFriendship(first, second);

        socialService.removeFriend(second.id(), first.id());

        assertThat(socialService.getCircle(first.id(), LocalDate.now()))
                .extracting(ApiModels.CircleMember::username)
                .containsExactly("first");
        assertThat(socialService.getCircle(second.id(), LocalDate.now()))
                .extracting(ApiModels.CircleMember::username)
                .containsExactly("second");
    }

    @Test
    void syncingTheSameDayUpdatesInsteadOfCreatingADuplicate() {
        ApiModels.UserResponse user = register("Maya", "maya", "maya@example.com").user();

        socialService.syncUsage(user.id(), usage(120));
        ApiModels.UsageResponse updated = socialService.syncUsage(user.id(), usage(180));

        assertThat(updated.totalMinutes()).isEqualTo(180);
        assertThat(socialService.getCircle(user.id(), LocalDate.now()))
                .singleElement()
                .extracting(member -> member.usage().totalMinutes())
                .isEqualTo(180);
    }

    @Test
    void anEmptyUsageDayCanBeSynced() {
        ApiModels.UserResponse user = register("Maya", "maya", "maya@example.com").user();
        ApiModels.SyncUsageRequest emptyDay = new ApiModels.SyncUsageRequest(
                LocalDate.now(), 0, 0, List.of());

        ApiModels.UsageResponse saved = socialService.syncUsage(user.id(), emptyDay);

        assertThat(saved.totalMinutes()).isZero();
        assertThat(saved.apps()).isEmpty();
    }

    @Test
    void appBreakdownPrivacyKeepsTotalsVisibleButHidesAppsFromFriends() {
        ApiModels.UserResponse owner = register("Owner", "owner", "owner@example.com").user();
        ApiModels.UserResponse friend = register("Friend", "friend", "friend@example.com").user();
        acceptFriendship(owner, friend);
        socialService.syncUsage(owner.id(), usage(80));

        socialService.updatePrivacy(owner.id(), false);

        ApiModels.CircleMember friendView = socialService.getCircle(friend.id(), LocalDate.now())
                .stream().filter(member -> member.userId().equals(owner.id())).findFirst().orElseThrow();
        ApiModels.CircleMember selfView = socialService.getCircle(owner.id(), LocalDate.now())
                .stream().filter(member -> member.userId().equals(owner.id())).findFirst().orElseThrow();
        assertThat(friendView.usage().totalMinutes()).isEqualTo(80);
        assertThat(friendView.usage().apps()).isEmpty();
        assertThat(friendView.appBreakdownShared()).isFalse();
        assertThat(selfView.usage().apps()).hasSize(1);
        assertThat(selfView.appBreakdownShared()).isTrue();
    }

    @Test
    void groupCreatorCanAddAcceptedFriendsAndCompareDetailedUsage() {
        ApiModels.UserResponse owner = register("Owner", "owner", "owner@example.com").user();
        ApiModels.UserResponse first = register("First", "first", "first@example.com").user();
        ApiModels.UserResponse second = register("Second", "second", "second@example.com").user();
        acceptFriendship(owner, first);
        acceptFriendship(owner, second);
        socialService.syncUsage(owner.id(), usage(80));
        socialService.syncUsage(first.id(), usage(120));
        socialService.syncUsage(second.id(), usage(60));

        ApiModels.ComparisonGroupResponse group = socialService.createComparisonGroup(
                owner.id(),
                new ApiModels.CreateComparisonGroupRequest(
                        "Weekend reset", List.of(first.id(), second.id())),
                LocalDate.now());

        assertThat(group.name()).isEqualTo("Weekend reset");
        assertThat(group.inviteCode()).hasSize(8);
        assertThat(group.members())
                .extracting(ApiModels.ComparisonGroupMemberResponse::username)
                .containsExactly("second", "owner", "first");
        assertThat(group.members().getFirst().usage().apps()).hasSize(1);
    }

    @Test
    void creatorCannotDirectlyAddSomeoneWhoIsNotAnAcceptedFriend() {
        ApiModels.UserResponse owner = register("Owner", "owner", "owner@example.com").user();
        ApiModels.UserResponse stranger = register("Stranger", "stranger", "stranger@example.com").user();

        assertThatThrownBy(() -> socialService.createComparisonGroup(
                owner.id(),
                new ApiModels.CreateComparisonGroupRequest("Private", List.of(stranger.id())),
                LocalDate.now()))
                .isInstanceOf(SocialService.ForbiddenException.class);
    }

    @Test
    void joiningAGroupMakesTheNewMemberFriendsWithEveryone() {
        ApiModels.UserResponse owner = register("Owner", "owner", "owner@example.com").user();
        ApiModels.UserResponse first = register("First", "first", "first@example.com").user();
        ApiModels.UserResponse joiner = register("Joiner", "joiner", "joiner@example.com").user();
        acceptFriendship(owner, first);
        ApiModels.ComparisonGroupResponse created = socialService.createComparisonGroup(
                owner.id(),
                new ApiModels.CreateComparisonGroupRequest("Three of us", List.of(first.id())),
                LocalDate.now());

        ApiModels.ComparisonGroupResponse joined = socialService.joinComparisonGroup(
                joiner.id(), created.inviteCode(), LocalDate.now());

        assertThat(joined.members())
                .extracting(ApiModels.ComparisonGroupMemberResponse::username)
                .containsExactlyInAnyOrder("owner", "first", "joiner");
        assertThat(socialService.getCircle(joiner.id(), LocalDate.now()))
                .extracting(ApiModels.CircleMember::username)
                .containsExactlyInAnyOrder("joiner", "owner", "first");
    }

    @Test
    void nonMembersCannotReadAGroup() {
        ApiModels.UserResponse owner = register("Owner", "owner", "owner@example.com").user();
        ApiModels.UserResponse friend = register("Friend", "friend", "friend@example.com").user();
        ApiModels.UserResponse stranger = register("Stranger", "stranger", "stranger@example.com").user();
        acceptFriendship(owner, friend);
        ApiModels.ComparisonGroupResponse group = socialService.createComparisonGroup(
                owner.id(),
                new ApiModels.CreateComparisonGroupRequest("Private", List.of(friend.id())),
                LocalDate.now());

        assertThatThrownBy(() -> socialService.getComparisonGroup(
                group.id(), stranger.id(), LocalDate.now()))
                .isInstanceOf(SocialService.ForbiddenException.class);
    }

    @Test
    void membersCanLeaveAndOwnersCanDeleteGroups() {
        ApiModels.UserResponse owner = register("Owner", "owner", "owner@example.com").user();
        ApiModels.UserResponse friend = register("Friend", "friend", "friend@example.com").user();
        acceptFriendship(owner, friend);
        ApiModels.ComparisonGroupResponse group = socialService.createComparisonGroup(
                owner.id(),
                new ApiModels.CreateComparisonGroupRequest("Private", List.of(friend.id())),
                LocalDate.now());

        socialService.leaveOrDeleteComparisonGroup(group.id(), friend.id());
        assertThat(socialService.getComparisonGroup(group.id(), owner.id(), LocalDate.now()).members())
                .extracting(ApiModels.ComparisonGroupMemberResponse::userId)
                .containsExactly(owner.id());

        socialService.leaveOrDeleteComparisonGroup(group.id(), owner.id());
        assertThatThrownBy(() -> socialService.getComparisonGroup(
                group.id(), owner.id(), LocalDate.now()))
                .isInstanceOf(SocialService.NotFoundException.class);
    }

    @Test
    void protectedRoutesRejectMissingTokens() throws Exception {
        mockMvc.perform(get("/api/v1/me"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void healthEndpointIsPublic() throws Exception {
        mockMvc.perform(get("/actuator/health"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("UP"));
    }

    @Test
    void repeatedAuthenticationAttemptsAreRateLimited() throws Exception {
        String invalidLogin = """
                {"email":"nobody@example.com","password":"wrong-password"}
                """;
        for (int attempt = 0; attempt < 10; attempt++) {
            mockMvc.perform(post("/api/v1/auth/login")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(invalidLogin))
                    .andExpect(status().isUnauthorized());
        }
        mockMvc.perform(post("/api/v1/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(invalidLogin))
                .andExpect(status().isTooManyRequests())
                .andExpect(jsonPath("$.code").value("rate_limited"));
    }

    @Test
    void friendRequestRequesterAlwaysComesFromTheJwtSubject() throws Exception {
        ApiModels.AuthResponse sender = register("Sender", "sender", "sender@example.com");
        ApiModels.AuthResponse receiver = register("Receiver", "receiver", "receiver@example.com");

        mockMvc.perform(post("/api/v1/friend-requests")
                        .header("Authorization", "Bearer " + sender.accessToken())
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("""
                                {
                                  "addresseeUsername": "receiver",
                                  "requesterId": "%s"
                                }
                                """.formatted(receiver.user().id())))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.requester.id").value(sender.user().id().toString()))
                .andExpect(jsonPath("$.addressee.id").value(receiver.user().id().toString()));
    }

    private ApiModels.AuthResponse register(String name, String username, String email) {
        return authService.register(new ApiModels.RegisterRequest(
                name, username, email, "correct-horse-battery-staple"));
    }

    private ApiModels.SyncUsageRequest usage(int totalMinutes) {
        return new ApiModels.SyncUsageRequest(
                LocalDate.now(),
                totalMinutes,
                20,
                List.of(new ApiModels.AppUsageRequest("app.demo", "Demo", 30)));
    }

    private void acceptFriendship(ApiModels.UserResponse first, ApiModels.UserResponse second) {
        ApiModels.FriendshipResponse request = socialService.requestFriend(
                first.id(), second.username());
        socialService.acceptFriend(request.id(), second.id());
    }
}
