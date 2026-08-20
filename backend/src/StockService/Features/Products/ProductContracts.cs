namespace StockService.Features.Products;

public sealed record CreateProductRequest(string Code, string Name, string Description, int InitialQuantity);
public sealed record ReplenishProductRequest(int Quantity);
public sealed record SetProductActiveRequest(bool IsActive);
public sealed record ProductResponse(Guid Id, string Code, string Name, string Description, int AvailableQuantity, int ReservedQuantity, bool IsActive, DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt);
