extern alias billing;
extern alias stock;

using BillingProgram = billing::Program;
using BillingStockClient = billing::BillingService.Integrations.StockClient;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using StockProgram = stock::Program;
using Testcontainers.PostgreSql;
using Xunit;

namespace IntegrationTests;

public static class IntegrationCollection
{
    public const string Name = "backend-integration";
}

[CollectionDefinition(IntegrationCollection.Name, DisableParallelization = true)]
public sealed class BackendIntegrationCollection : ICollectionFixture<IntegrationEnvironment>;

public sealed class IntegrationEnvironment : IAsyncLifetime
{
    private readonly PostgreSqlContainer stockDatabase = new PostgreSqlBuilder("postgres:17-alpine")
        .WithDatabase("korp_stock_tests")
        .WithUsername("korp")
        .WithPassword("korp_tests_password")
        .Build();

    private readonly PostgreSqlContainer billingDatabase = new PostgreSqlBuilder("postgres:17-alpine")
        .WithDatabase("korp_billing_tests")
        .WithUsername("korp")
        .WithPassword("korp_tests_password")
        .Build();

    private StockApiFactory? stockFactory;
    private BillingApiFactory? billingFactory;

    public HttpClient StockClient { get; private set; } = null!;
    public HttpClient BillingClient { get; private set; } = null!;
    public ToggleableStockHandler StockGateway { get; private set; } = null!;
    public string StockConnectionString => stockDatabase.GetConnectionString();
    public string BillingConnectionString => billingDatabase.GetConnectionString();

    public async ValueTask InitializeAsync()
    {
        await Task.WhenAll(stockDatabase.StartAsync(), billingDatabase.StartAsync());

        stockFactory = new StockApiFactory(StockConnectionString);
        StockClient = stockFactory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("http://stock.test/"),
            AllowAutoRedirect = false
        });

        StockGateway = new ToggleableStockHandler(stockFactory.Server.CreateHandler());
        billingFactory = new BillingApiFactory(BillingConnectionString, StockGateway);
        BillingClient = billingFactory.CreateClient(new WebApplicationFactoryClientOptions
        {
            BaseAddress = new Uri("http://billing.test/"),
            AllowAutoRedirect = false
        });
    }

    public async ValueTask DisposeAsync()
    {
        BillingClient?.Dispose();
        billingFactory?.Dispose();
        StockClient?.Dispose();
        stockFactory?.Dispose();
        await Task.WhenAll(stockDatabase.DisposeAsync().AsTask(), billingDatabase.DisposeAsync().AsTask());
    }

    private sealed class StockApiFactory(string connectionString) : WebApplicationFactory<StockProgram>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("IntegrationTests");
            builder.UseSetting("ConnectionStrings:Stock", connectionString);
            builder.ConfigureLogging(logging => logging.ClearProviders());
        }
    }

    private sealed class BillingApiFactory(string connectionString, ToggleableStockHandler stockHandler) : WebApplicationFactory<BillingProgram>
    {
        protected override void ConfigureWebHost(IWebHostBuilder builder)
        {
            builder.UseEnvironment("IntegrationTests");
            builder.UseSetting("ConnectionStrings:Billing", connectionString);
            builder.ConfigureLogging(logging => logging.ClearProviders());
            builder.ConfigureTestServices(services =>
            {
                services.AddHttpClient<BillingStockClient>(client =>
                    {
                        client.BaseAddress = new Uri("http://stock.test/");
                        client.Timeout = TimeSpan.FromSeconds(2);
                    })
                    .ConfigurePrimaryHttpMessageHandler(() => stockHandler)
                    .SetHandlerLifetime(Timeout.InfiniteTimeSpan);
            });
        }
    }
}

public sealed class ToggleableStockHandler(HttpMessageHandler innerHandler) : HttpMessageHandler
{
    private readonly HttpMessageInvoker innerInvoker = new(innerHandler, disposeHandler: true);
    private int unavailable;
    private int requestCount;

    public bool IsUnavailable
    {
        get => Volatile.Read(ref unavailable) == 1;
        set => Volatile.Write(ref unavailable, value ? 1 : 0);
    }

    public int RequestCount => Volatile.Read(ref requestCount);

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        Interlocked.Increment(ref requestCount);
        if (IsUnavailable) throw new HttpRequestException("Simulated stock outage.");
        return innerInvoker.SendAsync(request, cancellationToken);
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing) innerInvoker.Dispose();
        base.Dispose(disposing);
    }
}
