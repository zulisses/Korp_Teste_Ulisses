namespace StockService.Domain;

public sealed class Product
{
    private Product() { }

    public Product(string code, string name, string description, int initialQuantity, DateTimeOffset now)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(code);
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        ArgumentException.ThrowIfNullOrWhiteSpace(description);
        if (code.Trim().Length > 50) throw new ArgumentOutOfRangeException(nameof(code), "Product code cannot exceed 50 characters.");
        if (name.Trim().Length > 120) throw new ArgumentOutOfRangeException(nameof(name), "Product name cannot exceed 120 characters.");
        if (description.Trim().Length > 200) throw new ArgumentOutOfRangeException(nameof(description), "Product description cannot exceed 200 characters.");
        if (initialQuantity < 0) throw new ArgumentOutOfRangeException(nameof(initialQuantity), "Initial quantity cannot be negative.");

        Id = Guid.NewGuid();
        Code = NormalizeCode(code);
        Name = name.Trim();
        Description = description.Trim();
        AvailableQuantity = initialQuantity;
        CreatedAt = now;
        UpdatedAt = now;
    }

    public Guid Id { get; private set; }
    public string Code { get; private set; } = string.Empty;
    public string Name { get; private set; } = string.Empty;
    public string Description { get; private set; } = string.Empty;
    public int AvailableQuantity { get; private set; }
    public int ReservedQuantity { get; private set; }
    public bool IsActive { get; private set; } = true;
    public DateTimeOffset CreatedAt { get; private set; }
    public DateTimeOffset UpdatedAt { get; private set; }

    public static string NormalizeCode(string code) => code.Trim().ToUpperInvariant();

    public void Replenish(int quantity, DateTimeOffset now)
    {
        if (!IsActive) throw new InvalidOperationException("Inactive products cannot be replenished.");
        if (quantity <= 0) throw new ArgumentOutOfRangeException(nameof(quantity), "Replenishment quantity must be positive.");
        AvailableQuantity = checked(AvailableQuantity + quantity);
        UpdatedAt = now;
    }

    public void SetActive(bool isActive, DateTimeOffset now)
    {
        if (IsActive == isActive) return;
        IsActive = isActive;
        UpdatedAt = now;
    }
}
