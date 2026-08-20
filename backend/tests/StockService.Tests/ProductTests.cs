using StockService.Domain;
using Xunit;

namespace StockService.Tests;

public sealed class ProductTests
{
    [Fact]
    public void Constructor_NormalizesCodeAndInitializesBalances()
    {
        var now = new DateTimeOffset(2026, 8, 19, 12, 0, 0, TimeSpan.Zero);

        var product = new Product("  can-001  ", " Caneta ", " Caneta esferográfica azul ", 10, now);

        Assert.NotEqual(Guid.Empty, product.Id);
        Assert.Equal("CAN-001", product.Code);
        Assert.Equal("Caneta", product.Name);
        Assert.Equal("Caneta esferográfica azul", product.Description);
        Assert.Equal(10, product.AvailableQuantity);
        Assert.Equal(0, product.ReservedQuantity);
        Assert.True(product.IsActive);
        Assert.Equal(now, product.CreatedAt);
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_RejectsBlankCode(string code)
    {
        Assert.Throws<ArgumentException>(() => new Product(code, "Produto", "Descrição", 0, DateTimeOffset.UtcNow));
    }

    [Theory]
    [InlineData("")]
    [InlineData("   ")]
    public void Constructor_RejectsBlankName(string name)
    {
        Assert.Throws<ArgumentException>(() => new Product("PROD-1", name, "Descrição", 0, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Constructor_RejectsNegativeInitialQuantity()
    {
        Assert.Throws<ArgumentOutOfRangeException>(() => new Product("PROD-1", "Produto", "Descrição", -1, DateTimeOffset.UtcNow));
    }

    [Fact]
    public void Replenish_IncreasesAvailableQuantityAndUpdatesTimestamp()
    {
        var product = new Product("PROD-1", "Produto", "Descrição", 2, DateTimeOffset.UnixEpoch);
        var updatedAt = DateTimeOffset.UnixEpoch.AddHours(1);

        product.Replenish(3, updatedAt);

        Assert.Equal(5, product.AvailableQuantity);
        Assert.Equal(updatedAt, product.UpdatedAt);
    }

    [Fact]
    public void Replenish_RejectsInactiveProduct()
    {
        var product = new Product("PROD-1", "Produto", "Descrição", 2, DateTimeOffset.UnixEpoch);
        product.SetActive(false, DateTimeOffset.UnixEpoch.AddMinutes(1));

        Assert.Throws<InvalidOperationException>(() => product.Replenish(1, DateTimeOffset.UnixEpoch.AddMinutes(2)));
    }

    [Fact]
    public void SetActive_DeactivatesAndReactivatesProduct()
    {
        var product = new Product("PROD-1", "Produto", "Descrição", 2, DateTimeOffset.UnixEpoch);
        var deactivatedAt = DateTimeOffset.UnixEpoch.AddMinutes(1);
        var reactivatedAt = DateTimeOffset.UnixEpoch.AddMinutes(2);

        product.SetActive(false, deactivatedAt);
        Assert.False(product.IsActive);
        Assert.Equal(deactivatedAt, product.UpdatedAt);

        product.SetActive(true, reactivatedAt);
        Assert.True(product.IsActive);
        Assert.Equal(reactivatedAt, product.UpdatedAt);
    }

    [Fact]
    public void SetActive_DoesNotChangeTimestampWhenStateAlreadyMatches()
    {
        var product = new Product("PROD-1", "Produto", "Descrição", 2, DateTimeOffset.UnixEpoch);

        product.SetActive(true, DateTimeOffset.UnixEpoch.AddMinutes(1));

        Assert.Equal(DateTimeOffset.UnixEpoch, product.UpdatedAt);
    }
}
