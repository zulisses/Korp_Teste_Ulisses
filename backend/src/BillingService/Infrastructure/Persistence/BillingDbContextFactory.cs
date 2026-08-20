using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;

namespace BillingService.Infrastructure.Persistence;

public sealed class BillingDbContextFactory : IDesignTimeDbContextFactory<BillingDbContext>
{
    public BillingDbContext CreateDbContext(string[] args)
    {
        var connection = Environment.GetEnvironmentVariable("ConnectionStrings__Billing")
            ?? "Host=localhost;Port=5434;Database=korp_billing;Username=korp;Password=korp_dev_password";
        return new BillingDbContext(new DbContextOptionsBuilder<BillingDbContext>().UseNpgsql(connection).Options);
    }
}

