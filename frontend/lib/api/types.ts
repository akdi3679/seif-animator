// frontend/lib/api/types.ts

export interface User {
  id: string
  email: string
  role: 'USER' | 'ADMIN'
  createdAt: string
}

export interface Booking {
  id: string
  eventId: string
  date: string
  childrenCount: number
  status: 'PENDING' | 'CONFIRMED' | 'CANCELLED'
  totalPrice: number
  paymentStatus: 'PENDING' | 'PAID' | 'FAILED' | 'REFUNDED'
  notes?: string
  createdAt: string
}

export interface AdminBooking extends Booking {
  user: Pick<User, 'email'>
  event: Pick<Event, 'titleFr' | 'titleAr'>
}

export interface Event {
  id: string
  titleFr: string
  titleAr: string
  descriptionFr: string
  descriptionAr: string
  date: string
  capacity: number
  availableSlots: number
  price: number
  location: string
}

export interface Product {
  id: string
  nameFr: string
  nameAr: string
  descriptionFr: string
  descriptionAr: string
  price: number
  stock: number
  category: string
  imageUrl?: string
}

export interface Message {
  id: string
  name: string
  email: string
  phone?: string
  message: string
  status: 'NEW' | 'READ' | 'REPLIED'
  adminNotes?: string
  createdAt: string
}

export interface Settings {
  deleteVerificationCode: string
  sessionTimeoutMinutes: number
  notificationEmail?: string
  telegramChatId?: string
  language: 'fr' | 'ar'
}

// Error classes
export class ApiError extends Error {
  constructor(
    message: string,
    public code?: string,
    public status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export class RateLimitError extends ApiError {
  public retryAfter: number;

  constructor(message: string = 'Too many requests', retryAfter?: number) {
    super(message, 'RATE_LIMIT', 429);
    this.retryAfter = retryAfter ?? 60; // default 60s
  }
}
export class ServerOverloadError extends ApiError {
  public retryAfter: number;
  constructor(message: string, retryAfter: number) {
    super(message, 'SERVER_OVERLOAD', 503);
    this.retryAfter = retryAfter;
  }
}


export class UnauthorizedError extends ApiError {
  constructor(message: string = 'Unauthorized') {
    super(message, 'UNAUTHORIZED', 401);
  }
}