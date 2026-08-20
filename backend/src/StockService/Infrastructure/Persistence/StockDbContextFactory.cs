using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace StockService.Infrastructure.Persistence;

public sealed class StockDbContextFactory : IDesignTimeDbContextFactory<StockDbContext>
{
    public StockDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Stock")
            ?? "Host=localhost;Port=5433;Database=korp_stock;Username=korp;Password=korp_dev_password";
        return new StockDbContext(new DbContextOptionsBuilder<StockDbContext>().UseNpgsql(connection).Options);
    }
}

