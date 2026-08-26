export interface PageMeta {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  meta: PageMeta;
}

export function pageParams(page?: number | string, perPage?: number | string, maxPerPage = 60) {
  const p = Math.max(1, parseInt(String(page ?? 1), 10) || 1);
  const pp = Math.min(maxPerPage, Math.max(1, parseInt(String(perPage ?? 20), 10) || 20));
  return { page: p, perPage: pp, offset: (p - 1) * pp };
}

export function paginate<T>(data: T[], total: number, page: number, perPage: number): Paginated<T> {
  return {
    data,
    meta: { page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) },
  };
}
