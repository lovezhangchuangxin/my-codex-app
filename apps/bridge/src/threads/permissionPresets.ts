import type { ThreadPermissionPresetId } from '@my-codex-app/protocol';

import type {
  AppServerApprovalPolicy,
  AppServerSandboxPolicy,
} from '../appServerClient.js';

export function toAppServerPermissionPreset(
  threadCwd: string | undefined,
  preset: ThreadPermissionPresetId,
): {
  approvalPolicy: AppServerApprovalPolicy;
  sandboxPolicy: AppServerSandboxPolicy;
} {
  switch (preset) {
    case 'read-only':
      return {
        approvalPolicy: 'on-request',
        sandboxPolicy: {
          type: 'readOnly',
          access: { type: 'fullAccess' },
          networkAccess: false,
        },
      };
    case 'auto':
      return {
        approvalPolicy: 'on-request',
        sandboxPolicy: {
          type: 'workspaceWrite',
          writableRoots: threadCwd ? [threadCwd] : [],
          readOnlyAccess: { type: 'fullAccess' },
          networkAccess: false,
          excludeTmpdirEnvVar: false,
          excludeSlashTmp: false,
        },
      };
    case 'full-access':
      return {
        approvalPolicy: 'never',
        sandboxPolicy: {
          type: 'dangerFullAccess',
        },
      };
  }
}

export function derivePermissionPreset(
  approvalPolicy: AppServerApprovalPolicy,
  sandboxPolicy: AppServerSandboxPolicy,
): ThreadPermissionPresetId | null {
  if (approvalPolicy === 'on-request' && sandboxPolicy.type === 'readOnly') {
    return 'read-only';
  }
  if (
    approvalPolicy === 'on-request' &&
    sandboxPolicy.type === 'workspaceWrite'
  ) {
    return 'auto';
  }
  if (approvalPolicy === 'never' && sandboxPolicy.type === 'dangerFullAccess') {
    return 'full-access';
  }
  return null;
}
