namespace BillingService.Infrastructure.Idempotency;

public sealed record IdempotentResponse(int StatusCode, object? Body = null)
{
    public static IdempotentResponse Ok(object body) => new(StatusCodes.Status200OK, body);
    public static IdempotentResponse Created(object body) => new(StatusCodes.Status201Created, body);
    public static IdempotentResponse NoContent() => new(StatusCodes.Status204NoContent);
    public static IdempotentResponse NotFound(string detail) => Problem(StatusCodes.Status404NotFound, "Resource not found", detail);
    public static IdempotentResponse Conflict(string detail) => Problem(StatusCodes.Status409Conflict, "Operation conflict", detail);
    public static IdempotentResponse Validation(string detail) => Problem(StatusCodes.Status400BadRequest, "Validation failed", detail);

    public static IdempotentResponse Problem(int status, string title, string detail) =>
        new(status, new { type = $"https://httpstatuses.com/{status}", title, status, detail });
}

