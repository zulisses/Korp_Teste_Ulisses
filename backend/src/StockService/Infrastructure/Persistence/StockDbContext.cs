using Microsoft.EntityFrameworkCore;
using StockService.Domain;
using StockService.Infrastructure.Idempotency;

namespace StockService.Infrastructure.Persistence;

public sealed class StockDbContext(DbContextOptions<StockDbContext> options) : DbContext(options)
{
    public DbSet<Product> Products => Set<Product>();
    public DbSet<StockReservation> Reservations => Set<StockReservation>();
    public DbSet<StockMovement> Movements => Set<StockMovement>();
    public DbSet<IdempotencyRecord> IdempotencyRecords => Set<IdempotencyRecord>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema("stock");

        modelBuilder.Entity<Product>(entity =>
        {
            entity.ToTable("products", table =>
            {
                table.HasCheckConstraint("ck_products_available_non_negative", "available_quantity >= 0");
                table.HasCheckConstraint("ck_products_reserved_non_negative", "reserved_quantity >= 0");
            });
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(x => x.Code).HasColumnName("code").HasMaxLength(50).IsRequired();
            entity.Property(x => x.Name).HasColumnName("name").HasMaxLength(120).IsRequired();
            entity.Property(x => x.Description).HasColumnName("description").HasMaxLength(200).IsRequired();
            entity.Property(x => x.AvailableQuantity).HasColumnName("available_quantity");
            entity.Property(x => x.ReservedQuantity).HasColumnName("reserved_quantity");
            entity.Property(x => x.IsActive).HasColumnName("is_active");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => x.Code).IsUnique().HasDatabaseName("ux_products_code");
        });

        modelBuilder.Entity<StockReservation>(entity =>
        {
            entity.ToTable("reservations", table => table.HasCheckConstraint("ck_reservations_quantity_positive", "quantity > 0"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(x => x.InvoiceId).HasColumnName("invoice_id");
            entity.Property(x => x.ProductId).HasColumnName("product_id");
            entity.Property(x => x.Quantity).HasColumnName("quantity");
            entity.Property(x => x.State).HasColumnName("state").HasConversion<int>();
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.Property(x => x.UpdatedAt).HasColumnName("updated_at");
            entity.HasIndex(x => new { x.InvoiceId, x.ProductId }).IsUnique().HasDatabaseName("ux_reservations_invoice_product");
            entity.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
        });

        modelBuilder.Entity<StockMovement>(entity =>
        {
            entity.ToTable("movements", table => table.HasCheckConstraint("ck_movements_quantity_positive", "quantity > 0"));
            entity.HasKey(x => x.Id);
            entity.Property(x => x.Id).HasColumnName("id").ValueGeneratedNever();
            entity.Property(x => x.ProductId).HasColumnName("product_id");
            entity.Property(x => x.InvoiceId).HasColumnName("invoice_id");
            entity.Property(x => x.Type).HasColumnName("type").HasConversion<int>();
            entity.Property(x => x.Quantity).HasColumnName("quantity");
            entity.Property(x => x.CreatedAt).HasColumnName("created_at");
            entity.HasIndex(x => new { x.ProductId, x.CreatedAt }).HasDatabaseName("ix_movements_product_created_at");
            entity.HasOne(x => x.Product).WithMany().HasForeignKey(x => x.ProductId).OnDelete(DeleteBehavior.Restrict);
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
