using System.Net.Http.Json;
using System.Text.Json;

namespace BillingService.Integrations;

public sealed class StockClient(HttpClient httpClient)
{
    public Task<StockOperationResult> SetReservationAsync(Guid invoiceId, Guid productId, int quantity, string idempotencyKey, CancellationToken cancellationToken)
    {
        var request = new HttpRequestMessage(HttpMethod.Put, $"api/reservations/{invoiceId}/products/{productId}")
        {
            Content = JsonContent.Create(new { quantity })
        };
        return SendAsync(request, idempotencyKey, cancellationToken);
    }

    public Task<StockOperationResult> ReleaseAsync(Guid invoiceId, string idempotencyKey, CancellationToken cancellationToken) =>
        SendAsync(new HttpRequestMessage(HttpMethod.Post, $"api/reservations/{invoiceId}/release"), idempotencyKey, cancellationToken);

    public async Task<StockOperationResult> ConsumeWithRetryAsync(Guid invoiceId, string idempotencyKey, CancellationToken cancellationToken)
    {
        StockOperationResult? lastResult = null;
        for (var attempt = 0; attempt < 3; attempt++)
        {
            lastResult = await SendAsync(new HttpRequestMessage(HttpMethod.Post, $"api/reservations/{invoiceId}/consume"), idempotencyKey, cancellationToken);
            if (lastResult.IsSuccess || !lastResult.IsTransient || attempt == 2) return lastResult;

            await Task.Delay(TimeSpan.FromMilliseconds(100 * (1 << attempt)), cancellationToken);
        }

        return lastResult!;
    }

    private async Task<StockOperationResult> SendAsync(HttpRequestMessage request, string idempotencyKey, CancellationToken cancellationToken)
    {
        using (request)
        {
            request.Headers.TryAddWithoutValidation("Idempotency-Key", idempotencyKey);
            try
            {
                using var response = await httpClient.SendAsync(request, cancellationToken);
                if (response.IsSuccessStatusCode) return StockOperationResult.Success((int)response.StatusCode);

                var detail = await ReadProblemDetailAsync(response, cancellationToken);
                return StockOperationResult.Failure((int)response.StatusCode, detail);
            }
            catch (HttpRequestException)
            {
                return StockOperationResult.Unavailable("The stock service could not be reached.");
            }
            catch (TaskCanceledException) when (!cancellationToken.IsCancellationRequested)
            {
                return StockOperationResult.Unavailable("The stock service did not respond in time.");
            }
        }
    }

    private static async Task<string?> ReadProblemDetailAsync(HttpResponseMessage response, CancellationToken cancellationToken)
    {
        try
        {
            await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken);
            using var document = await JsonDocument.ParseAsync(stream, cancellationToken: cancellationToken);
            return document.RootElement.TryGetProperty("detail", out var detail) ? detail.GetString() : null;
        }
        catch (JsonException)
        {
            return null;
        }
    }
}

public sealed record StockOperationResult(bool IsSuccess, int StatusCode, string? Detail, bool IsTransient)
{
    public static StockOperationResult Success(int statusCode) => new(true, statusCode, null, false);
    public static StockOperationResult Failure(int statusCode, string? detail) => new(false, statusCode, detail, statusCode >= 500);
    public static StockOperationResult Unavailable(string detail) => new(false, StatusCodes.Status503ServiceUnavailable, detail, true);
}
