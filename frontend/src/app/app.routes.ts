import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'produtos',
    loadComponent: () =>
      import('./features/products/products-page/products-page').then(
        (module) => module.ProductsPage,
      ),
    title: 'Produtos e estoque | Korp',
  },
  {
    path: 'notas',
    loadComponent: () =>
      import('./features/invoices/invoices-page/invoices-page').then(
        (module) => module.InvoicesPage,
      ),
    title: 'Notas fiscais | Korp',
  },
  {
    path: 'notas/:id/impressao',
    loadComponent: () =>
      import('./features/invoices/invoice-print-page/invoice-print-page').then(
        (module) => module.InvoicePrintPage,
      ),
    title: 'Impressão da nota fiscal | Korp',
  },
  {
    path: 'notas/:id',
    loadComponent: () =>
      import('./features/invoices/invoice-detail-page/invoice-detail-page').then(
        (module) => module.InvoiceDetailPage,
      ),
    title: 'Detalhe da nota fiscal | Korp',
  },
  { path: '', pathMatch: 'full', redirectTo: 'produtos' },
  { path: '**', redirectTo: 'produtos' },
];
