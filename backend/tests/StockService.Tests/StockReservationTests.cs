using StockService.Domain;
using Xunit;

namespace StockService.Tests;

public sealed class StockReservationTests
{
    [Fact]
    public void Create_InitializesActiveReservation()
    {
        var invoiceId = Guid.NewGuid();
        var productId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        var reservation = StockReservation.Create(invoiceId, productId, 2, now);

        Assert.Equal(invoiceId, reservation.InvoiceId);
        Assert.Equal(productId, reservation.ProductId);
        Assert.Equal(2, reservation.Quantity);
        Assert.Equal(ReservationState.Active, reservation.State);
    }

    [Fact]
    public void ReleasedReservation_CanBeReactivated()
    {
        var reservation = StockReservation.Create(Guid.NewGuid(), Guid.NewGuid(), 2, DateTimeOffset.UnixEpoch);
        reservation.Release(DateTimeOffset.UnixEpoch.AddMinutes(1));

        reservation.Reactivate(3, DateTimeOffset.UnixEpoch.AddMinutes(2));

        Assert.Equal(ReservationState.Active, reservation.State);
        Assert.Equal(3, reservation.Quantity);
    }

    [Fact]
    public void ConsumedReservation_CannotBeAdjustedOrReleased()
    {
        var reservation = StockReservation.Create(Guid.NewGuid(), Guid.NewGuid(), 2, DateTimeOffset.UnixEpoch);
        reservation.Consume(DateTimeOffset.UnixEpoch.AddMinutes(1));

        Assert.Throws<InvalidOperationException>(() => reservation.SetQuantity(1, DateTimeOffset.UtcNow));
        Assert.Throws<InvalidOperationException>(() => reservation.Release(DateTimeOffset.UtcNow));
    }
}
