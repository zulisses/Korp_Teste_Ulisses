using System.Net;
using BillingService.Integrations;
using Xunit;

namespace BillingService.Tests;

public sealed class StockClientTests
{
    [Fact]
    public async Task ConsumeWithRetry_RetriesTransientFailuresThreeTimes()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable));
        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://stock/") };
        var client = new StockClient(httpClient);

        var result = await client.ConsumeWithRetryAsync(Guid.NewGuid(), Guid.NewGuid().ToString(), TestContext.Current.CancellationToken);

        Assert.False(result.IsSuccess);
        Assert.Equal(3, handler.RequestCount);
    }

    [Fact]
    public async Task ConsumeWithRetry_DoesNotRetryBusinessConflict()
    {
        var handler = new StubHandler(_ => new HttpResponseMessage(HttpStatusCode.Conflict));
        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://stock/") };
        var client = new StockClient(httpClient);

        var result = await client.ConsumeWithRetryAsync(Guid.NewGuid(), Guid.NewGuid().ToString(), TestContext.Current.CancellationToken);

        Assert.False(result.IsSuccess);
        Assert.Equal(1, handler.RequestCount);
    }

    [Fact]
    public async Task ConsumeWithRetry_SucceedsOnThirdAttempt()
    {
        var handler = new StubHandler(requestCount => new HttpResponseMessage(
            requestCount < 3 ? HttpStatusCode.ServiceUnavailable : HttpStatusCode.NoContent));
        using var httpClient = new HttpClient(handler) { BaseAddress = new Uri("http://stock/") };
        var client = new StockClient(httpClient);

        var result = await client.ConsumeWithRetryAsync(Guid.NewGuid(), Guid.NewGuid().ToString(), TestContext.Current.CancellationToken);

        Assert.True(result.IsSuccess);
        Assert.Equal(3, handler.RequestCount);
    }

    private sealed class StubHandler(Func<int, HttpResponseMessage> responseFactory) : HttpMessageHandler
    {
        public int RequestCount { get; private set; }

        protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            RequestCount++;
            return Task.FromResult(responseFactory(RequestCount));
        }
    }
}
