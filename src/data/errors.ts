export class DomainError extends Error {
  code: string;
  fieldErrors?: Record<string, string>;
  constructor(code: string, message: string, fieldErrors?: Record<string, string>) {
    super(message);
    this.name = "DomainError";
    this.code = code;
    this.fieldErrors = fieldErrors;
  }
}

export class ValidationError extends DomainError {
  constructor(fieldErrors: Record<string, string>, message = "Please correct the highlighted fields.") {
    super("validation", message, fieldErrors);
    this.name = "ValidationError";
  }
}

export class ConflictError extends DomainError {
  constructor(message = "This record was changed elsewhere since you opened it.") {
    super("conflict", message);
    this.name = "ConflictError";
  }
}

export class NotFoundError extends DomainError {
  constructor(what = "Record") {
    super("not_found", `${what} not found or not available to this workspace.`);
    this.name = "NotFoundError";
  }
}

export class ForbiddenError extends DomainError {
  constructor(message = "This action is not available to the current persona.") {
    super("forbidden", message);
    this.name = "ForbiddenError";
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}
