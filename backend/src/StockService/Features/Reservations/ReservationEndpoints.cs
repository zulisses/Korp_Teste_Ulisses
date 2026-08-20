using StockService.Infrastructure.Idempotency;

namespace StockService.Features.Reservations;

public static class ReservationEndpoints
{
    public static IEndpointRouteBuilder MapReservationEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/reservations");
        group.MapGet("/{invoiceId:guid}", (Guid invoiceId, ReservationService service, CancellationToken cancellationToken) => service.ListAsync(invoiceId, cancellationToken));
        group.MapPut("/{invoiceId:guid}/products/{productId:guid}", SetQuantityAsync);
        group.MapPost("/{invoiceId:guid}/release", ReleaseAllAsync);
        group.MapPost("/{invoiceId:guid}/consume", ConsumeAllAsync);
        return endpoints;
    }

    private static Task<IResult> SetQuantityAsync(Guid invoiceId, Guid productId, SetReservationRequest request, HttpRequest httpRequest, ReservationService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, $"reservations.{invoiceId}.{productId}.set", request, token => service.SetQuantityAsync(invoiceId, productId, request, token), cancellationToken);

    private static Task<IResult> ReleaseAllAsync(Guid invoiceId, HttpRequest httpRequest, ReservationService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, $"reservations.{invoiceId}.release", new InvoiceReservationCommand(invoiceId), token => service.ReleaseAllAsync(invoiceId, token), cancellationToken);

    private static Task<IResult> ConsumeAllAsync(Guid invoiceId, HttpRequest httpRequest, ReservationService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, $"reservations.{invoiceId}.consume", new InvoiceReservationCommand(invoiceId), token => service.ConsumeAllAsync(invoiceId, token), cancellationToken);
}

