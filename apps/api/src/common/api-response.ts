/** Consistent API envelope for all HTTP responses. */
export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  error: string | null;
  meta?: { total: number; page: number; limit: number };
}

export function ok<T>(data: T): ApiResponse<T> {
  return { success: true, data, error: null };
}

export function fail(error: string): ApiResponse<never> {
  return { success: false, data: null, error };
}
