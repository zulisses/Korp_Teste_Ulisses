import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  HostListener,
  computed,
  inject,
  signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import {
  catchError,
  combineLatest,
  filter,
  finalize,
  forkJoin,
  map,
  of,
  startWith,
  Subject,
  switchMap,
  tap,
} from 'rxjs';

import { createIdempotencyKey } from '../../../core/api/idempotency';
import { problemMessage } from '../../../core/api/problem-details';
import {
  ConfirmationDialog,
  ConfirmationDialogData,
} from '../../../shared/confirmation-dialog/confirmation-dialog';
import { Product } from '../../products/data-access/product.models';
import { ProductsApi } from '../../products/data-access/products-api';
import {
  Invoice,
  InvoiceLine,
  invoiceStatusLabel,
  invoiceViewStatus,
} from '../data-access/invoice.models';
import { InvoicesApi } from '../data-access/invoices-api';
import {
  InvoiceLineDialog,
  InvoiceLineDialogData,
} from '../invoice-line-dialog/invoice-line-dialog';

interface InvoiceLineRow extends InvoiceLine {
  product?: Product;
}

export type InvoiceDetailShortcut = 'add' | 'print' | 'reload' | null;

export function resolveInvoiceDetailShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'>,
): InvoiceDetailShortcut {
  if (event.ctrlKey || event.metaKey || !event.altKey) return null;
  const key = event.key.toLocaleLowerCase('pt-BR');
  if (key === 'i') return 'add';
  if (key === 'p') return 'print';
  if (key === 'r') return 'reload';
  return null;
}

