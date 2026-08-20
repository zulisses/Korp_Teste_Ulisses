namespace StockService.Infrastructure.Idempotency;

public sealed class IdempotencyRecord
{
    public Guid Key { get; set; }
    public string Operation { get; set; } = string.Empty;
    public string RequestHash { get; set; } = string.Empty;
    public int ResponseStatusCode { get; set; }
    public string ResponseBody { get; set; } = string.Empty;
    public DateTimeOffset CreatedAt { get; set; }
}

