import { DOCUMENT, DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  OnDestroy,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { catchError, forkJoin, map, of, switchMap, tap } from 'rxjs';

import { problemMessage } from '../../../core/api/problem-details';
import { Product } from '../../products/data-access/product.models';
import { ProductsApi } from '../../products/data-access/products-api';
import { Invoice } from '../data-access/invoice.models';
import { InvoicesApi } from '../data-access/invoices-api';

export interface InvoicePrintRow {
  productId: string;
  code: string;
  name: string;
  description: string;
  quantity: number;
}

export function canPrintInvoice(invoice: Invoice | null): boolean {
  return !!invoice && invoice.status === 'Closed' && !invoice.isCancelled;
}

export function buildInvoicePrintRows(
  invoice: Invoice | null,
  products: readonly Product[],
): InvoicePrintRow[] {
  if (!invoice) return [];
  const productMap = new Map(products.map((product) => [product.id, product]));
  return invoice.lines.map((line) => {
    const product = productMap.get(line.productId);
    return {
      productId: line.productId,
      code: product?.code ?? 'Produto indisponível',
      name: product?.name ?? line.productId,
      description: product?.description ?? '',
      quantity: line.quantity,
    };
  });
}

@Component({
  selector: 'app-invoice-print-page',
  imports: [DatePipe, MatButtonModule, MatProgressBarModule, RouterLink],
  templateUrl: './invoice-print-page.html',
  styleUrl: './invoice-print-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoicePrintPage implements OnDestroy {
  private readonly invoicesApi = inject(InvoicesApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly document = inject(DOCUMENT);

  readonly invoice = signal<Invoice | null>(null);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly printable = computed(() => canPrintInvoice(this.invoice()));
  readonly rows = computed(() => buildInvoicePrintRows(this.invoice(), this.products()));
  readonly totalQuantity = computed(() =>
    this.rows().reduce((total, row) => total + row.quantity, 0),
  );

  constructor() {
    this.document.body.classList.add('korp-print-mode');
    this.route.paramMap
      .pipe(
        map((params) => params.get('id') ?? ''),
        tap(() => {
          this.loading.set(true);
          this.loadError.set(null);
        }),
        switchMap((id) =>
          forkJoin({
            invoice: this.invoicesApi.get(id),
            products: this.productsApi.list(true),
          }).pipe(
            map((result) => ({ result, error: null })),
            catchError((error: unknown) =>
              of({ result: null, error: problemMessage(error, 'faturamento') }),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe(({ result, error }) => {
        if (result) {
          this.invoice.set(result.invoice);
          this.products.set(result.products);
        }
        this.loadError.set(error);
        this.loading.set(false);
      });
  }

  ngOnDestroy(): void {
    this.document.body.classList.remove('korp-print-mode');
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    if (
      event.altKey &&
      !event.ctrlKey &&
      !event.metaKey &&
      event.key.toLocaleLowerCase('pt-BR') === 'p' &&
      this.printable()
    ) {
      event.preventDefault();
      this.print();
    }
  }

  print(): void {
    if (this.printable()) this.document.defaultView?.print();
  }
}
