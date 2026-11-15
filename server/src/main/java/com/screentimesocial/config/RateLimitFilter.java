package com.screentimesocial.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final long WINDOW_MILLIS = Duration.ofMinutes(1).toMillis();

    private final Map<String, RequestWindow> windows = new ConcurrentHashMap<>();
    private final AtomicLong requestCounter = new AtomicLong();
    private final boolean enabled;
    private final int authenticationLimit;
    private final int refreshLimit;
    private final int searchLimit;

    public RateLimitFilter(
            @Value("${app.rate-limit.enabled:true}") boolean enabled,
            @Value("${app.rate-limit.authentication-per-minute:10}") int authenticationLimit,
            @Value("${app.rate-limit.refresh-per-minute:60}") int refreshLimit,
            @Value("${app.rate-limit.search-per-minute:60}") int searchLimit) {
        this.enabled = enabled;
        this.authenticationLimit = authenticationLimit;
        this.refreshLimit = refreshLimit;
        this.searchLimit = searchLimit;
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain) throws ServletException, IOException {
        EndpointLimit endpoint = endpointLimit(request);
        if (!enabled || endpoint == null) {
            filterChain.doFilter(request, response);
            return;
        }

        long now = System.currentTimeMillis();
        String key = request.getRemoteAddr() + ':' + endpoint.category();
        Decision decision = windows.computeIfAbsent(key, ignored -> new RequestWindow(now))
                .tryAcquire(now, endpoint.requests());
        occasionallyDiscardExpiredWindows(now);

        response.setHeader("X-RateLimit-Limit", Integer.toString(endpoint.requests()));
        response.setHeader("X-RateLimit-Remaining", Integer.toString(decision.remaining()));
        if (decision.allowed()) {
            filterChain.doFilter(request, response);
            return;
        }

        response.setStatus(429);
        response.setHeader("Retry-After", Long.toString(decision.retryAfterSeconds()));
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.getWriter().write("{\"code\":\"rate_limited\",\"message\":\"Too many requests. Please try again shortly.\"}");
    }

    private EndpointLimit endpointLimit(HttpServletRequest request) {
        String path = request.getRequestURI();
        String method = request.getMethod();
        if ("POST".equals(method) && (path.equals("/api/v1/auth/login") || path.equals("/api/v1/auth/register"))) {
            return new EndpointLimit("authentication", authenticationLimit);
        }
        if ("POST".equals(method) && path.equals("/api/v1/auth/refresh")) {
            return new EndpointLimit("refresh", refreshLimit);
        }
        if ("GET".equals(method) && (path.equals("/api/v1/users/search")
                || path.startsWith("/api/v1/usernames/"))) {
            return new EndpointLimit("username-search", searchLimit);
        }
        return null;
    }

    private void occasionallyDiscardExpiredWindows(long now) {
        if (requestCounter.incrementAndGet() % 1_000 == 0) {
            windows.entrySet().removeIf(entry -> entry.getValue().expiredBefore(now - WINDOW_MILLIS));
        }
    }

    private record EndpointLimit(String category, int requests) {
    }

    private record Decision(boolean allowed, int remaining, long retryAfterSeconds) {
    }

    private static final class RequestWindow {
        private long startedAt;
        private int requests;

        private RequestWindow(long startedAt) {
            this.startedAt = startedAt;
        }

        private synchronized Decision tryAcquire(long now, int limit) {
            if (now - startedAt >= WINDOW_MILLIS) {
                startedAt = now;
                requests = 0;
            }
            if (requests >= limit) {
                long retryAfter = Math.max(1, (WINDOW_MILLIS - (now - startedAt) + 999) / 1_000);
                return new Decision(false, 0, retryAfter);
            }
            requests++;
            return new Decision(true, limit - requests, 0);
        }

        private synchronized boolean expiredBefore(long cutoff) {
            return startedAt < cutoff;
        }
    }
}
