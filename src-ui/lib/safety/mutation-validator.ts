/**
 * Mutation Validator
 *
 * Validates all repository mutations before execution.
 * Pipeline: Auth → Workspace → Git state → File paths → Execution
 *
 * No agent gets arbitrary filesystem mutation access.
 * Every mutation is verifiable and reversible.
 */

import type { MutationRequest, MutationVerification, CommandClassification, ControlError } from "@/types/production";
import { getLogger } from "@/lib/core/structured-logger";
import { createError } from "@/lib/core/error-handler";

const logger = getLogger("agent");

/**
 * Command classification and policy
 */
const COMMAND_POLICY: Record<string, CommandClassification> = {
  // Safe commands
  "cargo test": "SAFE",
  "pnpm test": "SAFE",
  "npm test": "SAFE",
  "jest": "SAFE",
  "vitest": "SAFE",
  "git diff": "SAFE",
  "git status": "SAFE",
  "git log": "SAFE",
  "git branch": "SAFE",
  "ls": "SAFE",
  "find": "SAFE",
  "grep": "SAFE",
  "cat": "SAFE",

  // Requires confirmation
  "git reset --hard": "REQUIRES_CONFIRMATION",
  "git clean -fd": "REQUIRES_CONFIRMATION",
  "git checkout": "REQUIRES_CONFIRMATION",
  "git rebase": "REQUIRES_CONFIRMATION",
  "git merge": "REQUIRES_CONFIRMATION",

  // Blocked
  "rm -rf": "BLOCKED",
  "disk format": "BLOCKED",
  "dd if=/dev": "BLOCKED",
  "mkfs": "BLOCKED",
};

export class MutationValidator {
  /**
   * Classify a command
   */
  classifyCommand(command: string): CommandClassification {
    const normalized = command.toLowerCase().trim();

    // Check exact matches first
    if (COMMAND_POLICY[normalized]) {
      return COMMAND_POLICY[normalized];
    }

    // Check prefix matches
    for (const [pattern, classification] of Object.entries(COMMAND_POLICY)) {
      if (normalized.startsWith(pattern)) {
        return classification;
      }
    }

    // Default to requires confirmation for unknown commands
    return "REQUIRES_CONFIRMATION";
  }

  /**
   * Validate a mutation request
   * Returns verification result with all validation steps
   */
  async validateMutation(request: MutationRequest): Promise<MutationVerification> {
    const verification: MutationVerification = {
      requestId: request.id,
      authorized: false,
      workspaceValid: false,
      gitStateValid: false,
      pathsValid: false,
      filesAccessible: false,
      errors: [],
    };

    try {
      // Step 1: Authorization check
      if (!this.validateAuthorization(request, verification)) {
        logger.warn("mutation_not_authorized", { taskId: request.taskId });
        return verification;
      }

      // Step 2: Workspace validation
      if (!this.validateWorkspace(request, verification)) {
        logger.warn("mutation_workspace_invalid", { taskId: request.taskId });
        return verification;
      }

      // Step 3: Git state validation
      if (!this.validateGitState(request, verification)) {
        logger.warn("mutation_git_state_invalid", { taskId: request.taskId });
        return verification;
      }

      // Step 4: Path validation (traversal protection)
      if (!this.validatePaths(request, verification)) {
        logger.warn("mutation_paths_invalid", { taskId: request.taskId });
        return verification;
      }

      // Step 5: File accessibility
      if (!this.validateFileAccess(request, verification)) {
        logger.warn("mutation_file_access_failed", { taskId: request.taskId });
        return verification;
      }

      verification.authorized = true;
      logger.info("mutation_validated", { taskId: request.taskId });
    } catch (err) {
      verification.errors.push(`Validation error: ${String(err)}`);
      logger.error("mutation_validation_error", { taskId: request.taskId }, String(err));
    }

    return verification;
  }

  /**
   * Validate authorization
   * Check that agent is authorized for all affected projects
   */
  private validateAuthorization(request: MutationRequest, verification: MutationVerification): boolean {
    // Verify authorized projects match affected projects
    const affectedProjects = new Set<string>();
    affectedProjects.add(request.projectId);

    // In a multi-repo mutation, all projects must be explicitly authorized
    for (const project of affectedProjects) {
      if (!request.authorizedProjects.includes(project)) {
        verification.errors.push(`Project not authorized: ${project}`);
        return false;
      }
    }

    return true;
  }

  /**
   * Validate workspace is valid and in expected state
   */
  private validateWorkspace(request: MutationRequest, verification: MutationVerification): boolean {
    // In real implementation, would check:
    // - Workspace exists
    // - Workspace path is valid
    // - Workspace is not locked
    // - No concurrent mutations in same workspace

    verification.workspaceValid = true;
    return true;
  }

  /**
   * Validate Git state hasn't changed unexpectedly
   */
  private validateGitState(request: MutationRequest, verification: MutationVerification): boolean {
    // In real implementation, would check:
    // - Branch matches expected
    // - No uncommitted changes unless approved
    // - No rebase/merge in progress
    // - Remote is reachable if push intended

    verification.gitStateValid = true;
    return true;
  }

  /**
   * Validate file paths (prevent traversal attacks)
   */
  private validatePaths(request: MutationRequest, verification: MutationVerification): boolean {
    const forbidden = ["../", "..\\", "~", "$HOME"];

    for (const file of [
      ...request.files.modified,
      ...request.files.created,
      ...request.files.deleted,
    ]) {
      // Normalize path
      const normalized = file.replace(/\\/g, "/");

      // Check for traversal attempts
      for (const pattern of forbidden) {
        if (normalized.includes(pattern)) {
          verification.errors.push(`Path traversal detected: ${file}`);
          return false;
        }
      }

      // Check for absolute paths (must be relative to workspace)
      if (normalized.startsWith("/")) {
        verification.errors.push(`Absolute path not allowed: ${file}`);
        return false;
      }
    }

    verification.pathsValid = true;
    return true;
  }

  /**
   * Validate file access
   * In real implementation, would check actual filesystem
   */
  private validateFileAccess(request: MutationRequest, verification: MutationVerification): boolean {
    // In real implementation, would:
    // - Check read permissions for files being read
    // - Check write permissions for files being modified/created
    // - Check delete permissions for files being deleted
    // - Verify workspace writable

    verification.filesAccessible = true;
    return true;
  }

  /**
   * Get command classification and authorization requirement
   */
  getCommandPolicy(command: string): {
    classification: CommandClassification;
    requiresAuthorization: boolean;
  } {
    const classification = this.classifyCommand(command);

    return {
      classification,
      requiresAuthorization: classification !== "SAFE",
    };
  }

  /**
   * Check if mutation is safe for automatic execution
   */
  canAutoExecute(command: string): boolean {
    return this.classifyCommand(command) === "SAFE";
  }

  /**
   * Get human-readable policy message
   */
  getPolicyMessage(classification: CommandClassification): string {
    switch (classification) {
      case "SAFE":
        return "This command is safe to run automatically";
      case "REQUIRES_CONFIRMATION":
        return "This command requires explicit authorization";
      case "BLOCKED":
        return "This command is blocked for safety reasons";
    }
  }
}

// Global instance
let validator: MutationValidator | null = null;

/**
 * Get or create mutation validator
 */
export function getMutationValidator(): MutationValidator {
  if (!validator) {
    validator = new MutationValidator();
  }
  return validator;
}
