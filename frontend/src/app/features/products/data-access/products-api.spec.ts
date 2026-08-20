import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';

import { Product } from './product.models';
import { ProductsApi } from './products-api';

describe('ProductsApi', () => {
  let api: ProductsApi;
  let httpTesting: HttpTestingController;

  const product: Product = {
    id: '33d31e7e-dc94-40ba-a9b4-cb60a4e914d1',
    code: 'PROD-001',
    name: 'Caneta azul',
    description: 'Caneta esferográfica de ponta fina',
    availableQuantity: 8,
    reservedQuantity: 2,
    isActive: true,
    createdAt: '2026-08-20T12:00:00Z',
    updatedAt: '2026-08-20T12:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    api = TestBed.inject(ProductsApi);
    httpTesting = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpTesting.verify());

  it('requests the product list with the inactive filter', () => {
    api.list(true).subscribe((products) => expect(products).toEqual([product]));

    const request = httpTesting.expectOne(
      (candidate) =>
        candidate.url === '/stock-api/api/products' &&
        candidate.params.get('includeInactive') === 'true',
    );
    expect(request.request.method).toBe('GET');
    request.flush([product]);
  });

  it('sends one caller-owned idempotency key when creating a product', () => {
    const key = '11111111-1111-4111-8111-111111111111';
    const payload = {
      code: 'PROD-001',
      name: 'Caneta azul',
      description: 'Caneta esferográfica de ponta fina',
      initialQuantity: 10,
    };

    api.create(payload, key).subscribe((created) => expect(created).toEqual(product));

    const request = httpTesting.expectOne('/stock-api/api/products');
    expect(request.request.method).toBe('POST');
    expect(request.request.headers.get('Idempotency-Key')).toBe(key);
    expect(request.request.body).toEqual(payload);
    request.flush(product);
  });

  it('uses the activation endpoint and keeps the supplied key', () => {
    const key = '22222222-2222-4222-8222-222222222222';

    api.setActive(product.id, { isActive: false }, key).subscribe();

    const request = httpTesting.expectOne(`/stock-api/api/products/${product.id}/activation`);
    expect(request.request.method).toBe('PUT');
    expect(request.request.headers.get('Idempotency-Key')).toBe(key);
    request.flush({ ...product, isActive: false });
  });
});
