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
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar } from '@angular/material/snack-bar';
import { MatTableModule } from '@angular/material/table';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ActivatedRoute, Router } from '@angular/router';
import { catchError, filter, map, of, startWith, Subject, switchMap, tap } from 'rxjs';

import { createIdempotencyKey } from '../../../core/api/idempotency';
import { problemMessage } from '../../../core/api/problem-details';
import {
  ConfirmationDialog,
  ConfirmationDialogData,
} from '../../../shared/confirmation-dialog/confirmation-dialog';
import {
  ListColumnDefinition,
  ListColumnPreferences,
  toggleVisibleColumn,
} from '../../../shared/list-column-preferences/list-column-preferences';
import { CreateProductDialog } from '../create-product-dialog/create-product-dialog';
import { Product } from '../data-access/product.models';
import { ProductsApi } from '../data-access/products-api';
import { ReplenishProductDialog } from '../replenish-product-dialog/replenish-product-dialog';

interface ProductMetrics {
  count: number;
  available: number;
  reserved: number;
  inactive: number;
}

export type ProductShortcut = 'create' | 'reload' | 'search' | null;
export type ProductColumn =
  | 'code'
  | 'name'
  | 'description'
  | 'availableQuantity'
  | 'reservedQuantity'
  | 'isActive'
  | 'createdAt'
  | 'updatedAt'
  | 'id';
export type ProductStatusFilter = 'all' | 'active' | 'inactive';
type ListPanel = 'filters' | 'columns' | null;

export interface ProductListFilters {
  id: string;
  code: string;
  name: string;
  description: string;
  status: ProductStatusFilter;
  availableMin: number | null;
  availableMax: number | null;
  reservedMin: number | null;
  reservedMax: number | null;
  createdFrom: string;
  createdTo: string;
  updatedFrom: string;
  updatedTo: string;
}

export const PRODUCT_COLUMN_DEFINITIONS: readonly ListColumnDefinition<ProductColumn>[] = [
  { key: 'code', label: 'Código', visibleByDefault: true },
  { key: 'name', label: 'Nome', visibleByDefault: true },
  { key: 'description', label: 'Descrição', visibleByDefault: true },
  { key: 'availableQuantity', label: 'Saldo disponível', visibleByDefault: true },
  { key: 'reservedQuantity', label: 'Saldo reservado', visibleByDefault: true },
  { key: 'isActive', label: 'Status', visibleByDefault: true },
  { key: 'createdAt', label: 'Criado em', visibleByDefault: false },
  { key: 'updatedAt', label: 'Atualizado em', visibleByDefault: false },
  { key: 'id', label: 'ID técnico', visibleByDefault: false },
];

const PRODUCT_COLUMNS_STORAGE_KEY = 'korp.products.visible-columns.v1';

export function resolveProductShortcut(
  event: Pick<KeyboardEvent, 'altKey' | 'ctrlKey' | 'key' | 'metaKey'>,
): ProductShortcut {
  if (event.ctrlKey || event.metaKey) return null;

  const key = event.key.toLocaleLowerCase('pt-BR');
  if (event.altKey && key === 'n') return 'create';
  if (event.altKey && key === 'r') return 'reload';
  if (!event.altKey && key === '/') return 'search';
  return null;
}

export function productMatchesFilters(product: Product, filters: ProductListFilters): boolean {
  return (
    contains(product.id, filters.id) &&
    contains(product.code, filters.code) &&
    contains(product.name, filters.name) &&
    contains(product.description, filters.description) &&
    (filters.status === 'all' ||
      (filters.status === 'active' ? product.isActive : !product.isActive)) &&
    inNumberRange(product.availableQuantity, filters.availableMin, filters.availableMax) &&
    inNumberRange(product.reservedQuantity, filters.reservedMin, filters.reservedMax) &&
    inDateRange(product.createdAt, filters.createdFrom, filters.createdTo) &&
    inDateRange(product.updatedAt, filters.updatedFrom, filters.updatedTo)
  );
}

export function countProductFilters(filters: ProductListFilters): number {
  return [
    filters.id,
    filters.code,
    filters.name,
    filters.description,
    filters.availableMin,
    filters.availableMax,
    filters.reservedMin,
    filters.reservedMax,
    filters.createdFrom,
    filters.createdTo,
    filters.updatedFrom,
    filters.updatedTo,
    filters.status === 'all' ? '' : filters.status,
  ].filter((value) => value !== '' && value !== null).length;
}

