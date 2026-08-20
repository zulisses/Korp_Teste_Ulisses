import { Product } from '../../products/data-access/product.models';
import { maximumInvoiceLineQuantity } from './invoice-line-dialog';

const product: Product = {
  id: 'c9517836-56b4-43f3-a81d-f660dd114195',
  code: 'PROD-001',
  name: 'Produto de exemplo',
  description: 'Produto para teste',
  availableQuantity: 7,
  reservedQuantity: 3,
  isActive: true,
  createdAt: '2026-08-20T12:00:00Z',
  updatedAt: '2026-08-20T12:00:00Z',
};

describe('maximumInvoiceLineQuantity', () => {
  it('uses only available stock for a new line', () => {
    expect(maximumInvoiceLineQuantity(product)).toBe(7);
  });

  it('adds the current reservation when editing the same line', () => {
    expect(maximumInvoiceLineQuantity(product, { productId: product.id, quantity: 3 })).toBe(10);
  });

  it('does not add a reservation that belongs to another product', () => {
    expect(
      maximumInvoiceLineQuantity(product, {
        productId: 'd371793f-9db5-4f7d-8811-0c933f387d13',
        quantity: 3,
      }),
    ).toBe(7);
  });
});
