import { resolveInvoiceDetailShortcut } from './invoice-detail-page';

describe('resolveInvoiceDetailShortcut', () => {
  it('maps detail actions only with Alt', () => {
    expect(
      resolveInvoiceDetailShortcut({ altKey: true, ctrlKey: false, key: 'i', metaKey: false }),
    ).toBe('add');
    expect(
      resolveInvoiceDetailShortcut({ altKey: true, ctrlKey: false, key: 'P', metaKey: false }),
    ).toBe('print');
    expect(
      resolveInvoiceDetailShortcut({ altKey: true, ctrlKey: false, key: 'r', metaKey: false }),
    ).toBe('reload');
    expect(
      resolveInvoiceDetailShortcut({ altKey: false, ctrlKey: false, key: 'i', metaKey: false }),
    ).toBeNull();
  });
});
