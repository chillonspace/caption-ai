// API Configuration
export const API_PAGINATION = {
  DEFAULT_PAGE_SIZE: 1000,
  MAX_RETRIES: 3,
} as const;

// Product Configuration
export const PRODUCTS = ['AirVo', 'TriGuard', 'FloMix', 'TrioCare', 'FleXa'] as const;
export const PLATFORMS = ['Facebook'] as const;
export const STYLE_OPTIONS_ZH = ['随机', '故事', '痛点', '日常', '技术', '促销'] as const;

// Product assets mapping (public paths)
export const PRODUCT_ASSETS = {
  AirVo: '/products/airvo.png',
  TriGuard: '/products/triguard.png',
  FloMix: '/products/flomix.png',
  TrioCare: '/products/triocare.png',
  FleXa: '/products/flexa.png',
} as const;

// Response Messages
export const ERROR_MESSAGES = {
  UNAUTHORIZED: 'Unauthorized',
  INVALID_JSON: 'Invalid JSON',
  MISSING_EMAIL: 'Missing email',
  USER_NOT_FOUND: 'User not found',
  UPDATE_FAILED: 'Update failed',
  LIST_FAILED: 'List users failed',
} as const;

export const SUCCESS_MESSAGES = {
  USER_UPDATED: 'User updated successfully',
  WEBHOOK_RECEIVED: 'Webhook received',
} as const;

// Environment Variables
export const REQUIRED_ENV_VARS = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'ADMIN_API_TOKEN',
] as const;

