namespace StockService.Domain;

public sealed class StockMovement
{
    private StockMovement() { }

    public static StockMovement Create(Guid productId, Guid? invoiceId, StockMovementType type, int quantity, DateTimeOffset now)
    {
        if (productId == Guid.Empty) throw new ArgumentException("Product id is required.", nameof(productId));
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity), "Movement quantity must be positive.");
        return new StockMovement { Id = Guid.NewGuid(), ProductId = productId, InvoiceId = invoiceId, Type = type, Quantity = quantity, CreatedAt = now };
    }

    public Guid Id { get; private set; }
    public Guid ProductId { get; private set; }
    public Guid? InvoiceId { get; private set; }
    public StockMovementType Type { get; private set; }
    public int Quantity { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public Product Product { get; private set; } = null!;
}

public enum StockMovementType { InitialBalance = 1, Replenishment = 2, Reservation = 3, ReservationAdjustment = 4, Release = 5, Consumption = 6 }
