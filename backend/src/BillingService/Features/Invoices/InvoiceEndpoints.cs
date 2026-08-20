using BillingService.Infrastructure.Idempotency;

namespace BillingService.Features.Invoices;

public static class InvoiceEndpoints
{
    public static IEndpointRouteBuilder MapInvoiceEndpoints(this IEndpointRouteBuilder endpoints)
    {
        var group = endpoints.MapGroup("/api/invoices");
        group.MapGet("/", (InvoiceService service, CancellationToken cancellationToken) => service.ListAsync(cancellationToken));
        group.MapGet("/{id:guid}", async (Guid id, InvoiceService service, CancellationToken cancellationToken) =>
            await service.GetAsync(id, cancellationToken) is { } invoice ? Results.Ok(invoice) : Results.NotFound());
        group.MapPost("/", CreateAsync);
        group.MapPut("/{invoiceId:guid}/products/{productId:guid}", SetLineAsync);
        group.MapPost("/{invoiceId:guid}/cancel", CancelAsync);
        group.MapPost("/{invoiceId:guid}/print", PrintAsync);
        return endpoints;
    }

    private static Task<IResult> CreateAsync(HttpRequest httpRequest, InvoiceService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, "invoices.create", new CreateInvoiceCommand(), service.CreateAsync, cancellationToken);

    private static Task<IResult> SetLineAsync(Guid invoiceId, Guid productId, SetInvoiceLineRequest request, HttpRequest httpRequest, InvoiceService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, $"invoices.{invoiceId}.products.{productId}.set", request, token => service.SetLineAsync(invoiceId, productId, request, GetIdempotencyKey(httpRequest), token), cancellationToken);

    private static Task<IResult> CancelAsync(Guid invoiceId, HttpRequest httpRequest, InvoiceService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, $"invoices.{invoiceId}.cancel", new InvoiceCommand(invoiceId), token => service.CancelAsync(invoiceId, GetIdempotencyKey(httpRequest), token), cancellationToken);

    private static Task<IResult> PrintAsync(Guid invoiceId, HttpRequest httpRequest, InvoiceService service, IdempotencyExecutor idempotency, CancellationToken cancellationToken) =>
        idempotency.ExecuteAsync(httpRequest, $"invoices.{invoiceId}.print", new InvoiceCommand(invoiceId), token => service.PrintAsync(invoiceId, GetIdempotencyKey(httpRequest), token), cancellationToken);

    private static string GetIdempotencyKey(HttpRequest request) => request.Headers["Idempotency-Key"].ToString();
}
