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
import { finalize } from 'rxjs';

import { createIdempotencyKey } from '../../../core/api/idempotency';
import { problemMessage } from '../../../core/api/problem-details';
import { Product } from '../data-access/product.models';
import { ProductsApi } from '../data-access/products-api';

@Component({
  selector: 'app-replenish-product-dialog',
  imports: [
    MatButtonModule,
    MatDialogActions,
    MatDialogClose,
    MatDialogContent,
    MatDialogTitle,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    ReactiveFormsModule,
  ],
  templateUrl: './replenish-product-dialog.html',
  styleUrl: './replenish-product-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ReplenishProductDialog {
  private readonly api = inject(ProductsApi);
  private readonly dialogRef = inject(MatDialogRef<ReplenishProductDialog>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly product = inject<Product>(MAT_DIALOG_DATA);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private readonly quantityInput =
    viewChild.required<ElementRef<HTMLInputElement>>('quantityInput');
  readonly form = this.formBuilder.nonNullable.group({
    quantity: [1, [Validators.required, Validators.min(1), Validators.pattern(/^\d+$/)]],
  });

  private submissionKey: string | null = null;

  constructor() {
    this.form.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => {
      this.submissionKey = null;
      this.error.set(null);
    });
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.quantityInput().nativeElement.focus();
      return;
    }

    if (this.saving()) return;

    this.submissionKey ??= createIdempotencyKey();
    this.saving.set(true);
    this.error.set(null);

    this.api
      .replenish(
        this.product.id,
        { quantity: Number(this.form.controls.quantity.value) },
        this.submissionKey,
      )
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (product) => this.dialogRef.close(product),
        error: (error: unknown) => this.error.set(problemMessage(error)),
      });
  }
}
