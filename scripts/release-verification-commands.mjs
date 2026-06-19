export const releaseArtifactSetupCommands = Object.freeze([
  "pnpm check:release-packages",
  "pnpm build:apps-in-toss:candidate",
  "pnpm check:package",
  "pnpm release:artifact-manifest",
  "pnpm check:release-artifact-manifest",
  "pnpm check:release-verification-commands",
  "pnpm check:release-manual-blockers",
  "pnpm check:public-url-guard"
]);

export const releaseArtifactVerificationCommands = Object.freeze([
  ...releaseArtifactSetupCommands,
  "pnpm check:release:automated"
]);

export const manualQaPreflightCommands = Object.freeze([
  ...releaseArtifactSetupCommands,
  "pnpm release:manual-qa-packet",
  "pnpm check:manual-qa-packet",
  "pnpm check:manual-qa"
]);

export const releaseConsolePreflightCommands = Object.freeze([
  ...releaseArtifactSetupCommands,
  "pnpm release:console-packet",
  "pnpm check:release-console-packet",
  "pnpm check:release-console"
]);

export const storeSubmissionPreflightCommands = Object.freeze([
  ...releaseArtifactSetupCommands,
  "pnpm release:manual-qa-packet",
  "pnpm check:manual-qa-packet",
  "pnpm release:console-packet",
  "pnpm check:release-console-packet",
  "pnpm release:rating-content-inventory",
  "pnpm check:rating-content-inventory",
  "pnpm release:public-pages",
  "pnpm check:public-pages",
  "pnpm release:store-submission-packet",
  "pnpm check:store-submission-packet",
  "pnpm release:gate-dashboard",
  "pnpm check:release-gate-dashboard",
  "pnpm release:approval-packet",
  "pnpm check:release-approval-packet",
  "pnpm check:release:automated"
]);

export const releaseDashboardVerificationCommands = Object.freeze([
  ...storeSubmissionPreflightCommands.slice(0, -1),
  "pnpm check:release-approval",
  "pnpm check:release:automated"
]);

export const releaseApprovalPreflightCommands = Object.freeze([
  ...releaseArtifactSetupCommands,
  "pnpm release:manual-qa-packet",
  "pnpm check:manual-qa-packet",
  "pnpm check:manual-qa",
  "pnpm check:manual-qa:strict",
  "pnpm release:console-packet",
  "pnpm check:release-console-packet",
  "pnpm check:release-console",
  "pnpm check:release-console:strict",
  "pnpm release:store-submission-packet",
  "pnpm check:store-submission-packet",
  "pnpm check:store-config:strict",
  "pnpm release:gate-dashboard",
  "pnpm check:release-gate-dashboard",
  "pnpm release:approval-packet",
  "pnpm check:release-approval-packet",
  "pnpm check:release-approval",
  "pnpm check:release:automated"
]);

export function renderCommandBlock(commands) {
  return commands.join("\n");
}
