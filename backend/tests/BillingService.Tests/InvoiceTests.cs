using BillingService.Domain;
using Xunit;

namespace BillingService.Tests;

public sealed class InvoiceTests
{
    [Fact]
    public void Create_InitializesAnOpenEmptyInvoice()
    {
        var now = new DateTimeOffset(2026, 8, 19, 12, 0, 0, TimeSpan.Zero);

        var invoice = Invoice.Create(now);

        Assert.NotEqual(Guid.Empty, invoice.Id);
        Assert.Equal(InvoiceStatus.Open, invoice.Status);
        Assert.Equal(now, invoice.CreatedAt);
        Assert.Empty(invoice.Lines);
        Assert.Null(invoice.ClosedAt);
        Assert.Null(invoice.CancelledAt);
    }

    [Fact]
    public void SetLine_AddsAndUpdatesOneLinePerProduct()
    {
        var invoice = Invoice.Create(DateTimeOffset.UtcNow);
        var productId = Guid.NewGuid();

        invoice.SetLine(productId, 2);
        invoice.SetLine(productId, 5);

        var line = Assert.Single(invoice.Lines);
        Assert.Equal(productId, line.ProductId);
        Assert.Equal(5, line.Quantity);
    }

    [Fact]
    public void RemoveLine_RemovesExistingProduct()
    {
        var invoice = Invoice.Create(DateTimeOffset.UtcNow);
        var productId = Guid.NewGuid();
        invoice.SetLine(productId, 2);

        var removed = invoice.RemoveLine(productId);

        Assert.True(removed);
        Assert.Empty(invoice.Lines);
    }

    [Fact]
    public void Cancel_BlocksFurtherChangesAndClosing()
    {
        var invoice = Invoice.Create(DateTimeOffset.UtcNow);
        var cancelledAt = DateTimeOffset.UtcNow.AddMinutes(1);
        invoice.Cancel(cancelledAt);

        Assert.True(invoice.IsCancelled);
        Assert.Equal(cancelledAt, invoice.CancelledAt);
        Assert.Throws<InvalidOperationException>(() => invoice.SetLine(Guid.NewGuid(), 1));
        Assert.Throws<InvalidOperationException>(() => invoice.Close(cancelledAt));
    }

    [Fact]
    public void Close_RequiresLinesAndBlocksFurtherChanges()
    {
        var invoice = Invoice.Create(DateTimeOffset.UtcNow);
        Assert.Throws<InvalidOperationException>(() => invoice.Close(DateTimeOffset.UtcNow));

        invoice.SetLine(Guid.NewGuid(), 1);
        var closedAt = DateTimeOffset.UtcNow.AddMinutes(1);
        invoice.Close(closedAt);

        Assert.Equal(InvoiceStatus.Closed, invoice.Status);
        Assert.Equal(closedAt, invoice.ClosedAt);
        Assert.Throws<InvalidOperationException>(() => invoice.RemoveLine(invoice.Lines[0].ProductId));
    }
}
