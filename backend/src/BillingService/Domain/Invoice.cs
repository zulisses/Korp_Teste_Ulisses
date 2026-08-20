namespace BillingService.Domain;

public sealed class Invoice
{
    private Invoice() { }

    public static Invoice Create(DateTimeOffset now) => new()
    {
        Id = Guid.NewGuid(),
        CreatedAt = now
    };

    public Guid Id { get; private set; }
    public long Number { get; private set; }
    public InvoiceStatus Status { get; private set; } = InvoiceStatus.Open;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset? ClosedAt { get; private set; }
    public DateTimeOffset? CancelledAt { get; private set; }
    public List<InvoiceLine> Lines { get; private set; } = [];

    public bool IsCancelled => CancelledAt.HasValue;

    public void SetLine(Guid productId, int quantity)
    {
        EnsureEditable();
        if (productId == Guid.Empty) throw new ArgumentException("Product id is required.", nameof(productId));
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity), "Invoice line quantity must be positive.");

        var line = Lines.SingleOrDefault(item => item.ProductId == productId);
        if (line is null) Lines.Add(InvoiceLine.Create(Id, productId, quantity));
        else line.SetQuantity(quantity);
    }

    public bool RemoveLine(Guid productId)
    {
        EnsureEditable();
        var line = Lines.SingleOrDefault(item => item.ProductId == productId);
        return line is not null && Lines.Remove(line);
    }

    public void Cancel(DateTimeOffset now)
    {
        EnsureEditable();
        CancelledAt = now;
    }

    public void Close(DateTimeOffset now)
    {
        EnsureEditable();
        if (Lines.Count == 0) throw new InvalidOperationException("An invoice without lines cannot be closed.");

        Status = InvoiceStatus.Closed;
        ClosedAt = now;
    }

    private void EnsureEditable()
    {
        if (Status == InvoiceStatus.Closed) throw new InvalidOperationException("Closed invoices cannot be changed.");
        if (IsCancelled) throw new InvalidOperationException("Cancelled invoices cannot be changed.");
    }
}

public enum InvoiceStatus { Open = 1, Closed = 2 }
