/**
 * Secret Redactor
 *
 * Centralized secret detection and redaction.
 * Used by logs, chat, agent output, terminal output, graph extraction, error reports.
 *
 * Critical invariant: Credentials never enter persistent storage.
 */

import type { SecretPattern, RedactionResult } from "@/types/production";

export class SecretRedactor {
  private patterns: SecretPattern[] = [];
  private detectedSecrets: Set<string> = new Set();

  constructor() {
    this.initializePatterns();
  }

  /**
   * Initialize secret detection patterns
   * Patterns are intentionally conservative to avoid false positives
   */
  private initializePatterns(): void {
    this.patterns = [
      // API Keys - strict prefix matching
      {
        name: "OpenAI API Key",
        pattern: /sk-[a-zA-Z0-9]{20,}/g,
        replacement: "[REDACTED_OPENAI_KEY]",
      },
      {
        name: "Anthropic API Key",
        pattern: /sk-ant-[a-zA-Z0-9]{20,}/g,
        replacement: "[REDACTED_ANTHROPIC_KEY]",
      },
      {
        name: "Generic Bearer Token",
        pattern: /bearer\s+[a-zA-Z0-9\-_.~+/]+=*/gi,
        replacement: "[REDACTED_TOKEN]",
      },
      // Environment variables
      {
        name: "Environment Variable Export",
        pattern: /export\s+(OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY)=\S+/gi,
        replacement: "export [REDACTED_ENVIRONMENT_VARIABLE]",
      },
      {
        name: "Sensitive Environment Assignment",
        pattern: /(?:^|\n)\s*(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|DATABASE_URL|PRIVATE_KEY|ACCESS_TOKEN|REFRESH_TOKEN)\s*=\s*[^\s]+/gim,
        replacement: "\n[REDACTED_ENVIRONMENT_VARIABLE]",
      },
      // Git credentials
      {
        name: "Git URL with Credentials",
        pattern: /https?:\/\/[^:]+:[^@]+@github\.com/gi,
        replacement: "https://[REDACTED_CREDENTIALS]@github.com",
      },
      // Private keys (PEM format)
      {
        name: "Private Key",
        pattern: /-----BEGIN\s+(?:RSA|DSA|EC|OPENSSH)?\s*PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA|DSA|EC|OPENSSH)?\s*PRIVATE\s+KEY-----/gi,
        replacement: "[REDACTED_PRIVATE_KEY]",
      },
      // AWS Access Keys
      {
        name: "AWS Access Key",
        pattern: /AKIA[0-9A-Z]{16}/g,
        replacement: "[REDACTED_AWS_KEY]",
      },
      {
        name: "GitHub Token",
        pattern: /(?:ghp|gho|ghu|ghs|ghr)_[a-zA-Z0-9]{20,}/g,
        replacement: "[REDACTED_GITHUB_TOKEN]",
      },
      {
        name: "JWT",
        pattern: /eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
        replacement: "[REDACTED_JWT]",
      },
      // Database connection strings
      {
        name: "Database Connection String",
        pattern: /(?:mongodb|postgresql|mysql):\/\/[^:]+:[^@]+@/gi,
        replacement: "://[REDACTED_CREDENTIALS]@",
      },
      // Credentials in quotes
      {
        name: "Quoted Credentials",
        pattern: /(password|passwd|pwd|credential|secret|token|apikey)=['"]([^'"]+)['"]/gi,
        replacement: '$1="[REDACTED]"',
      },
    ];
  }

  /**
   * Redact all secrets from text
   */
  redact(text: string): RedactionResult {
    let redacted = text;
    const secretsFound: string[] = [];

    for (const pattern of this.patterns) {
      const matches = text.match(pattern.pattern);
      if (matches) {
        matches.forEach((match) => {
          secretsFound.push(pattern.name);
          this.detectedSecrets.add(match);
        });
        redacted = redacted.replace(pattern.pattern, pattern.replacement);
      }
    }

    return {
      original: text,
      redacted,
      secretsFound: [...new Set(secretsFound)],
    };
  }

  /**
   * Check if text contains secrets without redacting
   * Useful for diagnostic purposes
   */
  containsSecrets(text: string): boolean {
    return this.patterns.some((pattern) => {pattern.pattern.lastIndex=0;return pattern.pattern.test(text);});
  }

  /**
   * Redact object recursively
   * Handles nested structures and arrays
   */
  redactObject(obj: unknown): unknown {
    if (typeof obj === "string") {
      return this.redact(obj).redacted;
    }

    if (Array.isArray(obj)) {
      return obj.map((item) => this.redactObject(item));
    }

    if (typeof obj === "object" && obj !== null) {
      const redacted: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(obj)) {
        // Skip sensitive field names entirely
        if (this.isSensitiveField(key)) {
          redacted[key] = "[REDACTED]";
        } else {
          redacted[key] = this.redactObject(value);
        }
      }
      return redacted;
    }

    return obj;
  }

  /**
   * Check if field name indicates sensitive content
   */
  private isSensitiveField(key: string): boolean {
    const sensitiveNames = [
      "password",
      "passwd",
      "pwd",
      "credential",
      "secret",
      "token",
      "apikey",
      "api_key",
      "access_token",
      "refresh_token",
      "authorization",
      "auth",
      "api_secret",
      "private_key",
      "publickey",
      "publicKey",
      "privateKey",
      "certificate",
      "ssh_key",
      "gpg_key",
      "aws_secret",
      "azure_secret",
      "gcp_secret",
    ];

    const lowerKey = key.toLowerCase();
    return sensitiveNames.some((name) => lowerKey.includes(name));
  }

  /**
   * Redact JSON safely
   */
  redactJSON(json: string): string {
    try {
      const parsed = JSON.parse(json);
      const redacted = this.redactObject(parsed);
      return JSON.stringify(redacted, null, 2);
    } catch {
      // If not valid JSON, treat as plain text
      return this.redact(json).redacted;
    }
  }

  /**
   * Get list of detected secrets (for diagnostic purposes)
   * Returns count only, not actual secrets
   */
  getDetectedSecretCount(): number {
    return this.detectedSecrets.size;
  }

  /**
   * Clear detected secrets (should be done periodically)
   */
  clearDetectedSecrets(): void {
    this.detectedSecrets.clear();
  }

  /**
   * Create safe log message
   * Suitable for persistent storage
   */
  createSafeLogMessage(message: string, context?: Record<string, unknown>): {
    message: string;
    context?: Record<string, unknown>;
  } {
    return {
      message: this.redact(message).redacted,
      context: context ? (this.redactObject(context) as Record<string, unknown>) : undefined,
    };
  }

  /**
   * Validate that object is safe to store (contains no secrets)
   * Returns true if safe, false if secrets detected
   */
  isSafeToStore(obj: unknown): boolean {
    const stringified = typeof obj === "string" ? obj : JSON.stringify(obj);
    return !this.containsSecrets(stringified);
  }
}

// Global instance
let redactor: SecretRedactor | null = null;

/**
 * Get or create global secret redactor
 */
export function getSecretRedactor(): SecretRedactor {
  if (!redactor) {
    redactor = new SecretRedactor();
  }
  return redactor;
}
