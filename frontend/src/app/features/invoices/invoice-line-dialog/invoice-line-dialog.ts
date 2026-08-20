import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import {
  MAT_DIALOG_DATA,
  MatDialogActions,
  MatDialogClose,
  MatDialogContent,
  MatDialogRef,
  MatDialogTitle,
} from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { finalize } from 'rxjs';

import { createIdempotencyKey } from '../../../core/api/idempotency';
import { problemMessage } from '../../../core/api/problem-details';
import { Product } from '../../products/data-access/product.models';
import { InvoiceLine } from '../data-access/invoice.models';
import { InvoicesApi } from '../data-access/invoices-api';

export interface InvoiceLineDialogData {
  invoiceId: string;
  products: Product[];
  line?: InvoiceLine;
}

export function maximumInvoiceLineQuantity(product: Product, line?: InvoiceLine): number {
  const current = line?.productId === product.id ? line.quantity : 0;
  return product.availableQuantity + current;
}

@Component({
  selector: 'app-invoice-line-dialog',
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    ReactiveFormsModule,
  ],
  templateUrl: './invoice-line-dialog.html',
  styleUrl: './invoice-line-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class InvoiceLineDialog {
  private readonly api = inject(InvoicesApi);
  private readonly dialogRef = inject(MatDialogRef<InvoiceLineDialog>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);
  readonly data = inject<InvoiceLineDialogData>(MAT_DIALOG_DATA);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly quantityInput = viewChild.required<ElementRef<HTMLInputElement>>('quantityInput');
  readonly form = this.formBuilder.nonNullable.group({
    productId: [this.data.line?.productId ?? '', Validators.required],
    quantity: [this.data.line?.quantity ?? 1, [Validators.required, Validators.pattern(/^\d+$/)]],
  });
  private submissionKey: string | null = null;

  constructor() {
    if (this.data.line) this.form.controls.productId.disable();
    this.updateQuantityValidators();
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.submissionKey = null;
      this.error.set(null);
      this.updateQuantityValidators();
    });
  }

  selectedProduct(): Product | undefined {
    return this.data.products.find(
      (product) => product.id === this.form.controls.productId.getRawValue(),
    );
  }

  maximumQuantity(): number {
    const product = this.selectedProduct();
    if (!product) return 0;
    return maximumInvoiceLineQuantity(product, this.data.line);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      if (this.form.controls.productId.valid) this.quantityInput().nativeElement.focus();
      return;
    }
    if (this.saving()) return;

    const raw = this.form.getRawValue();
    this.submissionKey ??= createIdempotencyKey();
    this.saving.set(true);
    this.error.set(null);

    this.api
      .setLine(
        this.data.invoiceId,
        raw.productId,
        { quantity: Number(raw.quantity) },
        this.submissionKey,
      )
      .pipe(
        finalize(() => this.saving.set(false)),
        takeUntilDestroyed(this.destroyRef),
      )
      .subscribe({
        next: (invoice) => this.dialogRef.close(invoice),
        error: (error: unknown) => this.error.set(problemMessage(error, 'faturamento')),
      });
  }

  private updateQuantityValidators(): void {
    const maximum = this.maximumQuantity();
    this.form.controls.quantity.setValidators([
      Validators.required,
      Validators.min(1),
      Validators.max(Math.max(maximum, 1)),
      Validators.pattern(/^\d+$/),
    ]);
    this.form.controls.quantity.updateValueAndValidity({ emitEvent: false });
  }
}
