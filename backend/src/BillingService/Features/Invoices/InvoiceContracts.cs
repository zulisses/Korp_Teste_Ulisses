namespace BillingService.Features.Invoices;

public sealed record SetInvoiceLineRequest(int Quantity);
public sealed record InvoiceLineResponse(Guid ProductId, int Quantity);
public sealed record InvoiceResponse(
    Guid Id,
    long Number,
    string Status,
    bool IsCancelled,
    DateTimeOffset CreatedAt,
    DateTimeOffset? ClosedAt,
    DateTimeOffset? CancelledAt,
    IReadOnlyList<InvoiceLineResponse> Lines);

internal sealed record CreateInvoiceCommand;
internal sealed record InvoiceCommand(Guid InvoiceId);
