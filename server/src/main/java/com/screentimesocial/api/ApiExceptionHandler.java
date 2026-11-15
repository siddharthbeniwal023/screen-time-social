package com.screentimesocial.api;

import com.screentimesocial.service.AuthService;
import com.screentimesocial.service.SocialService;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.time.Instant;
import java.util.Map;
import jakarta.validation.ConstraintViolationException;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(SocialService.NotFoundException.class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    ErrorResponse notFound(SocialService.NotFoundException exception) {
        return error("not_found", exception.getMessage());
    }

    @ExceptionHandler(SocialService.ConflictException.class)
    @ResponseStatus(HttpStatus.CONFLICT)
    ErrorResponse conflict(SocialService.ConflictException exception) {
        return error("conflict", exception.getMessage());
    }

    @ExceptionHandler(SocialService.ForbiddenException.class)
    @ResponseStatus(HttpStatus.FORBIDDEN)
    ErrorResponse forbidden(SocialService.ForbiddenException exception) {
        return error("forbidden", exception.getMessage());
    }

    @ExceptionHandler(SocialService.InvalidRequestException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponse invalidRequest(SocialService.InvalidRequestException exception) {
        return error("invalid_request", exception.getMessage());
    }

    @ExceptionHandler(AuthService.InvalidCredentialsException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    ErrorResponse invalidCredentials(AuthService.InvalidCredentialsException exception) {
        return error("invalid_credentials", exception.getMessage());
    }

    @ExceptionHandler(AuthService.InvalidRefreshTokenException.class)
    @ResponseStatus(HttpStatus.UNAUTHORIZED)
    ErrorResponse invalidRefreshToken(AuthService.InvalidRefreshTokenException exception) {
        return error("invalid_refresh_token", exception.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponse invalidRequest(MethodArgumentNotValidException exception) {
        Map<String, String> fields = exception.getBindingResult().getFieldErrors().stream()
                .collect(java.util.stream.Collectors.toMap(
                        fieldError -> fieldError.getField(),
                        fieldError -> fieldError.getDefaultMessage() == null
                                ? "is invalid"
                                : fieldError.getDefaultMessage(),
                        (first, ignored) -> first));
        return new ErrorResponse("invalid_request", "Please check the request", fields, Instant.now());
    }

    @ExceptionHandler(ConstraintViolationException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponse invalidParameter(ConstraintViolationException exception) {
        Map<String, String> fields = exception.getConstraintViolations().stream()
                .collect(java.util.stream.Collectors.toMap(
                        violation -> violation.getPropertyPath().toString(),
                        jakarta.validation.ConstraintViolation::getMessage,
                        (first, ignored) -> first));
        return new ErrorResponse(
                "invalid_request", "Please check the request", fields, Instant.now());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    ErrorResponse unreadableRequest(HttpMessageNotReadableException exception) {
        return error("invalid_request", "The request body is missing or malformed");
    }

    private ErrorResponse error(String code, String message) {
        return new ErrorResponse(code, message, Map.of(), Instant.now());
    }

    record ErrorResponse(String code, String message, Map<String, String> fields, Instant timestamp) {
    }
}
