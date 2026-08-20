import { Invoice } from '../data-access/invoice.models';
import {
  matchesInvoiceStatus,
  parseInvoiceStatusFilter,
  resolveInvoiceListShortcut,
} from './invoices-page';

const invoice: Invoice = {
  id: '49aa2f13-8d92-4d28-b18e-a4d858cb2821',
  number: 10,
  status: 'Open',
  isCancelled: false,
  createdAt: '2026-08-20T12:00:00Z',
  closedAt: null,
  cancelledAt: null,
  lines: [],
};

describe('resolveInvoiceListShortcut', () => {
  it('maps the operational invoice shortcuts', () => {
    expect(
      resolveInvoiceListShortcut({ altKey: true, ctrlKey: false, key: 'n', metaKey: false }),
    ).toBe('create');
    expect(
      resolveInvoiceListShortcut({ altKey: true, ctrlKey: false, key: 'R', metaKey: false }),
    ).toBe('reload');
    expect(
      resolveInvoiceListShortcut({ altKey: false, ctrlKey: false, key: '/', metaKey: false }),
    ).toBe('search');
  });

  it('does not intercept control or meta combinations', () => {
    expect(
      resolveInvoiceListShortcut({ altKey: false, ctrlKey: true, key: '/', metaKey: false }),
    ).toBeNull();
    expect(
      resolveInvoiceListShortcut({ altKey: true, ctrlKey: false, key: 'n', metaKey: true }),
    ).toBeNull();
  });
});

describe('matchesInvoiceStatus', () => {
  it('distinguishes open, closed and cancelled invoices', () => {
    const closed: Invoice = { ...invoice, status: 'Closed', closedAt: invoice.createdAt };
    const cancelled: Invoice = {
      ...invoice,
      isCancelled: true,
      cancelledAt: invoice.createdAt,
    };

    expect(matchesInvoiceStatus(invoice, 'open')).toBe(true);
    expect(matchesInvoiceStatus(closed, 'closed')).toBe(true);
    expect(matchesInvoiceStatus(cancelled, 'cancelled')).toBe(true);
    expect(matchesInvoiceStatus(cancelled, 'open')).toBe(false);
    expect(matchesInvoiceStatus(closed, 'all')).toBe(true);
  });
});

describe('parseInvoiceStatusFilter', () => {
  it('accepts supported query values and rejects stale ones', () => {
    expect(parseInvoiceStatusFilter('open')).toBe('open');
    expect(parseInvoiceStatusFilter('cancelled')).toBe('cancelled');
    expect(parseInvoiceStatusFilter('unknown')).toBe('all');
    expect(parseInvoiceStatusFilter(null)).toBe('all');
  });
});
