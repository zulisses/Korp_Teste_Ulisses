using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Npgsql;
using Xunit;

namespace IntegrationTests;

[Collection(IntegrationCollection.Name)]
public sealed class BackendIntegrationTests(IntegrationEnvironment environment)
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    [Fact]
    public async Task ProductApi_PersistsActivationAndIdempotentReplay()
    {
        var code = $"INT-{Guid.NewGuid():N}";
        var idempotencyKey = Guid.NewGuid();

        using var firstResponse = await SendMutationAsync(environment.StockClient, HttpMethod.Post, "api/products", idempotencyKey,
            new { code, name = "Integration product", description = "Product created by integration test", initialQuantity = 5 });
        var firstBody = await firstResponse.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        var product = Deserialize<ProductResponse>(firstBody);

        using var replayResponse = await SendMutationAsync(environment.StockClient, HttpMethod.Post, "api/products", idempotencyKey,
            new { code, name = "Integration product", description = "Product created by integration test", initialQuantity = 5 });
        var replayBody = await replayResponse.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.Created, firstResponse.StatusCode);
        Assert.Equal(HttpStatusCode.Created, replayResponse.StatusCode);
        Assert.Equal(firstBody, replayBody);

        using var conflictingReplay = await SendMutationAsync(environment.StockClient, HttpMethod.Post, "api/products", idempotencyKey,
            new { code, name = "Changed product", description = "Product created by integration test", initialQuantity = 5 });
        Assert.Equal(HttpStatusCode.Conflict, conflictingReplay.StatusCode);

        using var deactivate = await SendMutationAsync(environment.StockClient, HttpMethod.Put, $"api/products/{product.Id}/activation", Guid.NewGuid(), new { isActive = false });
        Assert.Equal(HttpStatusCode.OK, deactivate.StatusCode);
        Assert.False((await ReadAsync<ProductResponse>(deactivate)).IsActive);

        using var reactivate = await SendMutationAsync(environment.StockClient, HttpMethod.Put, $"api/products/{product.Id}/activation", Guid.NewGuid(), new { isActive = true });
        Assert.Equal(HttpStatusCode.OK, reactivate.StatusCode);
        Assert.True((await ReadAsync<ProductResponse>(reactivate)).IsActive);

        await using var connection = new NpgsqlConnection(environment.StockConnectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand("SELECT name, description, available_quantity, reserved_quantity, is_active FROM stock.products WHERE id = $1", connection);
        command.Parameters.AddWithValue(product.Id);
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
        Assert.Equal("Integration product", reader.GetString(0));
        Assert.Equal("Product created by integration test", reader.GetString(1));
        Assert.Equal(5, reader.GetInt32(2));
        Assert.Equal(0, reader.GetInt32(3));
        Assert.True(reader.GetBoolean(4));
    }

    [Fact]
    public async Task ConcurrentReservations_AllowOnlyOneInvoiceForTheLastUnit()
    {
        var product = await CreateProductAsync(1);
        var firstInvoiceId = Guid.NewGuid();
        var secondInvoiceId = Guid.NewGuid();

        var responses = await Task.WhenAll(
            SendMutationAsync(environment.StockClient, HttpMethod.Put, $"api/reservations/{firstInvoiceId}/products/{product.Id}", Guid.NewGuid(), new { quantity = 1 }),
            SendMutationAsync(environment.StockClient, HttpMethod.Put, $"api/reservations/{secondInvoiceId}/products/{product.Id}", Guid.NewGuid(), new { quantity = 1 }));

        using var firstResponse = responses[0];
        using var secondResponse = responses[1];
        Assert.Equal(
            new[] { HttpStatusCode.OK, HttpStatusCode.Conflict },
            responses.Select(response => response.StatusCode).OrderBy(status => status).ToArray());

        var persistedProduct = await environment.StockClient.GetFromJsonAsync<ProductResponse>($"api/products/{product.Id}", JsonOptions, TestContext.Current.CancellationToken);
        Assert.NotNull(persistedProduct);
        Assert.Equal(0, persistedProduct.AvailableQuantity);
        Assert.Equal(1, persistedProduct.ReservedQuantity);

        await using var connection = new NpgsqlConnection(environment.StockConnectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand("SELECT available_quantity, reserved_quantity FROM stock.products WHERE id = $1", connection);
        command.Parameters.AddWithValue(product.Id);
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
        Assert.Equal(0, reader.GetInt32(0));
        Assert.Equal(1, reader.GetInt32(1));
    }

    [Fact]
    public async Task InvoiceFlow_PersistsMultipleLinesAndConsumesStockBeforeClosing()
    {
        var firstProduct = await CreateProductAsync(10);
        var secondProduct = await CreateProductAsync(5);
        var invoice = await CreateInvoiceAsync();
        var nextInvoice = await CreateInvoiceAsync();
        Assert.Equal(invoice.Number + 1, nextInvoice.Number);

        using var firstLine = await SendMutationAsync(environment.BillingClient, HttpMethod.Put, $"api/invoices/{invoice.Id}/products/{firstProduct.Id}", Guid.NewGuid(), new { quantity = 2 });
        using var secondLine = await SendMutationAsync(environment.BillingClient, HttpMethod.Put, $"api/invoices/{invoice.Id}/products/{secondProduct.Id}", Guid.NewGuid(), new { quantity = 3 });
        Assert.Equal(HttpStatusCode.OK, firstLine.StatusCode);
        Assert.Equal(HttpStatusCode.OK, secondLine.StatusCode);

        var printKey = Guid.NewGuid();
        using var print = await SendMutationAsync(environment.BillingClient, HttpMethod.Post, $"api/invoices/{invoice.Id}/print", printKey);
        var printBody = await print.Content.ReadAsStringAsync(TestContext.Current.CancellationToken);
        var closedInvoice = Deserialize<InvoiceResponse>(printBody);
        Assert.Equal(HttpStatusCode.OK, print.StatusCode);
        Assert.Equal("Closed", closedInvoice.Status);
        Assert.Equal(2, closedInvoice.Lines.Count);

        using var replay = await SendMutationAsync(environment.BillingClient, HttpMethod.Post, $"api/invoices/{invoice.Id}/print", printKey);
        Assert.Equal(HttpStatusCode.OK, replay.StatusCode);
        Assert.Equal(printBody, await replay.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));

        var firstPersisted = await GetProductAsync(firstProduct.Id);
        var secondPersisted = await GetProductAsync(secondProduct.Id);
        Assert.Equal((8, 0), (firstPersisted.AvailableQuantity, firstPersisted.ReservedQuantity));
        Assert.Equal((2, 0), (secondPersisted.AvailableQuantity, secondPersisted.ReservedQuantity));

        var reservations = await environment.StockClient.GetFromJsonAsync<List<ReservationResponse>>($"api/reservations/{invoice.Id}", JsonOptions, TestContext.Current.CancellationToken);
        Assert.NotNull(reservations);
        Assert.Equal(2, reservations.Count);
        Assert.All(reservations, reservation => Assert.Equal("Consumed", reservation.State));

        await using var connection = new NpgsqlConnection(environment.BillingConnectionString);
        await connection.OpenAsync(TestContext.Current.CancellationToken);
        await using var command = new NpgsqlCommand("SELECT status, (SELECT count(*) FROM billing.invoice_lines WHERE invoice_id = $1) FROM billing.invoices WHERE id = $1", connection);
        command.Parameters.AddWithValue(invoice.Id);
        await using var reader = await command.ExecuteReaderAsync(TestContext.Current.CancellationToken);
        Assert.True(await reader.ReadAsync(TestContext.Current.CancellationToken));
        Assert.Equal(2, reader.GetInt32(0));
        Assert.Equal(2L, reader.GetInt64(1));
    }

    [Fact]
    public async Task CancelledInvoice_ReleasesStockAndBlocksFurtherOperations()
    {
        var product = await CreateProductAsync(4);
        var invoice = await CreateInvoiceAsync();

        using var addLine = await SendMutationAsync(environment.BillingClient, HttpMethod.Put, $"api/invoices/{invoice.Id}/products/{product.Id}", Guid.NewGuid(), new { quantity = 2 });
        Assert.Equal(HttpStatusCode.OK, addLine.StatusCode);

        using var cancel = await SendMutationAsync(environment.BillingClient, HttpMethod.Post, $"api/invoices/{invoice.Id}/cancel", Guid.NewGuid());
        Assert.Equal(HttpStatusCode.NoContent, cancel.StatusCode);

        var cancelledInvoice = await environment.BillingClient.GetFromJsonAsync<InvoiceResponse>($"api/invoices/{invoice.Id}", JsonOptions, TestContext.Current.CancellationToken);
        Assert.NotNull(cancelledInvoice);
        Assert.Equal("Open", cancelledInvoice.Status);
        Assert.True(cancelledInvoice.IsCancelled);

        var persistedProduct = await GetProductAsync(product.Id);
        Assert.Equal((4, 0), (persistedProduct.AvailableQuantity, persistedProduct.ReservedQuantity));

        using var change = await SendMutationAsync(environment.BillingClient, HttpMethod.Put, $"api/invoices/{invoice.Id}/products/{product.Id}", Guid.NewGuid(), new { quantity = 1 });
        using var print = await SendMutationAsync(environment.BillingClient, HttpMethod.Post, $"api/invoices/{invoice.Id}/print", Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Conflict, change.StatusCode);
        Assert.Equal(HttpStatusCode.Conflict, print.StatusCode);
    }

    [Fact]
    public async Task PrintFailure_PreservesStateAndSucceedsAfterStockRecovers()
    {
        var product = await CreateProductAsync(3);
        var invoice = await CreateInvoiceAsync();
        using var addLine = await SendMutationAsync(environment.BillingClient, HttpMethod.Put, $"api/invoices/{invoice.Id}/products/{product.Id}", Guid.NewGuid(), new { quantity = 1 });
        Assert.Equal(HttpStatusCode.OK, addLine.StatusCode);

        var requestsBeforeFailure = environment.StockGateway.RequestCount;
        environment.StockGateway.IsUnavailable = true;
        HttpResponseMessage failure;
        try
        {
            failure = await SendMutationAsync(environment.BillingClient, HttpMethod.Post, $"api/invoices/{invoice.Id}/print", Guid.NewGuid());
        }
        finally
        {
            environment.StockGateway.IsUnavailable = false;
        }

        using (failure)
        {
            Assert.Equal(HttpStatusCode.ServiceUnavailable, failure.StatusCode);
            Assert.Equal(3, environment.StockGateway.RequestCount - requestsBeforeFailure);
        }

        var openInvoice = await environment.BillingClient.GetFromJsonAsync<InvoiceResponse>($"api/invoices/{invoice.Id}", JsonOptions, TestContext.Current.CancellationToken);
        var activeReservations = await environment.StockClient.GetFromJsonAsync<List<ReservationResponse>>($"api/reservations/{invoice.Id}", JsonOptions, TestContext.Current.CancellationToken);
        Assert.NotNull(openInvoice);
        Assert.Equal("Open", openInvoice.Status);
        Assert.NotNull(activeReservations);
        Assert.Equal("Active", Assert.Single(activeReservations).State);

        using var recoveredPrint = await SendMutationAsync(environment.BillingClient, HttpMethod.Post, $"api/invoices/{invoice.Id}/print", Guid.NewGuid());
        Assert.Equal(HttpStatusCode.OK, recoveredPrint.StatusCode);
        Assert.Equal("Closed", (await ReadAsync<InvoiceResponse>(recoveredPrint)).Status);

        var persistedProduct = await GetProductAsync(product.Id);
        Assert.Equal((2, 0), (persistedProduct.AvailableQuantity, persistedProduct.ReservedQuantity));
    }

    [Fact]
    public async Task MutationWithoutValidIdempotencyKey_ReturnsProblemDetails()
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, "api/products")
        {
            Content = JsonContent.Create(new { code = "NO-KEY", name = "Invalid product", description = "Invalid request", initialQuantity = 1 })
        };
        using var response = await environment.StockClient.SendAsync(request, TestContext.Current.CancellationToken);

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal("Validation failed", (await ReadAsync<ProblemResponse>(response)).Title);
    }

    private async Task<ProductResponse> CreateProductAsync(int initialQuantity)
    {
        using var response = await SendMutationAsync(environment.StockClient, HttpMethod.Post, "api/products", Guid.NewGuid(), new
        {
            code = $"INT-{Guid.NewGuid():N}",
            name = "Integration product",
            description = "Product created by integration test",
            initialQuantity
        });
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await ReadAsync<ProductResponse>(response);
    }

    private async Task<InvoiceResponse> CreateInvoiceAsync()
    {
        using var response = await SendMutationAsync(environment.BillingClient, HttpMethod.Post, "api/invoices", Guid.NewGuid());
        Assert.Equal(HttpStatusCode.Created, response.StatusCode);
        return await ReadAsync<InvoiceResponse>(response);
    }

    private async Task<ProductResponse> GetProductAsync(Guid productId)
    {
        var product = await environment.StockClient.GetFromJsonAsync<ProductResponse>($"api/products/{productId}", JsonOptions, TestContext.Current.CancellationToken);
        return Assert.IsType<ProductResponse>(product);
    }

    private static async Task<HttpResponseMessage> SendMutationAsync(HttpClient client, HttpMethod method, string uri, Guid idempotencyKey, object? body = null)
    {
        using var request = new HttpRequestMessage(method, uri);
        request.Headers.Add("Idempotency-Key", idempotencyKey.ToString());
        if (body is not null) request.Content = JsonContent.Create(body);
        return await client.SendAsync(request, TestContext.Current.CancellationToken);
    }

    private static async Task<T> ReadAsync<T>(HttpResponseMessage response) =>
        Deserialize<T>(await response.Content.ReadAsStringAsync(TestContext.Current.CancellationToken));

    private static T Deserialize<T>(string json) =>
        JsonSerializer.Deserialize<T>(json, JsonOptions) ?? throw new JsonException($"Could not deserialize {typeof(T).Name}.");

    private sealed record ProductResponse(Guid Id, int AvailableQuantity, int ReservedQuantity, bool IsActive);
    private sealed record InvoiceLineResponse(Guid ProductId, int Quantity);
    private sealed record InvoiceResponse(Guid Id, long Number, string Status, bool IsCancelled, List<InvoiceLineResponse> Lines);
    private sealed record ReservationResponse(Guid InvoiceId, Guid ProductId, int Quantity, string State);
    private sealed record ProblemResponse(string Title, int Status, string Detail);
}
