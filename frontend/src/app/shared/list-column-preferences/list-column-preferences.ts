import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';

export interface ListColumnDefinition<T extends string = string> {
  key: T;
  label: string;
  visibleByDefault: boolean;
}

export function resolveVisibleColumns<T extends string>(
  storedValue: string | null,
  definitions: readonly ListColumnDefinition<T>[],
): T[] {
  const defaults = definitions
    .filter((definition) => definition.visibleByDefault)
    .map((definition) => definition.key);

  if (!storedValue) return defaults;

  try {
    const parsed: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsed)) return defaults;
    const selected = new Set(parsed.filter((value): value is T => typeof value === 'string'));
    const visible = definitions
      .filter((definition) => selected.has(definition.key))
      .map((definition) => definition.key);
    return visible.length > 0 ? visible : defaults;
  } catch {
    return defaults;
  }
}

export function toggleVisibleColumn<T extends string>(
  current: readonly T[],
  key: T,
  definitions: readonly ListColumnDefinition<T>[],
): T[] {
  const selected = new Set(current);
  if (selected.has(key)) {
    if (selected.size === 1) return [...current];
    selected.delete(key);
  } else {
    selected.add(key);
  }
  return definitions
    .filter((definition) => selected.has(definition.key))
    .map((definition) => definition.key);
}

@Injectable({ providedIn: 'root' })
export class ListColumnPreferences {
  private readonly document = inject(DOCUMENT);

  load<T extends string>(storageKey: string, definitions: readonly ListColumnDefinition<T>[]): T[] {
    return resolveVisibleColumns(this.read(storageKey), definitions);
  }

  save(storageKey: string, columns: readonly string[]): void {
    try {
      this.document.defaultView?.localStorage.setItem(storageKey, JSON.stringify(columns));
    } catch {
      // A lista continua funcional quando o navegador bloqueia armazenamento local.
    }
  }

  private read(storageKey: string): string | null {
    try {
      return this.document.defaultView?.localStorage.getItem(storageKey) ?? null;
    } catch {
      return null;
    }
  }
}
