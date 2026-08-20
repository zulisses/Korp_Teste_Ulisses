import { HttpErrorResponse } from '@angular/common/http';

export interface ProblemDetails {
  type?: string;
  title?: string;
  status?: number;
  detail?: string;
  errors?: Record<string, string[]>;
}

const knownDetails: Record<string, string> = {
  'A product with this code already exists.': 'Já existe um produto com esse código.',
  'Inactive products cannot be replenished.': 'Produtos inativos não podem receber reposição.',
  'Product not found.': 'O produto não foi encontrado ou foi removido.',
  'Quantity must be greater than zero.': 'Informe uma quantidade maior que zero.',
  'Invoice not found.': 'A nota fiscal não foi encontrada ou foi removida.',
  'Invoice line not found.': 'O item não foi encontrado nesta nota.',
  'Closed invoices cannot be changed.': 'Notas fechadas não podem ser alteradas.',
  'Cancelled invoices cannot be changed.': 'Notas canceladas não podem ser alteradas.',
  'Closed invoices cannot be cancelled.': 'Notas fechadas não podem ser canceladas.',
  'The invoice is already closed.': 'A nota fiscal já está fechada.',
  'Cancelled invoices cannot be printed.': 'Notas canceladas não podem ser impressas.',
  'An invoice without lines cannot be printed.':
    'Inclua ao menos um item antes de imprimir a nota.',
  'Inactive products cannot receive new reservations.':
    'Produtos inativos não podem receber novas reservas.',
  'The Idempotency-Key header must contain a valid UUID.':
    'Não foi possível identificar esta ação com segurança. Tente novamente.',
};

export function problemMessage(error: unknown, service = 'estoque'): string {
  if (!(error instanceof HttpErrorResponse)) {
    return 'Não foi possível concluir a operação. Tente novamente.';
  }

  if (error.status === 0) {
    return `Não foi possível conectar ao serviço de ${service}. Verifique o ambiente e tente novamente.`;
  }

  const problem = isProblemDetails(error.error) ? error.error : undefined;
  const knownMessage = problem?.detail ? knownDetails[problem.detail] : undefined;
  if (knownMessage) return knownMessage;
  if (problem?.detail?.startsWith('Insufficient stock. Available quantity:')) {
    const quantity = problem.detail.match(/\d+/)?.[0] ?? '0';
    return `Estoque insuficiente. Quantidade disponível: ${quantity}.`;
  }

  return statusFallback(error.status);
}

function isProblemDetails(value: unknown): value is ProblemDetails {
  return typeof value === 'object' && value !== null;
}

function statusFallback(status: number): string {
  switch (status) {
    case 400:
      return 'Revise os dados informados e tente novamente.';
    case 404:
      return 'O registro não foi encontrado. Atualize a página para conferir o estado atual.';
    case 409:
      return 'A operação conflita com o estado atual. Atualize os dados e tente novamente.';
    case 503:
      return 'O serviço de estoque está temporariamente indisponível. Tente novamente em instantes.';
    default:
      return 'Não foi possível concluir a operação. Tente novamente.';
  }
}
