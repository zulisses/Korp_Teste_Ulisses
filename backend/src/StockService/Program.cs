using Microsoft.EntityFrameworkCore;
using StockService.Features.Products;
using StockService.Features.Reservations;
using StockService.Infrastructure.Idempotency;
using StockService.Infrastructure.Persistence;

var builder = WebApplication.CreateBuilder(args);
builder.Services.AddProblemDetails();
builder.Services.AddDbContext<StockDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Stock")));
builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddScoped<IdempotencyExecutor>();
builder.Services.AddScoped<ProductService>();
builder.Services.AddScoped<ReservationService>();

var app = builder.Build();
app.UseExceptionHandler();

await ApplyMigrationsAsync(app.Services);

app.MapGet("/health/live", () => Results.Ok(new { status = "live", service = "stock" }));
app.MapGet("/health/ready", async (StockDbContext db, CancellationToken cancellationToken) =>
    await db.Database.CanConnectAsync(cancellationToken)
        ? Results.Ok(new { status = "ready", service = "stock" })
        : Results.Problem("Stock database is unavailable.", statusCode: StatusCodes.Status503ServiceUnavailable));
app.MapProductEndpoints();
app.MapReservationEndpoints();

app.Run();

static async Task ApplyMigrationsAsync(IServiceProvider services)
{
    await using var scope = services.CreateAsyncScope();
    var db = scope.ServiceProvider.GetRequiredService<StockDbContext>();
    await db.Database.MigrateAsync();
}

public partial class Program;
