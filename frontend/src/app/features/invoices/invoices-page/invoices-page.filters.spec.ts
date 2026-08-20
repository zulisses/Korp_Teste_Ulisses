import { Invoice } from '../data-access/invoice.models';
import { InvoiceListFilters, countInvoiceFilters, invoiceMatchesFilters } from './invoices-page';

const invoice: Invoice = {
  id: '49aa2f13-8d92-4d28-b18e-a4d858cb2821',
  number: 10,
  status: 'Closed',
  isCancelled: false,
  createdAt: '2026-08-19T15:00:00Z',
  closedAt: '2026-08-20T15:00:00Z',
  cancelledAt: null,
  lines: [
    { productId: 'product-1', quantity: 3 },
    { productId: 'product-2', quantity: 2 },
  ],
};

const emptyFilters: InvoiceListFilters = {
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
};

describe('invoice list filters', () => {
  it('combines situation, ranges, product and dates', () => {
    expect(
      invoiceMatchesFilters(invoice, {
        ...emptyFilters,
        situation: 'closed',
        cancellation: 'not-cancelled',
        numberMin: 9,
        numberMax: 10,
        itemsMin: 2,
        itemsMax: 2,
        quantityMin: 5,
        quantityMax: 5,
        productId: 'product-2',
        createdFrom: '2026-08-19',
        closedTo: '2026-08-20',
      }),
    ).toBe(true);
  });

  it('requires the corresponding timestamp for date filters', () => {
    expect(invoiceMatchesFilters(invoice, { ...emptyFilters, cancelledFrom: '2026-08-01' })).toBe(
      false,
    );
    expect(invoiceMatchesFilters(invoice, { ...emptyFilters, situation: 'open' })).toBe(false);
    expect(invoiceMatchesFilters(invoice, { ...emptyFilters, cancellation: 'cancelled' })).toBe(
      false,
    );
    expect(invoiceMatchesFilters(invoice, { ...emptyFilters, quantityMax: 4 })).toBe(false);
  });

  it('counts only effective advanced filters', () => {
    expect(countInvoiceFilters(emptyFilters)).toBe(0);
    expect(
      countInvoiceFilters({
        ...emptyFilters,
        situation: 'closed',
        cancellation: 'not-cancelled',
        numberMin: 1,
        productId: 'x',
      }),
    ).toBe(4);
  });
});
