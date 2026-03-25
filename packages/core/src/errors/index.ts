export class ReturnClawError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    message: string,
    code: string,
    statusCode: number = 500,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ReturnClawError';
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON(): Record<string, unknown> {
    return {
      error: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      details: this.details,
    };
  }
}

export class PolicyNotFoundError extends ReturnClawError {
  constructor(retailerId: string) {
    super(
      `Return policy not found for retailer: ${retailerId}`,
      'POLICY_NOT_FOUND',
      404,
      { retailerId },
    );
    this.name = 'PolicyNotFoundError';
  }
}

export class ReturnIneligibleError extends ReturnClawError {
  constructor(reason: string, details?: Record<string, unknown>) {
    super(
      `Return is not eligible: ${reason}`,
      'RETURN_INELIGIBLE',
      422,
      details,
    );
    this.name = 'ReturnIneligibleError';
  }
}

export class CarrierApiError extends ReturnClawError {
  constructor(carrier: string, message: string, details?: Record<string, unknown>) {
    super(
      `Carrier API error (${carrier}): ${message}`,
      'CARRIER_API_ERROR',
      502,
      { carrier, ...details },
    );
    this.name = 'CarrierApiError';
  }
}

export class AuthenticationError extends ReturnClawError {
  constructor(message: string = 'Authentication required') {
    super(message, 'AUTHENTICATION_ERROR', 401);
    this.name = 'AuthenticationError';
  }
}

export class AuthorizationError extends ReturnClawError {
  constructor(message: string = 'Insufficient permissions') {
    super(message, 'AUTHORIZATION_ERROR', 403);
    this.name = 'AuthorizationError';
  }
}

export class RateLimitError extends ReturnClawError {
  constructor(retryAfterMs: number) {
    super(
      'Rate limit exceeded',
      'RATE_LIMIT_EXCEEDED',
      429,
      { retryAfterMs },
    );
    this.name = 'RateLimitError';
  }
}

export class ValidationError extends ReturnClawError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(
      `Validation error: ${message}`,
      'VALIDATION_ERROR',
      400,
      details,
    );
    this.name = 'ValidationError';
  }
}

export class SessionNotFoundError extends ReturnClawError {
  constructor(sessionId: string) {
    super(
      `Session not found: ${sessionId}`,
      'SESSION_NOT_FOUND',
      404,
      { sessionId },
    );
    this.name = 'SessionNotFoundError';
  }
}

export class AgentError extends ReturnClawError {
  constructor(agentType: string, message: string, details?: Record<string, unknown>) {
    super(
      `Agent error (${agentType}): ${message}`,
      'AGENT_ERROR',
      500,
      { agentType, ...details },
    );
    this.name = 'AgentError';
  }
}
