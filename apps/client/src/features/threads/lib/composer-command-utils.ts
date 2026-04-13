export type SupportedComposerCommandId =
  | 'rename'
  | 'new'
  | 'clear'
  | 'resume'
  | 'compact'
  | 'review'
  | 'mention'
  | 'model'
  | 'permissions';

export interface SupportedComposerCommand {
  id: SupportedComposerCommandId;
  command: string;
  descriptionKey: string;
  supportsInlineArgs: boolean;
}

const SUPPORTED_COMPOSER_COMMANDS: SupportedComposerCommand[] = [
  {
    id: 'model',
    command: 'model',
    descriptionKey: 'detail.composer.command.model',
    supportsInlineArgs: false,
  },
  {
    id: 'permissions',
    command: 'permissions',
    descriptionKey: 'detail.composer.command.permissions',
    supportsInlineArgs: false,
  },
  {
    id: 'review',
    command: 'review',
    descriptionKey: 'detail.composer.command.review',
    supportsInlineArgs: true,
  },
  {
    id: 'rename',
    command: 'rename',
    descriptionKey: 'detail.composer.command.rename',
    supportsInlineArgs: true,
  },
  {
    id: 'new',
    command: 'new',
    descriptionKey: 'detail.composer.command.new',
    supportsInlineArgs: false,
  },
  {
    id: 'clear',
    command: 'clear',
    descriptionKey: 'detail.composer.command.clear',
    supportsInlineArgs: false,
  },
  {
    id: 'resume',
    command: 'resume',
    descriptionKey: 'detail.composer.command.resume',
    supportsInlineArgs: false,
  },
  {
    id: 'mention',
    command: 'mention',
    descriptionKey: 'detail.composer.command.mention',
    supportsInlineArgs: false,
  },
  {
    id: 'compact',
    command: 'compact',
    descriptionKey: 'detail.composer.command.compact',
    supportsInlineArgs: false,
  },
];

export function listSupportedComposerCommands(): SupportedComposerCommand[] {
  return SUPPORTED_COMPOSER_COMMANDS;
}

export function findSupportedComposerCommand(
  commandName: string,
): SupportedComposerCommand | null {
  return (
    SUPPORTED_COMPOSER_COMMANDS.find(
      (command) => command.command === commandName,
    ) ?? null
  );
}

export function matchSupportedComposerCommands(
  query: string,
): SupportedComposerCommand[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (normalizedQuery.length === 0) {
    return SUPPORTED_COMPOSER_COMMANDS;
  }

  return [...SUPPORTED_COMPOSER_COMMANDS]
    .map((command) => ({
      command,
      score: scoreCommandMatch(command.command, normalizedQuery),
    }))
    .filter((entry) => entry.score !== null)
    .sort((left, right) => {
      if (left.score !== right.score) {
        return (
          (left.score ?? Number.MAX_SAFE_INTEGER) -
          (right.score ?? Number.MAX_SAFE_INTEGER)
        );
      }
      return left.command.command.localeCompare(right.command.command);
    })
    .map((entry) => entry.command);
}

function scoreCommandMatch(commandName: string, query: string): number | null {
  const normalizedName = commandName.toLowerCase();
  if (normalizedName === query) {
    return 0;
  }
  if (normalizedName.startsWith(query)) {
    return 10 + normalizedName.length - query.length;
  }

  const directIndex = normalizedName.indexOf(query);
  if (directIndex >= 0) {
    return 40 + directIndex;
  }

  const subsequenceScore = getSubsequenceScore(normalizedName, query);
  if (subsequenceScore !== null) {
    return 80 + subsequenceScore;
  }

  return null;
}

function getSubsequenceScore(value: string, query: string): number | null {
  let queryIndex = 0;
  let firstMatch = -1;
  let lastMatch = -1;

  for (
    let index = 0;
    index < value.length && queryIndex < query.length;
    index += 1
  ) {
    if (value[index] !== query[queryIndex]) {
      continue;
    }
    if (firstMatch < 0) {
      firstMatch = index;
    }
    lastMatch = index;
    queryIndex += 1;
  }

  if (queryIndex !== query.length || firstMatch < 0 || lastMatch < 0) {
    return null;
  }

  return lastMatch - firstMatch + (value.length - query.length);
}
