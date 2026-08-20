import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { catchError, finalize, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { createIdempotencyKey } from '../../../core/api/idempotency';
import { problemMessage } from '../../../core/api/problem-details';
import {
  ListColumnDefinition,
  ListColumnPreferences,
  toggleVisibleColumn,
} from '../../../shared/list-column-preferences/list-column-preferences';
import { Invoice, invoiceStatusLabel, invoiceViewStatus } from '../data-access/invoice.models';
import { InvoicesApi } from '../data-access/invoices-api';

export type InvoiceListShortcut = 'create' | 'reload' | 'search' | null;
export type InvoiceStatusFilter = 'all' | 'open' | 'closed' | 'cancelled';
export type InvoiceCancellationFilter = 'all' | 'cancelled' | 'not-cancelled';
export type InvoiceColumn =
  | 'number'
  | 'status'
  | 'lines'
  | 'quantity'
  | 'createdAt'
  | 'closedAt'
  | 'cancelledAt'
  | 'isCancelled'
  | 'id';
type ListPanel = 'filters' | 'columns' | null;

export interface InvoiceListFilters {
  id: string;
  situation: InvoiceStatusFilter;
  cancellation: InvoiceCancellationFilter;
  numberMin: number | null;
  numberMax: number | null;
  itemsMin: number | null;
  itemsMax: number | null;
  quantityMin: number | null;
  quantityMax: number | null;
  productId: string;
  createdFrom: string;
  createdTo: string;
  closedFrom: string;
  closedTo: string;
  cancelledFrom: string;
  cancelledTo: string;
}

export const INVOICE_COLUMN_DEFINITIONS: readonly ListColumnDefinition<InvoiceColumn>[] = [
  { key: 'number', label: 'Número', visibleByDefault: true },
  { key: 'status', label: 'Situação', visibleByDefault: true },
  { key: 'lines', label: 'Itens', visibleByDefault: true },
  { key: 'quantity', label: 'Quantidade total', visibleByDefault: true },
  { key: 'createdAt', label: 'Criada em', visibleByDefault: true },
  { key: 'closedAt', label: 'Fechada em', visibleByDefault: false },
  { key: 'cancelledAt', label: 'Cancelada em', visibleByDefault: false },
  { key: 'isCancelled', label: 'Indicador de cancelamento', visibleByDefault: false },
  { key: 'id', label: 'ID técnico', visibleByDefault: false },
];

const INVOICE_COLUMNS_STORAGE_KEY = 'korp.invoices.visible-columns.v1';

export function parseInvoiceStatusFilter(value: string | null): InvoiceStatusFilter {
  return value === 'open' || value === 'closed' || value === 'cancelled' ? value : 'all';
}

export function matchesInvoiceStatus(invoice: Invoice, filter: InvoiceStatusFilter): boolean {
  return filter === 'all' || invoiceViewStatus(invoice) === filter;
}

export function resolveInvoiceListShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'>,
): InvoiceListShortcut {
  if (event.ctrlKey || event.metaKey) return null;
  const key = event.key.toLocaleLowerCase('pt-BR');
  if (event.altKey && key === 'n') return 'create';
  if (event.altKey && key === 'r') return 'reload';
  if (!event.altKey && key === '/') return 'search';
  return null;
}

export function invoiceMatchesFilters(invoice: Invoice, filters: InvoiceListFilters): boolean {
  const quantity = invoice.lines.reduce((total, line) => total + line.quantity, 0);
  return (
    contains(invoice.id, filters.id) &&
    matchesInvoiceStatus(invoice, filters.situation) &&
    (filters.cancellation === 'all' ||
      (filters.cancellation === 'cancelled' ? invoice.isCancelled : !invoice.isCancelled)) &&
    inNumberRange(invoice.number, filters.numberMin, filters.numberMax) &&
    inNumberRange(invoice.lines.length, filters.itemsMin, filters.itemsMax) &&
    inNumberRange(quantity, filters.quantityMin, filters.quantityMax) &&
    (!normalize(filters.productId) ||
      invoice.lines.some((line) => contains(line.productId, filters.productId))) &&
    inDateRange(invoice.createdAt, filters.createdFrom, filters.createdTo) &&
    inNullableDateRange(invoice.closedAt, filters.closedFrom, filters.closedTo) &&
    inNullableDateRange(invoice.cancelledAt, filters.cancelledFrom, filters.cancelledTo)
  );
}

