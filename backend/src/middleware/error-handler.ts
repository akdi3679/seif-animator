import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';

export interface AppError extends Error {
  statusCode?: number;
  code?: string;
}

export function errorHandler(
  err: AppError | ZodError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const messages = err.errors.map(e => e.message).join(', ');
    console.error('[ZodError]', messages);
    res.status(400).json({ error: 'Validation failed', details: messages });
    return;
  }

  const statusCode = (err as AppError).statusCode || 500;
  const message = err.message || 'Internal server error';

  // Safe logging
  try {
    if (process.env.NODE_ENV === 'development') {
      console.error('[Error]', err);
    } else {
      console.error(`[Error] ${statusCode}: ${message}`);
    }
  } catch (logError) {
    console.error('[ErrorHandler] Failed to log error:', logError);
    console.error('[OriginalError]', message);
  }

  res.status(statusCode).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}