using Microsoft.EntityFrameworkCore;
using StockService.Domain;
using StockService.Infrastructure.Idempotency;
using StockService.Infrastructure.Persistence;

namespace StockService.Features.Products;

public sealed class ProductService(StockDbContext db, TimeProvider timeProvider)
{
    public async Task<IReadOnlyList<ProductResponse>> ListAsync(bool includeInactive, CancellationToken cancellationToken) =>
        await db.Products.AsNoTracking()
            .Where(product => includeInactive || product.IsActive)
            .OrderBy(product => product.Code)
            .Select(product => new ProductResponse(product.Id, product.Code, product.Name, product.Description, product.AvailableQuantity, product.ReservedQuantity, product.IsActive, product.CreatedAt, product.UpdatedAt))
            .ToListAsync(cancellationToken);

    public Task<ProductResponse?> GetAsync(Guid id, CancellationToken cancellationToken) =>
        db.Products.AsNoTracking()
            .Where(product => product.Id == id)
            .Select(product => new ProductResponse(product.Id, product.Code, product.Name, product.Description, product.AvailableQuantity, product.ReservedQuantity, product.IsActive, product.CreatedAt, product.UpdatedAt))
            .SingleOrDefaultAsync(cancellationToken);

    public async Task<IdempotentResponse> CreateAsync(CreateProductRequest request, CancellationToken cancellationToken)
    {
        var validation = ValidateCreate(request);
        if (validation is not null) return IdempotentResponse.Validation(validation);

        var normalizedCode = Product.NormalizeCode(request.Code);
        if (await db.Products.AnyAsync(product => product.Code == normalizedCode, cancellationToken))
            return IdempotentResponse.Conflict("A product with this code already exists.");

        var now = timeProvider.GetUtcNow();
        var product = new Product(request.Code, request.Name, request.Description, request.InitialQuantity, now);
        db.Products.Add(product);
        if (request.InitialQuantity > 0)
            db.Movements.Add(StockMovement.Create(product.Id, null, StockMovementType.InitialBalance, request.InitialQuantity, now));

        return IdempotentResponse.Created(ToResponse(product));
    }

    public async Task<IdempotentResponse> ReplenishAsync(Guid id, ReplenishProductRequest request, CancellationToken cancellationToken)
    {
        if (request.Quantity <= 0) return IdempotentResponse.Validation("Quantity must be greater than zero.");
        var product = await db.Products.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (product is null) return IdempotentResponse.NotFound("Product not found.");
        if (!product.IsActive) return IdempotentResponse.Conflict("Inactive products cannot be replenished.");

        var now = timeProvider.GetUtcNow();
        product.Replenish(request.Quantity, now);
        db.Movements.Add(StockMovement.Create(product.Id, null, StockMovementType.Replenishment, request.Quantity, now));
        return IdempotentResponse.Ok(ToResponse(product));
    }

    public async Task<IdempotentResponse> SetActiveAsync(Guid id, SetProductActiveRequest request, CancellationToken cancellationToken)
    {
        var product = await db.Products.SingleOrDefaultAsync(item => item.Id == id, cancellationToken);
        if (product is null) return IdempotentResponse.NotFound("Product not found.");
        product.SetActive(request.IsActive, timeProvider.GetUtcNow());
        return IdempotentResponse.Ok(ToResponse(product));
    }

    private static string? ValidateCreate(CreateProductRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Code)) return "Code is required.";
        if (request.Code.Trim().Length > 50) return "Code cannot exceed 50 characters.";
        if (string.IsNullOrWhiteSpace(request.Name)) return "Name is required.";
        if (request.Name.Trim().Length > 120) return "Name cannot exceed 120 characters.";
        if (string.IsNullOrWhiteSpace(request.Description)) return "Description is required.";
        if (request.Description.Trim().Length > 200) return "Description cannot exceed 200 characters.";
        if (request.InitialQuantity < 0) return "Initial quantity cannot be negative.";
        return null;
    }

    private static ProductResponse ToResponse(Product product) => new(product.Id, product.Code, product.Name, product.Description, product.AvailableQuantity, product.ReservedQuantity, product.IsActive, product.CreatedAt, product.UpdatedAt);
}
