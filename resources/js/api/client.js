import axios from 'axios';

/**
 * Pre-configured axios instance for all BurakoBoard API v1 calls.
 * Using this client instead of raw axios prevents the /api/v1 prefix from
 * being scattered across every call site, and makes base-URL changes or
 * interceptor additions a single-file operation.
 */
const api = axios.create({ baseURL: '/api/v1' });

export default api;
