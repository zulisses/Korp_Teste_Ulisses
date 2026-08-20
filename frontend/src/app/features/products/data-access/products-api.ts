import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import {
  CreateProductRequest,
  Product,
  ReplenishProductRequest,
  SetProductActiveRequest,
} from './product.models';

@Injectable({ providedIn: 'root' })
export class ProductsApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/stock-api/api/products';

  list(includeInactive: boolean): Observable<Product[]> {
    return this.http.get<Product[]>(this.baseUrl, {
      params: { includeInactive },
    });
  }

  create(request: CreateProductRequest, idempotencyKey: string): Observable<Product> {
    return this.http.post<Product>(this.baseUrl, request, {
      headers: this.idempotencyHeaders(idempotencyKey),
    });
  }

  replenish(
    productId: string,
    request: ReplenishProductRequest,
    idempotencyKey: string,
  ): Observable<Product> {
    return this.http.post<Product>(`${this.baseUrl}/${productId}/replenishments`, request, {
      headers: this.idempotencyHeaders(idempotencyKey),
    });
  }

  setActive(
    productId: string,
    request: SetProductActiveRequest,
    idempotencyKey: string,
  ): Observable<Product> {
    return this.http.put<Product>(`${this.baseUrl}/${productId}/activation`, request, {
      headers: this.idempotencyHeaders(idempotencyKey),
    });
  }

  private idempotencyHeaders(idempotencyKey: string): HttpHeaders {
    return new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
  }
}
