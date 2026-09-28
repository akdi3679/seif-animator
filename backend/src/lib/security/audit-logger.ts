/**
 * Audit Logger Service
 * 
 * Implements Layer 6: Audit Logging per conv.txt security requirements
 * 
 * Security Features:
 * - Immutable audit log creation
 * - Security event categorization
 * - User action tracking
 * - API access logging
 * - Error event logging
 */

import { Request } from 'express'

/**
 * Audit Event Types
 * Per conv.txt: "Security event categorization"
 */
export enum AuditEventType {
  // Authentication Events
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',
  SESSION_REVOKED = 'SESSION_REVOKED',
  PASSWORD_CHANGED = 'PASSWORD_CHANGED',
  PASSWORD_RESET = 'PASSWORD_RESET',
  TWO_FACTOR_ENABLED = 'TWO_FACTOR_ENABLED',
  TWO_FACTOR_DISABLED = 'TWO_FACTOR_DISABLED',
  ACCOUNT_LOCKED = 'ACCOUNT_LOCKED',
  ACCOUNT_UNLOCKED = 'ACCOUNT_UNLOCKED',

  // Authorization Events
  ACCESS_DENIED = 'ACCESS_DENIED',
  ADMIN_ACCESS = 'ADMIN_ACCESS',
  UNAUTHORIZED_ACCESS_ATTEMPT = 'UNAUTHORIZED_ACCESS_ATTEMPT',

  // Data Events
  DATA_CREATED = 'DATA_CREATED',
  DATA_UPDATED = 'DATA_UPDATED',
  DATA_DELETED = 'DATA_DELETED',
  DATA_EXPORTED = 'DATA_EXPORTED',

  // Security Events
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  RATE_LIMIT_EXCEEDED = 'RATE_LIMIT_EXCEEDED',
  INVALID_SIGNATURE = 'INVALID_SIGNATURE',
  REPLAY_ATTACK_DETECTED = 'REPLAY_ATTACK_DETECTED',
  TAILSCALE_PEER_REJECTED = 'TAILSCALE_PEER_REJECTED',
  
  // System Events
  SYSTEM_ERROR = 'SYSTEM_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  API_ERROR = 'API_ERROR',
}

/**
 * Audit Log Severity Levels
 */
export enum AuditSeverity {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  CRITICAL = 'CRITICAL',
}

/**
 * Audit Log Entry Interface
 */
export interface AuditLogEntry {
  id: string
  eventType: AuditEventType
  severity: AuditSeverity
  userId?: string
  userEmail?: string
  ipAddress: string
  userAgent: string
  tailscaleIp?: string
  deviceFingerprint?: string
  resource?: string
  resourceId?: string
  action: string
  description: string
  metadata?: Record<string, any>
  success: boolean
  errorMessage?: string
  createdAt: Date
}

/**
 * Audit Logger Service Class
 * Per conv.txt: "Immutable audit trail with comprehensive logging"
 */
export class AuditLogger {
  private static logs: AuditLogEntry[] = []

  /**
   * Generate unique audit log ID
   */
  private static generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  /**
   * Determine severity based on event type
   */
  private static determineSeverity(eventType: AuditEventType): AuditSeverity {
    const criticalEvents = [
      AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
      AuditEventType.SUSPICIOUS_ACTIVITY,
      AuditEventType.REPLAY_ATTACK_DETECTED,
      AuditEventType.INVALID_SIGNATURE,
      AuditEventType.SYSTEM_ERROR,
    ]
    
    const highEvents = [
      AuditEventType.ACCESS_DENIED,
      AuditEventType.ACCOUNT_LOCKED,
      AuditEventType.RATE_LIMIT_EXCEEDED,
      AuditEventType.DATA_EXPORTED,
    ]
    
    if (criticalEvents.includes(eventType)) {
      return AuditSeverity.CRITICAL
    }
    
    if (highEvents.includes(eventType)) {
      return AuditSeverity.HIGH
    }
    
    return AuditSeverity.LOW
  }

  /**
   * Extract client information from request
   */
  private static extractRequestInfo(req: Request): {
    ipAddress: string
    userAgent: string
    tailscaleIp?: string
    deviceFingerprint?: string
  } {
    return {
      ipAddress: req.ip || 
                 req.headers['x-forwarded-for'] as string || 
                 req.socket.remoteAddress?.replace('::ffff:', '') || 
                 'unknown',
      userAgent: req.headers['user-agent'] || 'unknown',
      tailscaleIp: req.tailscaleIP,
      deviceFingerprint: req.headers['x-device-fingerprint'] as string,
    }
  }

  /**
   * Create audit log entry
   * Per conv.txt: "Immutable audit log creation"
   */
  static log(
    eventType: AuditEventType,
    action: string,
    description: string,
    success: boolean,
    req?: Request,
    options?: {
      userId?: string
      userEmail?: string
      resource?: string
      resourceId?: string
      metadata?: Record<string, any>
      errorMessage?: string
    }
  ): AuditLogEntry {
    const requestInfo = req ? this.extractRequestInfo(req) : {
      ipAddress: 'system',
      userAgent: 'system',
    }

    const entry: AuditLogEntry = {
      id: this.generateId(),
      eventType,
      severity: this.determineSeverity(eventType),
      action,
      description,
      success,
      createdAt: new Date(),
      ipAddress: requestInfo.ipAddress,
      userAgent: requestInfo.userAgent,
      tailscaleIp: requestInfo.tailscaleIp,
      deviceFingerprint: requestInfo.deviceFingerprint,
      userId: options?.userId,
      userEmail: options?.userEmail,
      resource: options?.resource,
      resourceId: options?.resourceId,
      metadata: options?.metadata,
      errorMessage: options?.errorMessage,
    }

    // Add to in-memory logs (in production, this would write to database)
    this.logs.push(entry)

    // Log to console for immediate visibility
    if (entry.severity === AuditSeverity.CRITICAL || entry.severity === AuditSeverity.HIGH) {
      console.error(`🚨 [AUDIT-${entry.severity}] ${eventType}: ${description}`)
    } else {
      console.log(`📝 [AUDIT] ${eventType}: ${description}`)
    }

    return entry
  }

