using BillingService.Domain;
using BillingService.Infrastructure.Idempotency;
using Microsoft.EntityFrameworkCore;

namespace BillingService.Infrastructure.Persistence;

public sealed class BillingDbContext(DbContextOptions<BillingDbContext> options) : DbContext(options)
{
    public DbSet<Invoice> Invoices => Set<Invoice>();
    public DbSet<InvoiceLine> InvoiceLines => Set<InvoiceLine>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("billing");

        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.ToTable("invoices");
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(x => x.Number).HasColumnName("number").UseIdentityAlwaysColumn();
            entity.Property(x => x.Status).HasColumnName("status").HasConversion<int>();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.ClosedAt).HasColumnName("closed_at");
            entity.Property(x => x.CancelledAt).HasColumnName("cancelled_at");
            entity.HasIndex(x => x.Number).IsUnique().HasDatabaseName("ux_invoices_number");
        });

        modelBuilder.Entity<InvoiceLine>(entity =>
        {
            entity.ToTable("invoice_lines", table => table.HasCheckConstraint("ck_invoice_lines_quantity_positive", "quantity > 0"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(x => x.InvoiceId).HasColumnName("invoice_id");
            entity.Property(x => x.ProductId).HasColumnName("product_id");
            entity.Property(x => x.Quantity).HasColumnName("quantity");
            entity.HasIndex(x => new { x.InvoiceId, x.ProductId }).IsUnique().HasDatabaseName("ux_invoice_lines_invoice_product");
            entity.HasOne(x => x.Invoice).WithMany(x => x.Lines).HasForeignKey(x => x.InvoiceId).OnDelete(DeleteBehavior.Cascade);
        });

        modelBuilder.Entity<IdempotencyRecord>(entity =>
        {
            entity.ToTable("idempotency_records");
            entity.HasKey(x => x.Key);
            entity.Property(x => x.Key).HasColumnName("key").ValueGeneratedNever();
            entity.Property(x => x.Operation).HasColumnName("operation").HasMaxLength(100).IsRequired();
            entity.Property(x => x.RequestHash).HasColumnName("request_hash").HasMaxLength(64).IsRequired();
            entity.Property(x => x.ResponseStatusCode).HasColumnName("response_status_code");
            entity.Property(x => x.ResponseBody).HasColumnName("response_body").HasColumnType("text").IsRequired();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
        });
    }
}
