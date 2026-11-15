package com.screentimesocial.service;

import com.screentimesocial.api.ApiModels;
import com.screentimesocial.model.RefreshTokenEntity;
import com.screentimesocial.model.UserEntity;
import com.screentimesocial.repository.RefreshTokenRepository;
import com.screentimesocial.repository.UserRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Locale;

@Service
public class AuthService {

    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtEncoder jwtEncoder;
    private final Duration accessTokenTtl;
    private final Duration refreshTokenTtl;

    public AuthService(
            UserRepository userRepository,
            RefreshTokenRepository refreshTokenRepository,
            PasswordEncoder passwordEncoder,
            JwtEncoder jwtEncoder,
            @Value("${app.security.access-token-ttl}") Duration accessTokenTtl,
            @Value("${app.security.refresh-token-ttl}") Duration refreshTokenTtl
    ) {
        this.userRepository = userRepository;
        this.refreshTokenRepository = refreshTokenRepository;
        this.passwordEncoder = passwordEncoder;
        this.jwtEncoder = jwtEncoder;
        this.accessTokenTtl = accessTokenTtl;
        this.refreshTokenTtl = refreshTokenTtl;
    }

    @Transactional
    public ApiModels.AuthResponse register(ApiModels.RegisterRequest request) {
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new SocialService.InvalidRequestException(
                    "Password must be at most 72 bytes when encoded as UTF-8");
        }
        String email = normalizeEmail(request.email());
        String username = SocialService.normalizeUsername(request.username());
        if (userRepository.existsByEmailIgnoreCase(email)) {
            throw new SocialService.ConflictException("An account already exists for this email");
        }
        if (userRepository.existsByUsernameIgnoreCase(username)) {
            throw new SocialService.ConflictException("Username @" + username + " is already taken");
        }

        UserEntity user = new UserEntity(
                email,
                passwordEncoder.encode(request.password()),
                request.displayName().trim(),
                username);
        try {
            userRepository.saveAndFlush(user);
        } catch (DataIntegrityViolationException exception) {
            throw new SocialService.ConflictException("Email or username is already in use");
        }
        return issueSession(user);
    }

    @Transactional
    public ApiModels.AuthResponse login(ApiModels.LoginRequest request) {
        if (request.password().getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new InvalidCredentialsException();
        }
        UserEntity user = userRepository.findByEmailIgnoreCase(normalizeEmail(request.email()))
                .orElseThrow(InvalidCredentialsException::new);
        if (!passwordEncoder.matches(request.password(), user.getPasswordHash())) {
            throw new InvalidCredentialsException();
        }
        return issueSession(user);
    }

    @Transactional(noRollbackFor = InvalidRefreshTokenException.class)
    public ApiModels.AuthResponse refresh(ApiModels.RefreshRequest request) {
        String currentHash = hashToken(request.refreshToken());
        RefreshTokenEntity current = refreshTokenRepository.findForUpdateByTokenHash(currentHash)
                .orElseThrow(InvalidRefreshTokenException::new);
        Instant now = Instant.now();
        if (!current.isUsableAt(now)) {
            if (current.getRevokedAt() != null) {
                refreshTokenRepository.findAllByUser_IdAndRevokedAtIsNull(current.getUser().getId())
                        .forEach(token -> token.revoke("reuse_detected", null));
            }
            throw new InvalidRefreshTokenException();
        }

        RefreshTokenValue replacement = createRefreshToken(current.getUser());
        current.revoke("rotated", replacement.hash());
        refreshTokenRepository.save(replacement.entity());
        return authResponse(current.getUser(), replacement);
    }

    @Transactional
    public void logout(ApiModels.LogoutRequest request) {
        refreshTokenRepository.findForUpdateByTokenHash(hashToken(request.refreshToken()))
                .ifPresent(token -> token.revoke("logout", null));
    }

    private ApiModels.AuthResponse issueSession(UserEntity user) {
        RefreshTokenValue refreshToken = createRefreshToken(user);
        refreshTokenRepository.save(refreshToken.entity());
        return authResponse(user, refreshToken);
    }

    private ApiModels.AuthResponse authResponse(UserEntity user, RefreshTokenValue refreshToken) {
        return new ApiModels.AuthResponse(
                issueAccessToken(user),
                accessTokenTtl.toSeconds(),
                refreshToken.raw(),
                refreshToken.entity().getExpiresAt(),
                SocialService.toUserResponse(user));
    }

    private String issueAccessToken(UserEntity user) {
        Instant issuedAt = Instant.now();
        Instant expiresAt = issuedAt.plus(accessTokenTtl);
        JwtClaimsSet claims = JwtClaimsSet.builder()
                .issuer("screen-time-social-api")
                .issuedAt(issuedAt)
                .expiresAt(expiresAt)
                .subject(user.getId().toString())
                .id(java.util.UUID.randomUUID().toString())
                .claim("username", user.getUsername())
                .build();
        JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
        return jwtEncoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
    }

    private RefreshTokenValue createRefreshToken(UserEntity user) {
        byte[] randomBytes = new byte[48];
        SECURE_RANDOM.nextBytes(randomBytes);
        String rawToken = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        String hash = hashToken(rawToken);
        RefreshTokenEntity entity = new RefreshTokenEntity(
                user, hash, Instant.now().plus(refreshTokenTtl));
        return new RefreshTokenValue(rawToken, hash, entity);
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(rawToken.getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private String normalizeEmail(String email) {
        return email.trim().toLowerCase(Locale.ROOT);
    }

    private record RefreshTokenValue(String raw, String hash, RefreshTokenEntity entity) {
    }

    public static class InvalidCredentialsException extends RuntimeException {
        public InvalidCredentialsException() {
            super("Invalid email or password");
        }
    }

    public static class InvalidRefreshTokenException extends RuntimeException {
        public InvalidRefreshTokenException() {
            super("Refresh token is invalid or expired");
        }
    }
}
