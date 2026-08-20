using BillingService.Features.Invoices;
using BillingService.Infrastructure.Persistence;
using BillingService.Infrastructure.Idempotency;
using BillingService.Integrations;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddDbContext<BillingDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Billing")));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<IdempotencyExecutor>();
builder.Services.AddScoped<InvoiceService>();
builder.Services.AddHttpClient<StockClient>(client =>
{
    client.BaseAddress = new Uri(builder.Configuration["Services:Stock"] ?? throw new InvalidOperationException("Stock service URL is not configured."));
    client.Timeout = TimeSpan.FromSeconds(5);
});

var app = builder.Build();
app.UseExceptionHandler();

await ApplyMigrationsAsync(app.Services);

app.MapGet("/health/live", () => Results.Ok(new { status = "live", service = "billing" }));
app.MapGet("/health/ready", async (BillingDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok(new { status = "ready", service = "billing" })
        : Results.Problem("Billing database is unavailable.", statusCode: StatusCodes.Status503ServiceUnavailable));
app.MapInvoiceEndpoints();

app.Run();

static async Task ApplyMigrationsAsync(IServiceProvider services)
{
    await using var scope = services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<BillingDbContext>();
    await db.Database.MigrateAsync();
}

public partial class Program;
