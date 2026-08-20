namespace BillingService.Domain;

public sealed class InvoiceLine
{
    private InvoiceLine() { }

    internal static InvoiceLine Create(Guid invoiceId, Guid productId, int quantity) => new()
    {
        Id = Guid.NewGuid(),
        InvoiceId = invoiceId,
        ProductId = productId,
        Quantity = quantity
    };

    public Guid Id { get; private set; }
    public Guid InvoiceId { get; private set; }
    public Guid ProductId { get; private set; }
    public int Quantity { get; private set; }
    public Invoice Invoice { get; private set; } = null!;

    internal void SetQuantity(int quantity)
    {
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity), "Invoice line quantity must be positive.");
        Quantity = quantity;
    }
}
