using Microsoft.EntityFrameworkCore;
using StockService.Domain;
using StockService.Infrastructure.Idempotency;
using StockService.Infrastructure.Persistence;

namespace StockService.Features.Reservations;

public sealed class ReservationService(StockDbContext db, TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<ReservationResponse>> ListAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        var reservations = await db.Reservations.AsNoTracking()
            .Where(reservation => reservation.InvoiceId == invoiceId)
            .OrderBy(reservation => reservation.ProductId)
            .Select(reservation => new ReservationData(reservation.InvoiceId, reservation.ProductId, reservation.Quantity, reservation.State, reservation.CreatedAt, reservation.UpdatedAt))
            .ToListAsync(cancellationToken);

        return reservations.Select(ToResponse).ToList();
    }

    public async Task<IdempotentResponse> SetQuantityAsync(Guid invoiceId, Guid productId, SetReservationRequest request, CancellationToken cancellationToken)
    {
        if (invoiceId == Guid.Empty || productId == Guid.Empty) return IdempotentResponse.Validation("Invoice id and product id are required.");
        if (request.Quantity < 0) return IdempotentResponse.Validation("Reservation quantity cannot be negative.");

        var reservation = await db.Reservations.SingleOrDefaultAsync(item => item.InvoiceId == invoiceId && item.ProductId == productId, cancellationToken);
        if (reservation?.State == ReservationState.Consumed) return IdempotentResponse.Conflict("Consumed reservations cannot be changed.");
        if (reservation is null && request.Quantity == 0) return IdempotentResponse.NotFound("Reservation not found.");

        var currentQuantity = reservation?.State == ReservationState.Active ? reservation.Quantity : 0;
        var delta = request.Quantity - currentQuantity;
        var now = timeProvider.GetUtcNow();

        if (delta > 0)
        {
            var changed = await db.Products
                .Where(product => product.Id == productId && product.IsActive && product.AvailableQuantity >= delta)
                .ExecuteUpdateAsync(update => update
                    .SetProperty(product => product.AvailableQuantity, product => product.AvailableQuantity - delta)
                    .SetProperty(product => product.ReservedQuantity, product => product.ReservedQuantity + delta)
                    .SetProperty(product => product.UpdatedAt, now), cancellationToken);

            if (changed == 0) return await ReservationIncreaseFailureAsync(productId, cancellationToken);

            if (reservation is null)
            {
                reservation = StockReservation.Create(invoiceId, productId, request.Quantity, now);
                db.Reservations.Add(reservation);
                db.Movements.Add(StockMovement.Create(productId, invoiceId, StockMovementType.Reservation, delta, now));
            }
            else
            {
                if (reservation.State == ReservationState.Released) reservation.Reactivate(request.Quantity, now);
                else reservation.SetQuantity(request.Quantity, now);
                db.Movements.Add(StockMovement.Create(productId, invoiceId, StockMovementType.ReservationAdjustment, delta, now));
            }
        }
        else if (delta < 0)
        {
            var releasedQuantity = -delta;
            await ReturnReservedStockAsync(productId, releasedQuantity, now, cancellationToken);
            if (request.Quantity == 0) reservation!.Release(now);
            else reservation!.SetQuantity(request.Quantity, now);
            db.Movements.Add(StockMovement.Create(productId, invoiceId, StockMovementType.Release, releasedQuantity, now));
        }

        return IdempotentResponse.Ok(ToResponse(reservation!));
    }

    public async Task<IdempotentResponse> ReleaseAllAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        var reservations = await db.Reservations.Where(item => item.InvoiceId == invoiceId).OrderBy(item => item.ProductId).ToListAsync(cancellationToken);
        if (reservations.Count == 0) return IdempotentResponse.NotFound("No reservations were found for this invoice.");
        if (reservations.Any(item => item.State == ReservationState.Consumed)) return IdempotentResponse.Conflict("Consumed reservations cannot be released.");

        var now = timeProvider.GetUtcNow();
        foreach (var reservation in reservations.Where(item => item.State == ReservationState.Active))
        {
            await ReturnReservedStockAsync(reservation.ProductId, reservation.Quantity, now, cancellationToken);
            reservation.Release(now);
            db.Movements.Add(StockMovement.Create(reservation.ProductId, invoiceId, StockMovementType.Release, reservation.Quantity, now));
        }

        return IdempotentResponse.NoContent();
    }

    public async Task<IdempotentResponse> ConsumeAllAsync(Guid invoiceId, CancellationToken cancellationToken)
    {
        var reservations = await db.Reservations.Where(item => item.InvoiceId == invoiceId).OrderBy(item => item.ProductId).ToListAsync(cancellationToken);
        if (reservations.Count == 0) return IdempotentResponse.NotFound("No reservations were found for this invoice.");
        if (reservations.Any(item => item.State == ReservationState.Released)) return IdempotentResponse.Conflict("Released reservations cannot be consumed.");

        var now = timeProvider.GetUtcNow();
        foreach (var reservation in reservations.Where(item => item.State == ReservationState.Active))
        {
            var changed = await db.Products
                .Where(product => product.Id == reservation.ProductId && product.ReservedQuantity >= reservation.Quantity)
                .ExecuteUpdateAsync(update => update
                    .SetProperty(product => product.ReservedQuantity, product => product.ReservedQuantity - reservation.Quantity)
                    .SetProperty(product => product.UpdatedAt, now), cancellationToken);
            if (changed != 1) throw new InvalidOperationException("Stock reservation totals are inconsistent.");

            reservation.Consume(now);
            db.Movements.Add(StockMovement.Create(reservation.ProductId, invoiceId, StockMovementType.Consumption, reservation.Quantity, now));
        }

        return IdempotentResponse.NoContent();
    }

    private async Task ReturnReservedStockAsync(Guid productId, int quantity, DateTimeOffset now, CancellationToken cancellationToken)
    {
        var changed = await db.Products
            .Where(product => product.Id == productId && product.ReservedQuantity >= quantity)
            .ExecuteUpdateAsync(update => update
                .SetProperty(product => product.AvailableQuantity, product => product.AvailableQuantity + quantity)
                .SetProperty(product => product.ReservedQuantity, product => product.ReservedQuantity - quantity)
                .SetProperty(product => product.UpdatedAt, now), cancellationToken);
        if (changed != 1) throw new InvalidOperationException("Stock reservation totals are inconsistent.");
    }

    private async Task<IdempotentResponse> ReservationIncreaseFailureAsync(Guid productId, CancellationToken cancellationToken)
    {
        var product = await db.Products.AsNoTracking().Where(item => item.Id == productId).Select(item => new { item.IsActive, item.AvailableQuantity }).SingleOrDefaultAsync(cancellationToken);
        if (product is null) return IdempotentResponse.NotFound("Product not found.");
        if (!product.IsActive) return IdempotentResponse.Conflict("Inactive products cannot receive new reservations.");
        return IdempotentResponse.Conflict($"Insufficient stock. Available quantity: {product.AvailableQuantity}.");
    }

    private static ReservationResponse ToResponse(StockReservation reservation) =>
        new(reservation.InvoiceId, reservation.ProductId, reservation.Quantity, reservation.State.ToString(), reservation.CreatedAt, reservation.UpdatedAt);

    private static ReservationResponse ToResponse(ReservationData reservation) =>
        new(reservation.InvoiceId, reservation.ProductId, reservation.Quantity, reservation.State.ToString(), reservation.CreatedAt, reservation.UpdatedAt);

    private sealed record ReservationData(Guid InvoiceId, Guid ProductId, int Quantity, ReservationState State, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
}