@Component({
  selector: 'app-invoice-detail-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatProgressBarModule,
    MatTableModule,
    MatTooltipModule,
    RouterLink,
  ],
  templateUrl: './invoice-detail-page.html',
  styleUrl: './invoice-detail-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceDetailPage {
  private readonly invoicesApi = inject(InvoicesApi);
  private readonly productsApi = inject(ProductsApi);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly reloadRequest = new Subject<void>();
  private readonly lineKeys = new Map<string, string>();
  private cancelKey: string | null = null;
  private printKey: string | null = null;

  readonly invoice = signal<Invoice | null>(null);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly pendingAction = signal<string | null>(null);
  readonly displayedColumns = ['product', 'available', 'quantity', 'actions'];

  readonly editable = computed(() => {
    const invoice = this.invoice();
    return !!invoice && invoice.status === 'Open' && !invoice.isCancelled;
  });

  readonly productMap = computed(
    () => new Map(this.products().map((product) => [product.id, product])),
  );

  readonly lineRows = computed<InvoiceLineRow[]>(() =>
    (this.invoice()?.lines ?? []).map((line) => ({
      ...line,
      product: this.productMap().get(line.productId),
    })),
  );

  readonly eligibleProducts = computed(() => {
    const lineProductIds = new Set((this.invoice()?.lines ?? []).map((line) => line.productId));
    return this.products().filter(
      (product) =>
        product.isActive && product.availableQuantity > 0 && !lineProductIds.has(product.id),
    );
  });

  readonly totalQuantity = computed(() =>
    (this.invoice()?.lines ?? []).reduce((total, line) => total + line.quantity, 0),
  );

  constructor() {
    const invoiceId = this.route.paramMap.pipe(map((params) => params.get('id') ?? ''));
    combineLatest([invoiceId, this.reloadRequest.pipe(startWith(undefined))])
      .pipe(
        tap(() => {
          this.loading.set(true);
          this.loadError.set(null);
        }),
        switchMap(([id]) =>
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

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    const shortcut = resolveInvoiceDetailShortcut(event);
    if (!shortcut || this.dialog.openDialogs.length > 0 || this.pendingAction()) return;
    event.preventDefault();
    if (shortcut === 'reload') this.reload();
    else if (shortcut === 'add' && this.editable()) this.openLineDialog();
    else if (shortcut === 'print') {
      if (this.editable() && (this.invoice()?.lines.length ?? 0) > 0) this.confirmPrint();
      else this.openPrintView();
    }
  }

  reload(): void {
    this.reloadRequest.next();
  }

  statusLabel(): string {
    const invoice = this.invoice();
    return invoice ? invoiceStatusLabel(invoice) : '';
  }

  statusClass(): string {
    const invoice = this.invoice();
    return invoice ? `status status--${invoiceViewStatus(invoice)}` : 'status';
  }

  openLineDialog(line?: InvoiceLine): void {
    const invoice = this.invoice();
    if (!invoice || !this.editable()) return;
    const currentProduct = line ? this.productMap().get(line.productId) : undefined;
    const products = line && currentProduct ? [currentProduct] : this.eligibleProducts();
    const data: InvoiceLineDialogData = { invoiceId: invoice.id, products, line };

    this.dialog
      .open(InvoiceLineDialog, {
        data,
        width: '720px',
        maxWidth: 'calc(100vw - 24px)',
        autoFocus: line ? 'input[type="number"]' : 'mat-select',
        restoreFocus: true,
      })
      .afterClosed()
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe((updated: Invoice) => {
        this.invoice.set(updated);
        this.refreshProducts();
        this.snackBar.open(
          line ? 'Quantidade atualizada.' : 'Item reservado e adicionado.',
          'Fechar',
          {
            duration: 3500,
          },
        );
      });
  }

  confirmRemove(row: InvoiceLineRow): void {
    const label = row.product ? `${row.product.code} — ${row.product.name}` : row.productId;
    const data: ConfirmationDialogData = {
      title: 'Remover item da nota?',
      message: `${label} será removido e ${row.quantity} unidade(s) voltarão ao saldo disponível.`,
      confirmLabel: 'Remover item',
      destructive: true,
    };
    this.dialog
      .open(ConfirmationDialog, { data, width: '520px', maxWidth: 'calc(100vw - 24px)' })
      .afterClosed()
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.removeLine(row));
  }

  confirmCancel(): void {
    const invoice = this.invoice();
    if (!invoice || !this.editable()) return;
    const data: ConfirmationDialogData = {
      title: `Cancelar nota #${invoice.number}?`,
      message:
        'Todas as reservas serão devolvidas ao estoque. A nota permanecerá apenas para consulta e não poderá ser alterada ou impressa.',
      confirmLabel: 'Cancelar nota',
      destructive: true,
    };
    this.dialog
      .open(ConfirmationDialog, { data, width: '540px', maxWidth: 'calc(100vw - 24px)' })
      .afterClosed()
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.cancelInvoice());
  }

  confirmPrint(): void {
    const invoice = this.invoice();
    if (!invoice || !this.editable() || invoice.lines.length === 0) return;
    const data: ConfirmationDialogData = {
      title: `Fechar nota #${invoice.number} e preparar impressão?`,
      message: `O fechamento consumirá ${this.totalQuantity()} unidade(s) reservada(s). Depois, o documento será aberto para imprimir ou salvar como PDF.`,
      confirmLabel: 'Fechar e abrir impressão',
    };
    this.dialog
      .open(ConfirmationDialog, { data, width: '540px', maxWidth: 'calc(100vw - 24px)' })
      .afterClosed()
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.printInvoice());
  }

  openPrintView(): void {
    const invoice = this.invoice();
    if (!invoice || invoice.status !== 'Closed' || invoice.isCancelled) return;
    void this.router.navigate(['/notas', invoice.id, 'impressao'], {
      queryParamsHandling: 'preserve',
    });
  }

  private removeLine(row: InvoiceLineRow): void {
    const invoice = this.invoice();
    if (!invoice || this.pendingAction()) return;
    const actionId = `remove:${row.productId}`;
    const key = this.lineKeys.get(actionId) ?? createIdempotencyKey();
    this.lineKeys.set(actionId, key);
    this.beginAction(actionId);
    this.invoicesApi
      .setLine(invoice.id, row.productId, { quantity: 0 }, key)
      .pipe(
        finalize(() => this.pendingAction.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.lineKeys.delete(actionId);
          this.invoice.set(updated);
          this.refreshProducts();
          this.snackBar.open('Item removido e reserva devolvida.', 'Fechar', { duration: 3500 });
        },
        error: (error: unknown) => this.actionError.set(problemMessage(error, 'faturamento')),
      });
  }

  private cancelInvoice(): void {
    const invoice = this.invoice();
    if (!invoice || this.pendingAction()) return;
    this.cancelKey ??= createIdempotencyKey();
    this.beginAction('cancel');
    this.invoicesApi
      .cancel(invoice.id, this.cancelKey)
      .pipe(
        finalize(() => this.pendingAction.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: () => {
          this.cancelKey = null;
          this.snackBar.open(`Nota #${invoice.number} cancelada.`, 'Fechar', { duration: 4500 });
          this.reload();
        },
        error: (error: unknown) => this.actionError.set(problemMessage(error, 'faturamento')),
      });
  }

  private printInvoice(): void {
    const invoice = this.invoice();
    if (!invoice || this.pendingAction()) return;
    this.printKey ??= createIdempotencyKey();
    this.beginAction('print');
    this.invoicesApi
      .print(invoice.id, this.printKey)
      .pipe(
        finalize(() => this.pendingAction.set(null)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (updated) => {
          this.printKey = null;
          this.invoice.set(updated);
          this.snackBar.open(
            `Nota #${invoice.number} fechada. Documento pronto para impressão.`,
            'Fechar',
            {
              duration: 4500,
            },
          );
          this.openPrintView();
        },
        error: (error: unknown) => this.actionError.set(problemMessage(error, 'faturamento')),
      });
  }

  private beginAction(action: string): void {
    this.actionError.set(null);
    this.pendingAction.set(action);
  }

  private refreshProducts(): void {
    this.productsApi
      .list(true)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: (products) => this.products.set(products) });
  }
}
