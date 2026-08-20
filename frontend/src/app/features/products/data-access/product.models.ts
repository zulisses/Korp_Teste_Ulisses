export interface Product {
  id: string;
  code: string;
  name: string;
  description: string;
  availableQuantity: number;
  reservedQuantity: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProductRequest {
  code: string;
  name: string;
  description: string;
  initialQuantity: number;
}

export interface ReplenishProductRequest {
  quantity: number;
}

export interface SetProductActiveRequest {
  isActive: boolean;
}
