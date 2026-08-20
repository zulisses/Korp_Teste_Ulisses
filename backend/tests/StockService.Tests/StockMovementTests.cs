using StockService.Domain;
using Xunit;

namespace StockService.Tests;

public sealed class StockMovementTests
{
    [Fact]
    public void Create_RejectsNonPositiveQuantity()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => StockMovement.Create(Guid.NewGuid(), null, StockMovementType.Replenishment, 0, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Create_StoresAuditData()
    {
        var productId = Guid.NewGuid();
        var invoiceId = Guid.NewGuid();
        var now = DateTimeOffset.UtcNow;

        var movement = StockMovement.Create(productId, invoiceId, StockMovementType.Reservation, 4, now);

        Assert.NotEqual(Guid.Empty, movement.Id);
        Assert.Equal(productId, movement.ProductId);
        Assert.Equal(invoiceId, movement.InvoiceId);
        Assert.Equal(StockMovementType.Reservation, movement.Type);
        Assert.Equal(4, movement.Quantity);
        Assert.Equal(now, movement.CreatedAt);
    }
}
