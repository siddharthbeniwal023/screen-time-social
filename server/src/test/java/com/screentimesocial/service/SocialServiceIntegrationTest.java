package com.screentimesocial.service;

import com.screentimesocial.api.ApiModels;
import com.screentimesocial.model.UserEntity;
import com.screentimesocial.repository.UserRepository;
import com.screentimesocial.repository.RefreshTokenRepository;
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
    void usernamesAreUniqueIgnoringCase() {
        register("Maya", "MayaMoves", "maya@example.com");

        assertThatThrownBy(() -> register("Someone else", "mayamoves", "other@example.com"))
                .isInstanceOf(SocialService.ConflictException.class);
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
}
