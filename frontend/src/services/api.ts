// src/services/api.ts
import axios from 'axios';
import type {
  Ingredient,
  CartItem,
  Order,
  IngredientsResponse,
  IngredientCategory,
} from '../types';

/**
 * Resolve API base URL:
 * 1) runtime (public/config.js): window.APP_CONFIG.API_BASE_URL  ← preferred in prod
 * 2) build-time env: import.meta.env.VITE_API_BASE_URL
 * 3) local dev fallback
 *
 * NOTE: We keep '/api' in this base URL by convention.
 * Example: http://4.253.11.59/api
 */
const API_BASE_URL =
  (window as any).APP_CONFIG?.API_BASE_URL ||
  import.meta.env.VITE_API_BASE_URL ||
  'http://localhost:8080/api';

// Debug logs (safe to keep; remove if you prefer)
console.log('API_BASE_URL:', API_BASE_URL);
console.log('VITE_API_BASE_URL env var:', import.meta.env.VITE_API_BASE_URL);
console.log('Runtime config:', (window as any).APP_CONFIG);

/** Axios instance.
 * IMPORTANT: Use RELATIVE paths (no leading slash) in requests below
 * so Axios joins them with baseURL correctly.
 */
const apiClient = axios.create({
  baseURL: API_BASE_URL, // e.g., http://4.253.11.59/api
  headers: { 'Content-Type': 'application/json' },
});

/** Small helper: normalize any value to an array.
 * - If v is already an array → return as-is
 * - If v is a Spring Page-like object { content: [...] } → return content
 * - Otherwise → []
 */
const toArray = <T,>(v: unknown): T[] => {
  if (Array.isArray(v)) return v as T[];
  const content = (v as any)?.content;
  if (Array.isArray(content)) return content as T[];
  return [];
};

/* ========================= Ingredients ========================= */

export const getIngredients = async (): Promise<IngredientsResponse | Ingredient[]> => {
  const res = await apiClient.get<any>('ingredients');
  // Tolerate either array or wrapped payload (e.g., { items: [...] } or direct array)
  if (Array.isArray(res.data)) return res.data as Ingredient[];
  if (Array.isArray(res.data?.items)) return res.data.items as Ingredient[];
  return res.data ?? [];
};

export const getIngredientsByCategory = async (
  category: IngredientCategory
): Promise<Ingredient[]> => {
  const res = await apiClient.get<any>(`ingredients/${category}`);
  return toArray<Ingredient>(res.data);
};

/* ============================ Cart ============================ */

export const addToCart = async (item: {
  sessionId: string;
  ingredientId: number;
  quantity: number;
  burgerLayers?: { ingredientId: number; layerOrder: number; quantity: number }[];
}): Promise<CartItem> => {
  const res = await apiClient.post<CartItem>('cart/items', item);
  return res.data;
};

export const getCart = async (sessionId: string): Promise<CartItem[]> => {
  const res = await apiClient.get<any>(`cart/${sessionId}`);
  return toArray<CartItem>(res.data);
};

export const removeCartItem = async (itemId: number): Promise<void> => {
  await apiClient.delete(`cart/items/${itemId}`);
};

/* =========================== Orders ============================ */

export const createOrder = async (orderData: {
  sessionId: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  cartItemIds: number[];
}): Promise<Order> => {
  const res = await apiClient.post<Order>('orders', orderData);
  // Guard nested lists so downstream .map() never explodes
  const order = res.data as any;
  order.orderItems = toArray(order.orderItems);
  order.layers = toArray(order.layers);
  return order as Order;
};

export const getOrder = async (orderId: string): Promise<Order> => {
  const res = await apiClient.get<Order>(`orders/${orderId}`);
  return res.data;
};

/* ======================= Order History ======================== */

export const getOrderHistory = async (email?: string): Promise<Order[]> => {
  const params = email ? { email } : {};
  const res = await apiClient.get<any>('orders/history', { params });
  return toArray<Order>(res.data);
};

export const getOrdersByCustomerEmail = async (email: string): Promise<Order[]> => {
  const res = await apiClient.get<any>(`orders/customer/${email}`);
  return toArray<Order>(res.data);
};

export const getOrdersBySession = async (sessionId: string): Promise<Order[]> => {
  const res = await apiClient.get<any>(`orders/session/${sessionId}`);
  return toArray<Order>(res.data);
};

export default apiClient;
