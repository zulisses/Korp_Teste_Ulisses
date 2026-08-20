using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using BillingService.Infrastructure.Persistence;
using Microsoft.EntityFrameworkCore;
using Npgsql;

namespace BillingService.Infrastructure.Idempotency;

public sealed class IdempotencyExecutor(BillingDbContext db, TimeProvider timeProvider)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<IResult> ExecuteAsync<TRequest>(
        HttpRequest httpRequest,
        string operation,
        TRequest request,
        Func<CancellationToken, Task<IdempotentResponse>> command,
        CancellationToken cancellationToken)
    {
        if (!TryGetKey(httpRequest, out var key))
            return ToResult(IdempotentResponse.Validation("The Idempotency-Key header must contain a valid UUID."));

        var requestHash = ComputeHash(request);
        var existing = await db.IdempotencyRecords.AsNoTracking().SingleOrDefaultAsync(x => x.Key == key, cancellationToken);
        if (existing is not null) return ReplayOrConflict(existing, operation, requestHash);

        await using var transaction = await db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            var response = await command(cancellationToken);
            db.IdempotencyRecords.Add(new IdempotencyRecord
            {
                Key = key,
                Operation = operation,
                RequestHash = requestHash,
                ResponseStatusCode = response.StatusCode,
                ResponseBody = JsonSerializer.Serialize(response.Body, JsonOptions),
                CreatedAt = timeProvider.GetUtcNow()
            });
            await db.SaveChangesAsync(cancellationToken);
            await transaction.CommitAsync(cancellationToken);
            return ToResult(response);
        }
        catch (DbUpdateException exception) when (IsConcurrentIdempotencyInsert(exception))
        {
            await transaction.RollbackAsync(cancellationToken);
            db.ChangeTracker.Clear();
            var winner = await db.IdempotencyRecords.AsNoTracking().SingleAsync(x => x.Key == key, cancellationToken);
            return ReplayOrConflict(winner, operation, requestHash);
        }
    }

    private static bool TryGetKey(HttpRequest request, out Guid key)
    {
        key = Guid.Empty;
        return request.Headers.TryGetValue("Idempotency-Key", out var value) && Guid.TryParse(value.ToString(), out key);
    }

    private static string ComputeHash<TRequest>(TRequest request)
    {
        var json = JsonSerializer.Serialize(request, JsonOptions);
        return Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(json))).ToLowerInvariant();
    }

    private static bool IsConcurrentIdempotencyInsert(DbUpdateException exception) =>
        exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "PK_idempotency_records" };

    private static IResult ReplayOrConflict(IdempotencyRecord existing, string operation, string requestHash)
    {
        if (!string.Equals(existing.Operation, operation, StringComparison.Ordinal) ||
            !string.Equals(existing.RequestHash, requestHash, StringComparison.Ordinal))
            return ToResult(IdempotentResponse.Conflict("The idempotency key was already used for a different operation or payload."));

        return existing.ResponseStatusCode == StatusCodes.Status204NoContent
            ? Results.StatusCode(existing.ResponseStatusCode)
            : Results.Text(existing.ResponseBody, "application/json", Encoding.UTF8, existing.ResponseStatusCode);
    }

    private static IResult ToResult(IdempotentResponse response) => response.StatusCode == StatusCodes.Status204NoContent
        ? Results.StatusCode(response.StatusCode)
        : Results.Json(response.Body, statusCode: response.StatusCode, options: JsonOptions);
}

