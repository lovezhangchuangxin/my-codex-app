export interface ComposerTokenMatch {
  start: number;
  end: number;
  token: string;
  query: string;
}

export interface SlashCommandSubmission {
  commandName: string;
  args: string;
}

export function findMentionToken(
  text: string,
  caret: number
): ComposerTokenMatch | null {
  return findPrefixedToken(text, caret, "@", true);
}

export function findSlashCommandToken(
  text: string,
  caret: number
): ComposerTokenMatch | null {
  const safeCaret = clampCaret(text, caret);
  const firstLineEnd = text.indexOf("\n");
  const effectiveFirstLineEnd = firstLineEnd >= 0 ? firstLineEnd : text.length;
  const firstLine = text.slice(0, effectiveFirstLineEnd);

  if (!firstLine.startsWith("/") || safeCaret > effectiveFirstLineEnd) {
    return null;
  }

  const commandEnd = findTokenEnd(firstLine, 0);
  if (safeCaret > commandEnd) {
    return null;
  }

  const token = firstLine.slice(0, commandEnd);
  if (token.length === 0 || token.startsWith("/ ") || token.includes("/", 1)) {
    return null;
  }

  return {
    start: 0,
    end: commandEnd,
    token,
    query: token.slice(1)
  };
}

export function parseSlashCommandSubmission(
  text: string
): SlashCommandSubmission | null {
  if (!text.startsWith("/")) {
    return null;
  }

  const commandEnd = findTokenEnd(text, 0);
  const token = text.slice(0, commandEnd);
  if (token.length <= 1 || token.startsWith("/ ") || token.includes("/", 1)) {
    return null;
  }

  return {
    commandName: token.slice(1),
    args: text.slice(commandEnd).trim()
  };
}

export function replaceComposerToken(
  text: string,
  token: ComposerTokenMatch,
  replacement: string,
  options?: { addTrailingSpace?: boolean }
): {
  nextText: string;
  nextCaret: number;
} {
  const suffix = options?.addTrailingSpace === false ? "" : " ";
  const inserted = `${replacement}${suffix}`;
  const nextText = `${text.slice(0, token.start)}${inserted}${text.slice(token.end)}`;
  const nextCaret = token.start + inserted.length;

  return {
    nextText,
    nextCaret
  };
}

export function formatPathInsertion(path: string): string {
  const needsQuotes = /\s/.test(path);
  if (!needsQuotes || path.includes("\"")) {
    return path;
  }

  return `"${path}"`;
}

function findPrefixedToken(
  text: string,
  caret: number,
  prefix: string,
  allowEmpty: boolean
): ComposerTokenMatch | null {
  const safeCaret = clampCaret(text, caret);
  const start = findTokenStart(text, safeCaret);
  const end = findTokenEnd(text, safeCaret);
  const token = text.slice(start, end);

  if (!token.startsWith(prefix)) {
    return null;
  }
  if (token.length === prefix.length && !allowEmpty) {
    return null;
  }

  return {
    start,
    end,
    token,
    query: token.slice(prefix.length)
  };
}

function clampCaret(text: string, caret: number): number {
  if (!Number.isFinite(caret)) {
    return text.length;
  }

  return Math.max(0, Math.min(Math.trunc(caret), text.length));
}

function findTokenStart(text: string, caret: number): number {
  let index = clampCaret(text, caret);
  while (index > 0 && !isTokenBoundary(text[index - 1])) {
    index -= 1;
  }
  return index;
}

function findTokenEnd(text: string, caret: number): number {
  let index = clampCaret(text, caret);
  while (index < text.length && !isTokenBoundary(text[index])) {
    index += 1;
  }
  return index;
}

function isTokenBoundary(character: string | undefined): boolean {
  return character === undefined || /\s/.test(character);
}
