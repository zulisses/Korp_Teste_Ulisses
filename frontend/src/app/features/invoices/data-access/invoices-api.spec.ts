import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Invoice } from './invoice.models';
import { InvoicesApi } from './invoices-api';

describe('InvoicesApi', () => {
  let api: InvoicesApi;
  let httpTesting: HttpTestingController;

  const invoice: Invoice = {
    id: 'b8d6cd5e-a3fd-4d5c-b7c7-d4e1aebc3022',
    number: 42,
    status: 'Open',
    isCancelled: false,
    createdAt: '2026-08-20T12:00:00Z',
    closedAt: null,
    cancelledAt: null,
    lines: [],
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(InvoicesApi);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('lists invoices from the billing proxy', () => {
    api.list().subscribe((invoices) => expect(invoices).toEqual([invoice]));

    const request = httpTesting.expectOne('/billing-api/api/invoices');
    expect(request.request.method).toBe('GET');
    request.flush([invoice]);
  });

  it('creates an invoice with the caller-owned idempotency key', () => {
    const key = '11111111-1111-4111-8111-111111111111';
    api.create(key).subscribe();

    const request = httpTesting.expectOne('/billing-api/api/invoices');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe(key);
    request.flush(invoice);
  });

  it('sets a line through billing and preserves the supplied key', () => {
    const key = '22222222-2222-4222-8222-222222222222';
    const productId = '4ed26e35-89aa-48ed-ab54-2132c34844fc';
    api.setLine(invoice.id, productId, { quantity: 3 }, key).subscribe();

    const request = httpTesting.expectOne(
      `/billing-api/api/invoices/${invoice.id}/products/${productId}`,
    );
    expect(request.request.method).toBe('PUT');
    expect(request.request.body).toEqual({ quantity: 3 });
    expect(request.request.headers.get('Idempotency-Key')).toBe(key);
    request.flush({ ...invoice, lines: [{ productId, quantity: 3 }] });
  });

  it('uses distinct lifecycle endpoints for cancel and print', () => {
    const cancelKey = '33333333-3333-4333-8333-333333333333';
    const printKey = '44444444-4444-4444-8444-444444444444';
    api.cancel(invoice.id, cancelKey).subscribe();
    api.print(invoice.id, printKey).subscribe();

    const cancelRequest = httpTesting.expectOne(`/billing-api/api/invoices/${invoice.id}/cancel`);
    expect(cancelRequest.request.headers.get('Idempotency-Key')).toBe(cancelKey);
    cancelRequest.flush(null);

    const printRequest = httpTesting.expectOne(`/billing-api/api/invoices/${invoice.id}/print`);
    expect(printRequest.request.headers.get('Idempotency-Key')).toBe(printKey);
    printRequest.flush({ ...invoice, status: 'Closed' });
  });
});
