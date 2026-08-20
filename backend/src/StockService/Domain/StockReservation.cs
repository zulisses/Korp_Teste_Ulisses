namespace StockService.Domain;

public sealed class StockReservation
{
    private StockReservation() { }

    public static StockReservation Create(Guid invoiceId, Guid productId, int quantity, DateTimeOffset now)
    {
        if (invoiceId == Guid.Empty) throw new ArgumentException("Invoice id is required.", nameof(invoiceId));
        if (productId == Guid.Empty) throw new ArgumentException("Product id is required.", nameof(productId));
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity), "Reservation quantity must be positive.");
        return new StockReservation { Id = Guid.NewGuid(), InvoiceId = invoiceId, ProductId = productId, Quantity = quantity, State = ReservationState.Active, CreatedAt = now, UpdatedAt = now };
    }

    public void SetQuantity(int quantity, DateTimeOffset now)
    {
        if (State != ReservationState.Active) throw new InvalidOperationException("Only active reservations can be adjusted.");
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity), "Reservation quantity must be positive.");
        Quantity = quantity;
        UpdatedAt = now;
    }

    public void Reactivate(int quantity, DateTimeOffset now)
    {
        if (State != ReservationState.Released) throw new InvalidOperationException("Only released reservations can be reactivated.");
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity), "Reservation quantity must be positive.");
        Quantity = quantity;
        State = ReservationState.Active;
        UpdatedAt = now;
    }

    public void Release(DateTimeOffset now)
    {
        if (State != ReservationState.Active) throw new InvalidOperationException("Only active reservations can be released.");
        State = ReservationState.Released;
        UpdatedAt = now;
    }

    public void Consume(DateTimeOffset now)
    {
        if (State != ReservationState.Active) throw new InvalidOperationException("Only active reservations can be consumed.");
        State = ReservationState.Consumed;
        UpdatedAt = now;
    }

    public Guid Id { get; private set; }
    public Guid InvoiceId { get; private set; }
    public Guid ProductId { get; private set; }
    public int Quantity { get; private set; }
    public ReservationState State { get; private set; }
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }
    public Product Product { get; private set; } = null!;
}

public enum ReservationState { Active = 1, Consumed = 2, Released = 3 }
