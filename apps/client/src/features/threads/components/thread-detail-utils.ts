export function formatTokenCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

export function looksLikeMarkdownContent(content: string) {
  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return false;
  }

  return (
    /^#{1,6}\s/m.test(trimmed) ||
    /^>\s/m.test(trimmed) ||
    /^```/m.test(trimmed) ||
    /^\s*[-*+]\s/m.test(trimmed) ||
    /^\s*\d+\.\s/m.test(trimmed) ||
    /\[[^\]]+\]\([^)]+\)/.test(trimmed) ||
    /\|.+\|/.test(trimmed)
  );
}

export function parseFilePathWithLine(href: string): {
  path: string;
  line: number | null;
} {
  const match = href.match(/^(.+?)#L(\d+)$/i);
  if (match?.[1] != null && match[2] != null) {
    return { path: match[1], line: parseInt(match[2], 10) };
  }
  return { path: href, line: null };
}

export function getCommandDisplay(command: string): string {
  const trimmed = command.trim();
  const wrappedCommandMatch =
    /^(?<shell>(?:\/bin\/|\/usr\/bin\/)?(?:bash|zsh|sh))\s+(?<flags>-[A-Za-z]+(?:\s+-[A-Za-z]+)*)\s+(?<body>[\s\S]+)$/u.exec(
      trimmed,
    );

  if (!wrappedCommandMatch?.groups) {
    return command;
  }

  const { body, flags } = wrappedCommandMatch.groups;
  if (!body || !flags || !flags.includes('c')) {
    return command;
  }

  const unwrappedBody = unwrapShellCommandBody(body);
  if (!unwrappedBody || unwrappedBody === trimmed) {
    return command;
  }

  return unwrappedBody;
}

function unwrapShellCommandBody(body: string): string | null {
  const trimmed = body.trim();
  if (trimmed.length < 2) {
    return null;
  }

  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return trimmed.slice(1, -1).replace(/'\\''/g, "'");
  }

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }

  return trimmed;
}
