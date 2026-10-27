// src/app/core/models/business.model.ts
export interface ApiResponse<T> {
  statusCode: number;
  meta: unknown;
  succeeded: boolean;
  message: string;
  errors: string[];
  data: T;
}

export interface Paged<T> {
  data: T[];
  currentPage: number;
  totalPages: number;
  totalCount: number;
  hasPreviousPage: boolean;
  hasNextPage: boolean;
}
export interface FilterQuery {
  pageNumber: number;
  pageSize: number;
  search: string;
}