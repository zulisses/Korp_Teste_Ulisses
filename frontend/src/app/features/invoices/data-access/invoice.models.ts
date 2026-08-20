export type InvoiceStatus = 'Open' | 'Closed';

export interface InvoiceLine {
  productId: string;
  quantity: number;
}

export interface Invoice {
  id: string;
  number: number;
  status: InvoiceStatus;
  isCancelled: boolean;
  createdAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  lines: InvoiceLine[];
}

export interface SetInvoiceLineRequest {
  quantity: number;
}

export type InvoiceViewStatus = 'open' | 'closed' | 'cancelled';

export function invoiceViewStatus(invoice: Invoice): InvoiceViewStatus {
  if (invoice.isCancelled) return 'cancelled';
  return invoice.status === 'Closed' ? 'closed' : 'open';
}

export function invoiceStatusLabel(invoice: Invoice): string {
  const status = invoiceViewStatus(invoice);
  if (status === 'cancelled') return 'Cancelada';
  return status === 'closed' ? 'Fechada' : 'Aberta';
}