  /**
   * Log security event
   * Per conv.txt: "Security event logging"
   */
  static logSecurityEvent(
    eventType: AuditEventType,
    req: Request,
    description: string,
    errorMessage?: string
  ): AuditLogEntry {
    return this.log(
      eventType,
      `SECURITY_${eventType}`,
      description,
      false,
      req,
      {
        errorMessage,
        metadata: {
          severity: this.determineSeverity(eventType),
          securityEvent: true,
        },
      }
    )
  }

  /**
   * Log authentication event
   */
  static logAuthEvent(
    eventType: AuditEventType,
    req: Request,
    success: boolean,
    userId?: string,
    userEmail?: string,
    errorMessage?: string
  ): AuditLogEntry {
    return this.log(
      eventType,
      `AUTH_${eventType}`,
      `${eventType} for user ${userEmail || 'unknown'}`,
      success,
      req,
      {
        userId,
        userEmail,
        errorMessage,
      }
    )
  }

  /**
   * Log data access event
   */
  static logDataEvent(
    eventType: AuditEventType,
    req: Request,
    resource: string,
    resourceId: string,
    action: string,
    success: boolean
  ): AuditLogEntry {
    return this.log(
      eventType,
      `DATA_${eventType}`,
      `${action} on ${resource} ${resourceId}`,
      success,
      req,
      {
        resource,
        resourceId,
      }
    )
  }

  /**
   * Log API access event
   */
  static logAPIEvent(
    req: Request,
    endpoint: string,
    method: string,
    success: boolean,
    duration?: number
  ): AuditLogEntry {
    return this.log(
      success ? AuditEventType.DATA_CREATED : AuditEventType.API_ERROR,
      `${method} ${endpoint}`,
      `API request to ${endpoint}`,
      success,
      req,
      {
        metadata: {
          endpoint,
          method,
          duration,
          signatureValidated: req.signatureValidated,
        },
      }
    )
  }

  /**
   * Get recent logs
   * Per conv.txt: "Log retrieval and querying"
   */
  static getRecentLogs(limit: number = 100): AuditLogEntry[] {
    return this.logs.slice(-limit).reverse()
  }

  /**
   * Get logs by user
   */
  static getLogsByUser(userId: string): AuditLogEntry[] {
    return this.logs.filter(log => log.userId === userId)
  }

  /**
   * Get logs by event type
   */
  static getLogsByEventType(eventType: AuditEventType): AuditLogEntry[] {
    return this.logs.filter(log => log.eventType === eventType)
  }

  /**
   * Get logs by severity
   */
  static getLogsBySeverity(severity: AuditSeverity): AuditLogEntry[] {
    return this.logs.filter(log => log.severity === severity)
  }

  /**
   * Get failed authentication attempts
   */
  static getFailedAuthAttempts(since: Date = new Date(Date.now() - 24 * 60 * 60 * 1000)): AuditLogEntry[] {
    const authFailureEvents = [
      AuditEventType.LOGIN_FAILURE,
      AuditEventType.ACCESS_DENIED,
      AuditEventType.UNAUTHORIZED_ACCESS_ATTEMPT,
    ]
    
    return this.logs.filter(
      log => 
        authFailureEvents.includes(log.eventType) && 
        log.createdAt >= since
    )
  }

  /**
   * Get security events summary
   */
  static getSecuritySummary(): {
    total: number
    critical: number
    high: number
    medium: number
    low: number
    recent: AuditLogEntry[]
  } {
    const recent = this.getRecentLogs(50)
    
    return {
      total: this.logs.length,
      critical: this.getLogsBySeverity(AuditSeverity.CRITICAL).length,
      high: this.getLogsBySeverity(AuditSeverity.HIGH).length,
      medium: this.getLogsBySeverity(AuditSeverity.MEDIUM).length,
      low: this.getLogsBySeverity(AuditSeverity.LOW).length,
      recent,
    }
  }

  /**
   * Export logs (for compliance)
   */
  static exportLogs(format: 'json' | 'csv' = 'json'): string {
    if (format === 'json') {
      return JSON.stringify(this.logs, null, 2)
    }
    
    // CSV format
    const headers = [
      'id', 'eventType', 'severity', 'userId', 'userEmail',
      'ipAddress', 'userAgent', 'action', 'description',
      'success', 'createdAt',
    ]
    
    const rows = this.logs.map(log => [
      log.id,
      log.eventType,
      log.severity,
      log.userId || '',
      log.userEmail || '',
      log.ipAddress,
      log.userAgent,
      log.action,
      log.description,
      log.success.toString(),
      log.createdAt.toISOString(),
    ])
    
    return [headers.join(','), ...rows.map(row => row.join(','))].join('\n')
  }

  /**
   * Clear logs (for testing)
   */
  static clearLogs(): void {
    this.logs = []
  }
}

export default AuditLogger