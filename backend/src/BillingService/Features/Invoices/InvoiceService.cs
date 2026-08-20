using BillingService.Domain;
using BillingService.Infrastructure.Idempotency;
using BillingService.Infrastructure.Persistence;
using BillingService.Integrations;
using Microsoft.EntityFrameworkCore;

namespace BillingService.Features.Invoices;

public sealed class InvoiceService(BillingDbContext db, StockClient stockClient, TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<InvoiceResponse>> ListAsync(CancellationToken cancellationToken)
    {
        var invoices = await db.Invoices.AsNoTracking()
            .Include(invoice => invoice.Lines)
            .OrderByDescending(invoice => invoice.Number)
            .ToListAsync(cancellationToken);

        return invoices.Select(ToResponse).ToList();
    }

    public async Task<InvoiceResponse?> GetAsync(Guid id, CancellationToken cancellationToken)
    {
        var invoice = await db.Invoices.AsNoTracking()
            .Include(item => item.Lines)
            .SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        return invoice is null ? null : ToResponse(invoice);
    }

    public async Task<IdempotentResponse> CreateAsync(CancellationToken cancellationToken)
    {
        var invoice = Invoice.Create(timeProvider.GetUtcNow());
        db.Invoices.Add(invoice);
        await db.SaveChangesAsync(cancellationToken);
        return IdempotentResponse.Created(ToResponse(invoice));
    }

    public async Task<IdempotentResponse> SetLineAsync(Guid invoiceId, Guid productId, SetInvoiceLineRequest request, string idempotencyKey, CancellationToken cancellationToken)
    {
        if (invoiceId == Guid.Empty || productId == Guid.Empty) return IdempotentResponse.Validation("Invoice id and product id are required.");
        if (request.Quantity < 0) return IdempotentResponse.Validation("Invoice line quantity cannot be negative.");

        var invoice = await FindForUpdateAsync(invoiceId, cancellationToken);
        if (invoice is null) return IdempotentResponse.NotFound("Invoice not found.");
        if (invoice.Status == InvoiceStatus.Closed) return IdempotentResponse.Conflict("Closed invoices cannot be changed.");
        if (invoice.IsCancelled) return IdempotentResponse.Conflict("Cancelled invoices cannot be changed.");

        var currentLine = invoice.Lines.SingleOrDefault(line => line.ProductId == productId);
        if (request.Quantity == 0 && currentLine is null) return IdempotentResponse.NotFound("Invoice line not found.");
        if (currentLine?.Quantity == request.Quantity) return IdempotentResponse.Ok(ToResponse(invoice));

        var stockResult = await stockClient.SetReservationAsync(invoiceId, productId, request.Quantity, idempotencyKey, cancellationToken);
        if (!stockResult.IsSuccess) return FromStockFailure(stockResult);

        if (request.Quantity == 0) invoice.RemoveLine(productId);
        else invoice.SetLine(productId, request.Quantity);
        return IdempotentResponse.Ok(ToResponse(invoice));
    }

    public async Task<IdempotentResponse> CancelAsync(Guid invoiceId, string idempotencyKey, CancellationToken cancellationToken)
    {
        var invoice = await FindForUpdateAsync(invoiceId, cancellationToken);
        if (invoice is null) return IdempotentResponse.NotFound("Invoice not found.");
        if (invoice.Status == InvoiceStatus.Closed) return IdempotentResponse.Conflict("Closed invoices cannot be cancelled.");
        if (invoice.IsCancelled) return IdempotentResponse.NoContent();

        if (invoice.Lines.Count > 0)
        {
            var stockResult = await stockClient.ReleaseAsync(invoiceId, idempotencyKey, cancellationToken);
            if (!stockResult.IsSuccess) return FromStockFailure(stockResult);
        }

        invoice.Cancel(timeProvider.GetUtcNow());
        return IdempotentResponse.NoContent();
    }

    public async Task<IdempotentResponse> PrintAsync(Guid invoiceId, string idempotencyKey, CancellationToken cancellationToken)
    {
        var invoice = await FindForUpdateAsync(invoiceId, cancellationToken);
        if (invoice is null) return IdempotentResponse.NotFound("Invoice not found.");
        if (invoice.Status == InvoiceStatus.Closed) return IdempotentResponse.Conflict("The invoice is already closed.");
        if (invoice.IsCancelled) return IdempotentResponse.Conflict("Cancelled invoices cannot be printed.");
        if (invoice.Lines.Count == 0) return IdempotentResponse.Validation("An invoice without lines cannot be printed.");

        var stockResult = await stockClient.ConsumeWithRetryAsync(invoiceId, idempotencyKey, cancellationToken);
        if (!stockResult.IsSuccess) return FromStockFailure(stockResult);

        invoice.Close(timeProvider.GetUtcNow());
        return IdempotentResponse.Ok(ToResponse(invoice));
    }

    private Task<Invoice?> FindForUpdateAsync(Guid invoiceId, CancellationToken cancellationToken) =>
        db.Invoices.Include(invoice => invoice.Lines).SingleOrDefaultAsync(invoice => invoice.Id == invoiceId, cancellationToken);

    private static IdempotentResponse FromStockFailure(StockOperationResult result)
    {
        var detail = result.Detail ?? "The stock operation could not be completed.";
        return result.StatusCode switch
        {
            StatusCodes.Status400BadRequest => IdempotentResponse.Validation(detail),
            StatusCodes.Status404NotFound => IdempotentResponse.NotFound(detail),
            StatusCodes.Status409Conflict => IdempotentResponse.Conflict(detail),
            >= 500 => IdempotentResponse.Problem(StatusCodes.Status503ServiceUnavailable, "Stock service unavailable", detail),
            _ => IdempotentResponse.Problem(StatusCodes.Status502BadGateway, "Stock service failure", detail)
        };
    }

    private static InvoiceResponse ToResponse(Invoice invoice) => new(
        invoice.Id,
        invoice.Number,
        invoice.Status.ToString(),
        invoice.IsCancelled,
        invoice.CreatedAt,
        invoice.ClosedAt,
        invoice.CancelledAt,
        invoice.Lines.OrderBy(line => line.ProductId).Select(line => new InvoiceLineResponse(line.ProductId, line.Quantity)).ToList());
}
