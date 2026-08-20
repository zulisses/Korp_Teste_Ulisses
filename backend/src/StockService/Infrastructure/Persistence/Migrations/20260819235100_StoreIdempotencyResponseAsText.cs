using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StockService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class StoreIdempotencyResponseAsText : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE stock.idempotency_records
                ALTER COLUMN response_body TYPE text USING response_body::text;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql("""
                ALTER TABLE stock.idempotency_records
                ALTER COLUMN response_body TYPE jsonb USING response_body::jsonb;
                """);
        }
    }
}