export function countInvoiceFilters(filters: InvoiceListFilters): number {
  return [
    filters.id,
    filters.situation === 'all' ? '' : filters.situation,
    filters.cancellation === 'all' ? '' : filters.cancellation,
    filters.numberMin,
    filters.numberMax,
    filters.itemsMin,
    filters.itemsMax,
    filters.quantityMin,
    filters.quantityMax,
    filters.productId,
    filters.createdFrom,
    filters.createdTo,
    filters.closedFrom,
    filters.closedTo,
    filters.cancelledFrom,
    filters.cancelledTo,
  ].filter((value) => value !== '' && value !== null).length;
}

@Component({
  selector: 'app-invoices-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatButtonToggleModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    ReactiveFormsModule,
    RouterLink,
  ],
  templateUrl: './invoices-page.html',
  styleUrl: './invoices-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoicesPage {
  private readonly api = inject(InvoicesApi);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly columnPreferences = inject(ListColumnPreferences);
  private readonly reloadRequest = new Subject<void>();
  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');
  private createKey: string | null = null;

  readonly columnDefinitions = INVOICE_COLUMN_DEFINITIONS;
  readonly visibleColumns = signal<InvoiceColumn[]>(
    this.columnPreferences.load(INVOICE_COLUMNS_STORAGE_KEY, INVOICE_COLUMN_DEFINITIONS),
  );
  readonly displayedColumns = computed(() => [...this.visibleColumns(), 'actions']);
  readonly activePanel = signal<ListPanel>(null);
  readonly invoices = signal<Invoice[]>([]);
  readonly loading = signal(true);
  readonly creating = signal(false);
  readonly error = signal<string | null>(null);
  readonly searchTerm = signal(this.route.snapshot.queryParamMap.get('q') ?? '');

  readonly filters = new FormGroup({
    id: new FormControl(this.query('invoiceId'), { nonNullable: true }),
    situation: new FormControl<InvoiceStatusFilter>(
      parseInvoiceStatusFilter(this.route.snapshot.queryParamMap.get('status')),
      { nonNullable: true },
    ),
    cancellation: new FormControl<InvoiceCancellationFilter>(this.cancellationQuery(), {
      nonNullable: true,
    }),
    numberMin: new FormControl<number | null>(this.numberQuery('numberMin')),
    numberMax: new FormControl<number | null>(this.numberQuery('numberMax')),
    itemsMin: new FormControl<number | null>(this.numberQuery('itemsMin')),
    itemsMax: new FormControl<number | null>(this.numberQuery('itemsMax')),
    quantityMin: new FormControl<number | null>(this.numberQuery('quantityMin')),
    quantityMax: new FormControl<number | null>(this.numberQuery('quantityMax')),
    productId: new FormControl(this.query('productId'), { nonNullable: true }),
    createdFrom: new FormControl(this.query('createdFrom'), { nonNullable: true }),
    createdTo: new FormControl(this.query('createdTo'), { nonNullable: true }),
    closedFrom: new FormControl(this.query('closedFrom'), { nonNullable: true }),
    closedTo: new FormControl(this.query('closedTo'), { nonNullable: true }),
    cancelledFrom: new FormControl(this.query('cancelledFrom'), { nonNullable: true }),
    cancelledTo: new FormControl(this.query('cancelledTo'), { nonNullable: true }),
  });
  readonly filterValues = signal<InvoiceListFilters>(this.filters.getRawValue());
  readonly statusFilter = computed(() => this.filterValues().situation);
  readonly activeFilterCount = computed(() => countInvoiceFilters(this.filterValues()));

  readonly filteredInvoices = computed(() => {
    const term = normalize(this.searchTerm()).replace(/^#/, '');
    const filters = this.filterValues();
    return this.invoices().filter(
      (invoice) =>
        invoiceMatchesFilters(invoice, filters) &&
        (!term || String(invoice.number).includes(term) || normalize(invoice.id).includes(term)),
    );
  });

  readonly metrics = computed(() =>
    this.invoices().reduce(
      (result, invoice) => {
        const status = invoiceViewStatus(invoice);
        result.total += 1;
        result[status] += 1;
        return result;
      },
      { total: 0, open: 0, closed: 0, cancelled: 0 },
    ),
  );

  constructor() {
    this.filters.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.filterValues.set(this.filters.getRawValue());
      this.persistFilters();
    });

    this.reloadRequest
      .pipe(
        startWith(undefined),
        tap(() => {
          this.loading.set(true);
          this.error.set(null);
        }),
        switchMap(() =>
          this.api.list().pipe(
            map((invoices) => ({ invoices, error: null })),
            catchError((error: unknown) =>
              of({ invoices: null, error: problemMessage(error, 'faturamento') }),
            ),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result.invoices) this.invoices.set(result.invoices);
        this.error.set(result.error);
        this.loading.set(false);
      });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    const shortcut = resolveInvoiceListShortcut(event);
    if (!shortcut) return;
    if (shortcut === 'search' && this.isEditableTarget(event.target)) return;

    event.preventDefault();
    if (shortcut === 'create') this.createInvoice();
    else if (shortcut === 'reload' && !this.loading()) this.reload();
    else if (shortcut === 'search') {
      this.searchInput().nativeElement.focus();
      this.searchInput().nativeElement.select();
    }
  }

  setSearchTerm(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
    this.persistFilters();
  }

  setStatusFilter(filter: InvoiceStatusFilter): void {
    this.filters.controls.situation.setValue(filter);
  }

  togglePanel(panel: Exclude<ListPanel, null>): void {
    this.activePanel.update((current) => (current === panel ? null : panel));
  }

  toggleColumn(column: InvoiceColumn): void {
    const next = toggleVisibleColumn(this.visibleColumns(), column, INVOICE_COLUMN_DEFINITIONS);
    this.visibleColumns.set(next);
    this.columnPreferences.save(INVOICE_COLUMNS_STORAGE_KEY, next);
  }

  isColumnVisible(column: InvoiceColumn): boolean {
    return this.visibleColumns().includes(column);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.filters.reset({
      id: '',
      situation: 'all',
      cancellation: 'all',
      numberMin: null,
      numberMax: null,
      itemsMin: null,
      itemsMax: null,
      quantityMin: null,
      quantityMax: null,
      productId: '',
      createdFrom: '',
      createdTo: '',
      closedFrom: '',
      closedTo: '',
      cancelledFrom: '',
      cancelledTo: '',
    });
    this.persistFilters();
  }

  reload(): void {
    this.reloadRequest.next();
  }

  createInvoice(): void {
    if (this.creating()) return;
    this.createKey ??= createIdempotencyKey();
    this.creating.set(true);
    this.error.set(null);

    this.api
      .create(this.createKey)
      .pipe(
        finalize(() => this.creating.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (invoice) => {
          this.createKey = null;
          this.snackBar.open(`Nota #${invoice.number} criada.`, 'Fechar', { duration: 3500 });
          void this.router.navigate(['/notas', invoice.id], { queryParamsHandling: 'preserve' });
        },
        error: (error: unknown) => this.error.set(problemMessage(error, 'faturamento')),
      });
  }

  totalQuantity(invoice: Invoice): number {
    return invoice.lines.reduce((total, line) => total + line.quantity, 0);
  }

  statusLabel(invoice: Invoice): string {
    return invoiceStatusLabel(invoice);
  }

  statusClass(invoice: Invoice): string {
    return `status status--${invoiceViewStatus(invoice)}`;
  }

  private persistFilters(): void {
    const filters = this.filters.getRawValue();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchTerm().trim() || null,
        invoiceId: filters.id.trim() || null,
        status: filters.situation === 'all' ? null : filters.situation,
        cancellation: filters.cancellation === 'all' ? null : filters.cancellation,
        numberMin: filters.numberMin,
        numberMax: filters.numberMax,
        itemsMin: filters.itemsMin,
        itemsMax: filters.itemsMax,
        quantityMin: filters.quantityMin,
        quantityMax: filters.quantityMax,
        productId: filters.productId.trim() || null,
        createdFrom: filters.createdFrom || null,
        createdTo: filters.createdTo || null,
        closedFrom: filters.closedFrom || null,
        closedTo: filters.closedTo || null,
        cancelledFrom: filters.cancelledFrom || null,
        cancelledTo: filters.cancelledTo || null,
      },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  private query(name: string): string {
    return this.route.snapshot.queryParamMap.get(name) ?? '';
  }

  private numberQuery(name: string): number | null {
    const value = this.route.snapshot.queryParamMap.get(name);
    if (value === null || value.trim() === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  private cancellationQuery(): InvoiceCancellationFilter {
    const value = this.route.snapshot.queryParamMap.get('cancellation');
    return value === 'cancelled' || value === 'not-cancelled' ? value : 'all';
  }

  private isEditableTarget(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      target.matches('input, textarea, select, [contenteditable="true"]')
    );
  }
}

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('pt-BR');
}

function contains(value: string, filter: string): boolean {
  const normalizedFilter = normalize(filter);
  return !normalizedFilter || normalize(value).includes(normalizedFilter);
}

function inNumberRange(value: number, minimum: number | null, maximum: number | null): boolean {
  return (minimum === null || value >= minimum) && (maximum === null || value <= maximum);
}

function inNullableDateRange(value: string | null, from: string, to: string): boolean {
  if (!from && !to) return true;
  return value !== null && inDateRange(value, from, to);
}

function inDateRange(value: string, from: string, to: string): boolean {
  const date = localDateKey(value);
  return (!from || date >= from) && (!to || date <= to);
}

function localDateKey(value: string): string {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