@Component({
  selector: 'app-products-page',
  imports: [
    DatePipe,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressBarModule,
    MatSelectModule,
    MatTableModule,
    MatTooltipModule,
    ReactiveFormsModule,
  ],
  templateUrl: './products-page.html',
  styleUrl: './products-page.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsPage {
  private readonly api = inject(ProductsApi);
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly columnPreferences = inject(ListColumnPreferences);
  private readonly reloadRequest = new Subject<void>();
  private readonly activationKeys = new Map<string, string>();
  private readonly searchInput = viewChild.required<ElementRef<HTMLInputElement>>('searchInput');

  readonly columnDefinitions = PRODUCT_COLUMN_DEFINITIONS;
  readonly visibleColumns = signal<ProductColumn[]>(
    this.columnPreferences.load(PRODUCT_COLUMNS_STORAGE_KEY, PRODUCT_COLUMN_DEFINITIONS),
  );
  readonly displayedColumns = computed(() => [...this.visibleColumns(), 'actions']);
  readonly activePanel = signal<ListPanel>(null);
  readonly products = signal<Product[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);
  readonly searchTerm = signal(this.route.snapshot.queryParamMap.get('q') ?? '');
  readonly pendingProducts = signal<ReadonlySet<string>>(new Set());

  readonly filters = new FormGroup({
    id: new FormControl(this.query('productId'), { nonNullable: true }),
    code: new FormControl(this.query('code'), { nonNullable: true }),
    name: new FormControl(this.query('name'), { nonNullable: true }),
    description: new FormControl(this.query('description'), { nonNullable: true }),
    status: new FormControl<ProductStatusFilter>(this.productStatusQuery(), { nonNullable: true }),
    availableMin: new FormControl<number | null>(this.numberQuery('availableMin')),
    availableMax: new FormControl<number | null>(this.numberQuery('availableMax')),
    reservedMin: new FormControl<number | null>(this.numberQuery('reservedMin')),
    reservedMax: new FormControl<number | null>(this.numberQuery('reservedMax')),
    createdFrom: new FormControl(this.query('createdFrom'), { nonNullable: true }),
    createdTo: new FormControl(this.query('createdTo'), { nonNullable: true }),
    updatedFrom: new FormControl(this.query('updatedFrom'), { nonNullable: true }),
    updatedTo: new FormControl(this.query('updatedTo'), { nonNullable: true }),
  });
  readonly filterValues = signal<ProductListFilters>(this.filters.getRawValue());
  readonly activeFilterCount = computed(() => countProductFilters(this.filterValues()));

  readonly filteredProducts = computed(() => {
    const term = normalize(this.searchTerm());
    const filters = this.filterValues();
    return this.products().filter(
      (product) =>
        productMatchesFilters(product, filters) &&
        (!term ||
          normalize(
            `${product.code} ${product.name} ${product.description} ${product.id}`,
          ).includes(term)),
    );
  });

  readonly metrics = computed<ProductMetrics>(() =>
    this.products().reduce(
      (result, product) => ({
        count: result.count + 1,
        available: result.available + product.availableQuantity,
        reserved: result.reserved + product.reservedQuantity,
        inactive: result.inactive + (product.isActive ? 0 : 1),
      }),
      { count: 0, available: 0, reserved: 0, inactive: 0 },
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
          this.loadError.set(null);
        }),
        switchMap(() =>
          this.api.list(true).pipe(
            map((products) => ({ products, error: null })),
            catchError((error: unknown) => of({ products: null, error: problemMessage(error) })),
          ),
        ),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe((result) => {
        if (result.products) this.products.set(result.products);
        this.loadError.set(result.error);
        this.loading.set(false);
      });
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardShortcut(event: KeyboardEvent): void {
    const shortcut = resolveProductShortcut(event);
    if (!shortcut || this.dialog.openDialogs.length > 0) return;
    if (shortcut === 'search' && this.isEditableTarget(event.target)) return;

    event.preventDefault();
    if (shortcut === 'create') this.openCreateDialog();
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

  togglePanel(panel: Exclude<ListPanel, null>): void {
    this.activePanel.update((current) => (current === panel ? null : panel));
  }

  toggleColumn(column: ProductColumn): void {
    const next = toggleVisibleColumn(this.visibleColumns(), column, PRODUCT_COLUMN_DEFINITIONS);
    this.visibleColumns.set(next);
    this.columnPreferences.save(PRODUCT_COLUMNS_STORAGE_KEY, next);
  }

  isColumnVisible(column: ProductColumn): boolean {
    return this.visibleColumns().includes(column);
  }

  clearFilters(): void {
    this.searchTerm.set('');
    this.filters.reset({
      id: '',
      code: '',
      name: '',
      description: '',
      status: 'all',
      availableMin: null,
      availableMax: null,
      reservedMin: null,
      reservedMax: null,
      createdFrom: '',
      createdTo: '',
      updatedFrom: '',
      updatedTo: '',
    });
    this.persistFilters();
  }

  reload(): void {
    this.reloadRequest.next();
  }

  openCreateDialog(): void {
    this.dialog
      .open(CreateProductDialog, {
        width: '640px',
        maxWidth: 'calc(100vw - 24px)',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      })
      .afterClosed()
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe((product: Product) => {
        this.upsertProduct(product);
        this.snackBar.open(`Produto ${product.code} cadastrado.`, 'Fechar', { duration: 4500 });
      });
  }

  openReplenishDialog(product: Product): void {
    if (!product.isActive) return;

    this.dialog
      .open(ReplenishProductDialog, {
        data: product,
        width: '500px',
        maxWidth: 'calc(100vw - 24px)',
        autoFocus: 'first-tabbable',
        restoreFocus: true,
      })
      .afterClosed()
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe((updatedProduct: Product) => {
        this.upsertProduct(updatedProduct);
        this.snackBar.open(
          `Estoque de ${updatedProduct.code} atualizado para ${updatedProduct.availableQuantity}.`,
          'Fechar',
          { duration: 4500 },
        );
      });
  }

  confirmActivation(product: Product): void {
    const targetState = !product.isActive;
    const data: ConfirmationDialogData = {
      title: targetState ? 'Reativar produto?' : 'Inativar produto?',
      message: targetState
        ? `${product.code} voltará a aceitar reposições e novas reservas.`
        : `${product.code} deixará de aceitar reposições e novas reservas. Reservas existentes serão mantidas.`,
      confirmLabel: targetState ? 'Reativar' : 'Inativar',
      destructive: !targetState,
    };

    this.dialog
      .open(ConfirmationDialog, { data, width: '500px', maxWidth: 'calc(100vw - 24px)' })
      .afterClosed()
      .pipe(filter(Boolean), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => this.setActivation(product, targetState));
  }

  isPending(productId: string): boolean {
    return this.pendingProducts().has(productId);
  }

  private setActivation(product: Product, isActive: boolean): void {
    if (this.isPending(product.id)) return;

    const actionId = `${product.id}:${isActive}`;
    const key = this.activationKeys.get(actionId) ?? createIdempotencyKey();
    this.activationKeys.set(actionId, key);
    this.actionError.set(null);
    this.setPending(product.id, true);

    this.api
      .setActive(product.id, { isActive }, key)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (updatedProduct) => {
          this.activationKeys.delete(actionId);
          this.setPending(product.id, false);
          this.upsertProduct(updatedProduct);
          this.snackBar.open(
            `${updatedProduct.code} foi ${updatedProduct.isActive ? 'reativado' : 'inativado'}.`,
            'Fechar',
            { duration: 4500 },
          );
        },
        error: (error: unknown) => {
          this.setPending(product.id, false);
          this.actionError.set(problemMessage(error));
        },
      });
  }

  private upsertProduct(product: Product): void {
    this.products.update((products) => {
      const index = products.findIndex((item) => item.id === product.id);
      const updated =
        index === -1
          ? [...products, product]
          : products.map((item) => (item.id === product.id ? product : item));
      return [...updated].sort((left, right) => left.code.localeCompare(right.code, 'pt-BR'));
    });
  }

  private setPending(productId: string, pending: boolean): void {
    this.pendingProducts.update((current) => {
      const next = new Set(current);
      if (pending) next.add(productId);
      else next.delete(productId);
      return next;
    });
  }

  private persistFilters(): void {
    const filters = this.filters.getRawValue();
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {
        q: this.searchTerm().trim() || null,
        productId: filters.id.trim() || null,
        code: filters.code.trim() || null,
        name: filters.name.trim() || null,
        description: filters.description.trim() || null,
        status: filters.status === 'all' ? null : filters.status,
        availableMin: filters.availableMin,
        availableMax: filters.availableMax,
        reservedMin: filters.reservedMin,
        reservedMax: filters.reservedMax,
        createdFrom: filters.createdFrom || null,
        createdTo: filters.createdTo || null,
        updatedFrom: filters.updatedFrom || null,
        updatedTo: filters.updatedTo || null,
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

  private productStatusQuery(): ProductStatusFilter {
    const value = this.route.snapshot.queryParamMap.get('status');
    return value === 'active' || value === 'inactive' ? value : 'all';
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
