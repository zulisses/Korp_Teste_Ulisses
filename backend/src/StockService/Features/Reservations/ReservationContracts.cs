namespace StockService.Features.Reservations;

public sealed record SetReservationRequest(int Quantity);
public sealed record ReservationResponse(Guid InvoiceId, Guid ProductId, int Quantity, string State, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
internal sealed record InvoiceReservationCommand(Guid InvoiceId);

