import { realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { homedir } from 'node:os';

export function resolveProjectIdentityPath(
  value: string | null | undefined,
): string | null {
  const normalizedPath = normalizeAbsolutePath(value, false);
  if (normalizedPath === null) {
    return value?.trim() ? path.normalize(expandHomePath(value.trim())) : null;
  }

  try {
    const resolvedPath = realpathSync(normalizedPath);
    const resolvedStats = statSync(resolvedPath);
    if (resolvedStats.isDirectory()) {
      return resolvedPath;
    }
  } catch {
    // Fall back to the normalized absolute path when canonicalization fails.
  }

  return normalizedPath;
}

export function normalizeAbsolutePath(
  value: string | null | undefined,
  requireAbsolute: boolean,
): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return null;
  }

  const expanded = expandHomePath(trimmed);
  if (!path.isAbsolute(expanded)) {
    if (requireAbsolute) {
      return null;
    }
    return null;
  }

  return path.normalize(expanded);
}

export function expandHomePath(value: string): string {
  if (value === '~') {
    return homedir();
  }

  if (value.startsWith(`~${path.sep}`) || value.startsWith('~/')) {
    return path.join(homedir(), value.slice(2));
  }

  return value;
}

export function getProjectDisplayName(projectPath: string): string {
  const trimmedPath = projectPath.trim();
  if (trimmedPath.length === 0) {
    return 'Unknown project';
  }

  const baseName = path.basename(trimmedPath);
  return baseName.length > 0 ? baseName : trimmedPath;
}
