using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace StockService.Infrastructure.Persistence.Migrations
{
    /// <inheritdoc />
    public partial class AddProductNameAndMovementProductForeignKey : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "name",
                schema: "stock",
                table: "products",
                type: "character varying(120)",
                maxLength: 120,
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE stock.products
                SET name = LEFT(CASE WHEN BTRIM(description) = '' THEN code ELSE description END, 120);
                """);

            migrationBuilder.AlterColumn<string>(
                name: "name",
                schema: "stock",
                table: "products",
                type: "character varying(120)",
                maxLength: 120,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(120)",
                oldMaxLength: 120,
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_movements_products_product_id",
                schema: "stock",
                table: "movements",
                column: "product_id",
                principalSchema: "stock",
                principalTable: "products",
                principalColumn: "id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_movements_products_product_id",
                schema: "stock",
                table: "movements");

            migrationBuilder.DropColumn(
                name: "name",
                schema: "stock",
                table: "products");
        }
    }
}
