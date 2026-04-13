const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  bash: 'bash',
  cjs: 'javascript',
  css: 'css',
  go: 'go',
  htm: 'html',
  html: 'html',
  java: 'java',
  js: 'javascript',
  jsonc: 'jsonc',
  json: 'json',
  jsx: 'jsx',
  markdown: 'markdown',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  rs: 'rust',
  scss: 'scss',
  sh: 'bash',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  xml: 'xml',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
};

export function normalizeWorkspacePath(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? '';
  if (trimmed.length === 0) {
    return '';
  }

  const normalized = trimmed.replace(/\\/g, '/');
  if (isAbsoluteLikePath(normalized)) {
    return null;
  }

  const segments = normalized
    .split('/')
    .filter((segment) => segment.length > 0 && segment !== '.');

  if (segments.some((segment) => segment === '..')) {
    return null;
  }

  return segments.join('/');
}

export function toWorkspaceRelativePath(
  rootPath: string,
  candidatePath: string | null | undefined,
): string | null {
  const trimmed = candidatePath?.trim() ?? '';
  if (trimmed.length === 0 || trimmed === 'unknown') {
    return null;
  }

  const normalizedCandidate = trimmed.replace(/\\/g, '/');
  if (!isAbsoluteLikePath(normalizedCandidate)) {
    return normalizeWorkspacePath(normalizedCandidate);
  }

  const normalizedRoot = rootPath
    .trim()
    .replace(/\\/g, '/')
    .replace(/\/+$/, '');
  if (normalizedRoot.length === 0) {
    return null;
  }

  if (normalizedCandidate === normalizedRoot) {
    return '';
  }

  const normalizedRootPrefix = normalizedRoot.endsWith('/')
    ? normalizedRoot
    : `${normalizedRoot}/`;
  if (!normalizedCandidate.startsWith(normalizedRootPrefix)) {
    return null;
  }

  return normalizeWorkspacePath(
    normalizedCandidate.slice(normalizedRootPrefix.length),
  );
}

export function getAncestorDirectoryPaths(filePath: string): string[] {
  const normalized = normalizeWorkspacePath(filePath);
  if (normalized === null || normalized.length === 0) {
    return [];
  }

  const segments = normalized.split('/');
  const ancestors: string[] = [];

  for (let index = 0; index < segments.length - 1; index++) {
    ancestors.push(segments.slice(0, index + 1).join('/'));
  }

  return ancestors;
}

export function getParentDirectoryPath(workspacePath: string): string {
  const normalized = normalizeWorkspacePath(workspacePath);
  if (normalized === null || normalized.length === 0) {
    return '';
  }

  const segments = normalized.split('/');
  return segments.slice(0, -1).join('/');
}

export function getFileName(workspacePath: string): string {
  const normalized = workspacePath.replace(/\\/g, '/');
  const segments = normalized.split('/').filter(Boolean);
  return segments.at(-1) ?? workspacePath;
}

export function joinWorkspacePath(
  parentPath: string,
  childName: string,
): string {
  return parentPath.length > 0 ? `${parentPath}/${childName}` : childName;
}

export function inferCodeLanguageFromPath(
  workspacePath: string,
): string | undefined {
  const fileName = getFileName(workspacePath);
  const extension = fileName.split('.').at(-1)?.toLowerCase();
  if (!extension) {
    return undefined;
  }

  return LANGUAGE_BY_EXTENSION[extension];
}

export function formatFileSize(bytes: number | undefined): string | null {
  if (bytes === undefined || !Number.isFinite(bytes)) {
    return null;
  }

  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unitIndex]}`;
}

function isAbsoluteLikePath(value: string): boolean {
  return (
    value.startsWith('/') ||
    value.startsWith('\\') ||
    /^[A-Za-z]:/.test(value) ||
    value.startsWith('//')
  );
}
