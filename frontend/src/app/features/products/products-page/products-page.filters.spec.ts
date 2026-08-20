import { Product } from '../data-access/product.models';
import { ProductListFilters, countProductFilters, productMatchesFilters } from './products-page';

const product: Product = {
  id: '6c9e0e96-222c-4df6-929b-652486792f84',
  code: 'PRD-001',
  name: 'Parafuso sextavado',
  description: 'Aço inoxidável',
  availableQuantity: 12,
  reservedQuantity: 3,
  isActive: true,
  createdAt: '2026-08-19T15:00:00Z',
  updatedAt: '2026-08-20T15:00:00Z',
};

const emptyFilters: ProductListFilters = {
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
};

describe('product list filters', () => {
  it('combines text, status, quantity and date filters', () => {
    expect(
      productMatchesFilters(product, {
        ...emptyFilters,
        code: 'prd',
        name: 'sextavado',
        description: 'inox',
        status: 'active',
        availableMin: 10,
        availableMax: 12,
        reservedMin: 3,
        reservedMax: 4,
        createdFrom: '2026-08-19',
        updatedTo: '2026-08-20',
      }),
    ).toBe(true);
  });

  it('rejects records outside any configured range', () => {
    expect(productMatchesFilters(product, { ...emptyFilters, status: 'inactive' })).toBe(false);
    expect(productMatchesFilters(product, { ...emptyFilters, availableMax: 11 })).toBe(false);
    expect(productMatchesFilters(product, { ...emptyFilters, createdFrom: '2026-08-20' })).toBe(
      false,
    );
  });

  it('counts only effective advanced filters', () => {
    expect(countProductFilters(emptyFilters)).toBe(0);
    expect(
      countProductFilters({ ...emptyFilters, code: 'PRD', status: 'active', availableMin: 1 }),
    ).toBe(3);
  });
});
