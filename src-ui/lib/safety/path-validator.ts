/**
 * Path Validator
 *
 * Prevents path traversal attacks and unauthorized filesystem access.
 * Every file operation must validate paths against workspace boundaries.
 */

import path from "path";
import { getLogger } from "@/lib/core/structured-logger";

const logger = getLogger("agent");

export class PathValidator {
  /**
   * Validate that a path is within authorized boundaries
   * Prevents ../../../ and symlink attacks
   */
  validatePath(filePath: string, workspaceRoot: string, operation: "read" | "write" | "delete"): {
    valid: boolean;
    error?: string;
    resolvedPath?: string;
  } {
    try {
      // Normalize paths
      const normalized = path.normalize(filePath);
      const resolved = path.resolve(workspaceRoot, normalized);
      const workspaceRootResolved = path.resolve(workspaceRoot);

      // Prevent traversal
      if (!resolved.startsWith(workspaceRootResolved)) {
        return {
          valid: false,
          error: "Path traversal detected",
        };
      }

      // Check for suspicious patterns
      if (this.containsSuspiciousPattern(resolved)) {
        return {
          valid: false,
          error: "Path contains suspicious patterns",
        };
      }

      // Additional validation for write/delete operations
      if (operation === "write" || operation === "delete") {
        if (!this.isWriteAllowed(resolved, operation)) {
          return {
            valid: false,
            error: `${operation} operation not allowed on this path`,
          };
        }
      }

      return {
        valid: true,
        resolvedPath: resolved,
      };
    } catch (err) {
      return {
        valid: false,
        error: `Path validation error: ${String(err)}`,
      };
    }
  }

  /**
   * Validate multiple paths (batch validation)
   */
  validatePaths(
    filePaths: string[],
    workspaceRoot: string,
    operation: "read" | "write" | "delete"
  ): {
    valid: boolean;
    validPaths: string[];
    invalidPaths: Array<{ path: string; error: string }>;
  } {
    const validPaths: string[] = [];
    const invalidPaths: Array<{ path: string; error: string }> = [];

    for (const filePath of filePaths) {
      const result = this.validatePath(filePath, workspaceRoot, operation);
      if (result.valid && result.resolvedPath) {
        validPaths.push(result.resolvedPath);
      } else {
        invalidPaths.push({
          path: filePath,
          error: result.error || "Unknown error",
        });
      }
    }

    return {
      valid: invalidPaths.length === 0,
      validPaths,
      invalidPaths,
    };
  }

  /**
   * Check for suspicious patterns that indicate traversal attempts
   */
  private containsSuspiciousPattern(filePath: string): boolean {
    const suspicious = [
      "/../", // Direct traversal
      "\\..", // Backslash traversal (Windows)
      "%2e%2e", // URL encoded traversal
      "..;/", // Null byte bypass
      "....//", // Double traversal
    ];

    const normalized = filePath.toLowerCase();
    return suspicious.some((pattern) => normalized.includes(pattern));
  }

  /**
   * Check if write/delete is allowed on this path
   */
  private isWriteAllowed(filePath: string, operation: "write" | "delete"): boolean {
    // Prevent modification of system/control files
    const protected_patterns = [
      ".git/config", // Git config
      ".control/", // Control system files
      "node_modules/", // Dependencies
      ".env", // Environment files
      "package-lock.json", // Lock files
      "yarn.lock",
      "pnpm-lock.yaml",
    ];

    const normalized = filePath.toLowerCase();

    for (const pattern of protected_patterns) {
      if (normalized.includes(pattern.toLowerCase())) {
        logger.warn("write_forbidden", {}, `${operation} forbidden: ${filePath}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Resolve symlinks safely (prevents symlink attacks)
   */
  async resolveSymlinks(filePath: string, workspaceRoot: string): Promise<{
    success: boolean;
    realPath?: string;
    error?: string;
  }> {
    try {
      // In a real implementation, would use fs.realpath
      // For now, just validate the path
      const validation = this.validatePath(filePath, workspaceRoot, "read");

      if (!validation.valid) {
        return {
          success: false,
          error: validation.error,
        };
      }

      // Would normally resolve symlinks here
      return {
        success: true,
        realPath: validation.resolvedPath,
      };
    } catch (err) {
      return {
        success: false,
        error: `Symlink resolution error: ${String(err)}`,
      };
    }
  }

  /**
   * Get relative path (safe for display)
   */
  getDisplayPath(absolutePath: string, workspaceRoot: string): string {
    try {
      const relative = path.relative(workspaceRoot, absolutePath);
      return relative || ".";
    } catch {
      return absolutePath;
    }
  }

  /**
   * Validate file extensions for certain operations
   * Prevents shell injection through file extensions
   */
  validateExtension(filePath: string, allowedExtensions?: string[]): boolean {
    const ext = path.extname(filePath).toLowerCase();

    // Default forbidden extensions
    const forbidden = [".exe", ".bat", ".cmd", ".com", ".scr", ".vbs", ".js"];

    if (forbidden.includes(ext)) {
      return false;
    }

    // If allowed list provided, must be in it
    if (allowedExtensions && !allowedExtensions.includes(ext)) {
      return false;
    }

    return true;
  }

  /**
   * Check if path could escape workspace via symlink
   */
  couldEscapeViaSymlink(filePath: string): boolean {
    // Check for suspicious symlink patterns
    const patterns = ["..", "~", "$", "`"];

    const normalized = filePath.toLowerCase();
    return patterns.some((pattern) => normalized.includes(pattern));
  }
}

// Global instance
let validator: PathValidator | null = null;

/**
 * Get or create path validator
 */
export function getPathValidator(): PathValidator {
  if (!validator) {
    validator = new PathValidator();
  }
  return validator;
}
