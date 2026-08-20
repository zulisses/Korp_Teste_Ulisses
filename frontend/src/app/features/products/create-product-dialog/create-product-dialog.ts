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
import { ProductsApi } from '../data-access/products-api';

@Component({
  selector: 'app-create-product-dialog',
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
  templateUrl: './create-product-dialog.html',
  styleUrl: './create-product-dialog.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class CreateProductDialog {
  private readonly api = inject(ProductsApi);
  private readonly dialogRef = inject(MatDialogRef<CreateProductDialog>);
  private readonly destroyRef = inject(DestroyRef);
  private readonly formBuilder = inject(FormBuilder);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  private readonly codeInput = viewChild.required<ElementRef<HTMLInputElement>>('codeInput');
  private readonly nameInput = viewChild.required<ElementRef<HTMLInputElement>>('nameInput');
  private readonly quantityInput =
    viewChild.required<ElementRef<HTMLInputElement>>('quantityInput');
  private readonly descriptionInput =
    viewChild.required<ElementRef<HTMLTextAreaElement>>('descriptionInput');
  readonly form = this.formBuilder.nonNullable.group({
    code: ['', [Validators.required, Validators.maxLength(50)]],
    name: ['', [Validators.required, Validators.maxLength(120)]],
    description: ['', [Validators.required, Validators.maxLength(200)]],
    initialQuantity: [0, [Validators.required, Validators.min(0), Validators.pattern(/^\d+$/)]],
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
      if (this.form.controls.code.invalid) this.codeInput().nativeElement.focus();
      else if (this.form.controls.name.invalid) this.nameInput().nativeElement.focus();
      else if (this.form.controls.initialQuantity.invalid)
        this.quantityInput().nativeElement.focus();
      else this.descriptionInput().nativeElement.focus();
      return;
    }

    if (this.saving()) return;

    const raw = this.form.getRawValue();
    const request = {
      code: raw.code.trim(),
      name: raw.name.trim(),
      description: raw.description.trim(),
      initialQuantity: Number(raw.initialQuantity),
    };

    this.submissionKey ??= createIdempotencyKey();
    this.saving.set(true);
    this.error.set(null);

    this.api
      .create(request, this.submissionKey)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: (product) => this.dialogRef.close(product),
        error: (error: unknown) => this.error.set(problemMessage(error)),
      });
  }
}
