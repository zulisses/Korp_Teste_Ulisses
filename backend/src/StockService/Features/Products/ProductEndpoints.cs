using Microsoft.EntityFrameworkCore;
using Npgsql;
using StockService.Infrastructure.Idempotency;

namespace StockService.Features.Products;

public static class ProductEndpoints
{
    public static IEndpointRouteBuilder MapProductEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/products");
        group.MapGet("/", (bool? includeInactive, ProductService service, CancellationToken cancellationToken) =>
            service.ListAsync(includeInactive ?? false, cancellationToken));
        group.MapGet("/{id:guid}", async (Guid id, ProductService service, CancellationToken cancellationToken) =>
            await service.GetAsync(id, cancellationToken) is { } product ? Results.Ok(product) : Results.NotFound());
        group.MapPost("/", CreateAsync);
        group.MapPost("/{id:guid}/replenishments", ReplenishAsync);
        group.MapPut("/{id:guid}/activation", SetActiveAsync);
        return endpoints;
    }

    private static async Task<IResult> CreateAsync(CreateProductRequest request, HttpRequest httpRequest, ProductService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken)
    {
        try
        {
            return await idempotency.ExecuteAsync(httpRequest, "products.create", request, token => service.CreateAsync(request, token), cancellationToken);
        }
        catch (DbUpdateException exception) when (exception.InnerException is PostgresException { SqlState: PostgresErrorCodes.UniqueViolation, ConstraintName: "ux_products_code" })
        {
            return Results.Conflict(new { type = "https://httpstatuses.com/409", title = "Operation conflict", status = 409, detail = "A product with this code already exists." });
        }
    }

    private static Task<IResult> ReplenishAsync(Guid id, ReplenishProductRequest request, HttpRequest httpRequest, ProductService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, $"products.{id}.replenish", request, token => service.ReplenishAsync(id, request, token), cancellationToken);

    private static Task<IResult> SetActiveAsync(Guid id, SetProductActiveRequest request, HttpRequest httpRequest, ProductService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, $"products.{id}.activation", request, token => service.SetActiveAsync(id, request, token), cancellationToken);
}
