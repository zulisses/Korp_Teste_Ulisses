import { Product } from '../../products/data-access/product.models';
import { Invoice } from '../data-access/invoice.models';
import { buildInvoicePrintRows, canPrintInvoice } from './invoice-print-page';

const invoice: Invoice = {
  id: '49aa2f13-8d92-4d28-b18e-a4d858cb2821',
  number: 10,
  status: 'Closed',
  isCancelled: false,
  createdAt: '2026-08-20T12:00:00Z',
  closedAt: '2026-08-20T12:05:00Z',
  cancelledAt: null,
  lines: [{ productId: 'product-1', quantity: 3 }],
};

const product: Product = {
  id: 'product-1',
  code: 'PRD-001',
  name: 'Produto de teste',
  description: 'Descrição operacional',
  availableQuantity: 7,
  reservedQuantity: 0,
  isActive: true,
  createdAt: '2026-08-20T11:00:00Z',
  updatedAt: '2026-08-20T12:05:00Z',
};

describe('invoice print helpers', () => {
  it('allows only closed and non-cancelled invoices', () => {
    expect(canPrintInvoice(invoice)).toBe(true);
    expect(canPrintInvoice({ ...invoice, status: 'Open', closedAt: null })).toBe(false);
    expect(canPrintInvoice({ ...invoice, isCancelled: true })).toBe(false);
    expect(canPrintInvoice(null)).toBe(false);
  });

  it('joins invoice lines with product data', () => {
    expect(buildInvoicePrintRows(invoice, [product])).toEqual([
      {
        productId: 'product-1',
        code: 'PRD-001',
        name: 'Produto de teste',
        description: 'Descrição operacional',
        quantity: 3,
      },
    ]);
  });

  it('keeps a printable fallback when a product cannot be loaded', () => {
    expect(buildInvoicePrintRows(invoice, [])[0]).toMatchObject({
      code: 'Produto indisponível',
      name: 'product-1',
      quantity: 3,
    });
  });
});
