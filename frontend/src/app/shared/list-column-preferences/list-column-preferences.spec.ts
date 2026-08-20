import {
  ListColumnDefinition,
  resolveVisibleColumns,
  toggleVisibleColumn,
} from './list-column-preferences';

type Column = 'code' | 'name' | 'id';

const definitions: readonly ListColumnDefinition<Column>[] = [
  { key: 'code', label: 'Código', visibleByDefault: true },
  { key: 'name', label: 'Nome', visibleByDefault: true },
  { key: 'id', label: 'ID', visibleByDefault: false },
];

describe('list column preferences', () => {
  it('loads valid stored columns in the canonical order', () => {
    expect(resolveVisibleColumns('["id","unknown","code"]', definitions)).toEqual(['code', 'id']);
  });

  it('falls back to defaults for invalid or empty preferences', () => {
    expect(resolveVisibleColumns('invalid', definitions)).toEqual(['code', 'name']);
    expect(resolveVisibleColumns('[]', definitions)).toEqual(['code', 'name']);
  });

  it('never allows the last data column to be hidden', () => {
    expect(toggleVisibleColumn(['code'], 'code', definitions)).toEqual(['code']);
    expect(toggleVisibleColumn(['code'], 'id', definitions)).toEqual(['code', 'id']);
    expect(toggleVisibleColumn(['code', 'id'], 'code', definitions)).toEqual(['id']);
  });
});
