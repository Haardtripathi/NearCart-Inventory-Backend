import { DEFAULT_LIMIT, DEFAULT_PAGE, MAX_LIMIT } from "../constants/inventory";

export interface PaginationParams {
  page: number;
  limit: number;
  skip: number;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  totalItems: number;
  totalPages: number;
}

export function getPagination(page = DEFAULT_PAGE, limit = DEFAULT_LIMIT): PaginationParams {
  const safePage = Number.isNaN(page) ? DEFAULT_PAGE : Math.max(DEFAULT_PAGE, page);
  const safeLimit = Number.isNaN(limit) ? DEFAULT_LIMIT : Math.min(MAX_LIMIT, Math.max(1, limit));

  return {
    page: safePage,
    limit: safeLimit,
    skip: (safePage - 1) * safeLimit,
  };
}

export function buildPagination(page: number, limit: number, totalItems: number): PaginationMeta {
  return {
    page,
    limit,
    totalItems,
    totalPages: totalItems === 0 ? 0 : Math.ceil(totalItems / limit),
  };
}
