import { HttpClient, HttpHeaders } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';

import { Invoice, SetInvoiceLineRequest } from './invoice.models';

@Injectable({ providedIn: 'root' })
export class InvoicesApi {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = '/billing-api/api/invoices';

  list(): Observable<Invoice[]> {
    return this.http.get<Invoice[]>(this.baseUrl);
  }

  get(invoiceId: string): Observable<Invoice> {
    return this.http.get<Invoice>(`${this.baseUrl}/${invoiceId}`);
  }

  create(idempotencyKey: string): Observable<Invoice> {
    return this.http.post<Invoice>(this.baseUrl, null, {
      headers: this.idempotencyHeaders(idempotencyKey),
    });
  }

  setLine(
    invoiceId: string,
    productId: string,
    request: SetInvoiceLineRequest,
    idempotencyKey: string,
  ): Observable<Invoice> {
    return this.http.put<Invoice>(`${this.baseUrl}/${invoiceId}/products/${productId}`, request, {
      headers: this.idempotencyHeaders(idempotencyKey),
    });
  }

  cancel(invoiceId: string, idempotencyKey: string): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/${invoiceId}/cancel`, null, {
      headers: this.idempotencyHeaders(idempotencyKey),
    });
  }

  print(invoiceId: string, idempotencyKey: string): Observable<Invoice> {
    return this.http.post<Invoice>(`${this.baseUrl}/${invoiceId}/print`, null, {
      headers: this.idempotencyHeaders(idempotencyKey),
    });
  }

  private idempotencyHeaders(idempotencyKey: string): HttpHeaders {
    return new HttpHeaders({ 'Idempotency-Key': idempotencyKey });
  }
}
