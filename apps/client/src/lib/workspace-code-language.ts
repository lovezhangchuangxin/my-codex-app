import { PrismAsyncLight as WorkspaceSyntaxHighlighter } from 'react-syntax-highlighter';
import bash from 'react-syntax-highlighter/dist/esm/languages/prism/bash';
import css from 'react-syntax-highlighter/dist/esm/languages/prism/css';
import go from 'react-syntax-highlighter/dist/esm/languages/prism/go';
import java from 'react-syntax-highlighter/dist/esm/languages/prism/java';
import javascript from 'react-syntax-highlighter/dist/esm/languages/prism/javascript';
import json from 'react-syntax-highlighter/dist/esm/languages/prism/json';
import jsx from 'react-syntax-highlighter/dist/esm/languages/prism/jsx';
import markdown from 'react-syntax-highlighter/dist/esm/languages/prism/markdown';
import markup from 'react-syntax-highlighter/dist/esm/languages/prism/markup';
import python from 'react-syntax-highlighter/dist/esm/languages/prism/python';
import rust from 'react-syntax-highlighter/dist/esm/languages/prism/rust';
import scss from 'react-syntax-highlighter/dist/esm/languages/prism/scss';
import toml from 'react-syntax-highlighter/dist/esm/languages/prism/toml';
import tsx from 'react-syntax-highlighter/dist/esm/languages/prism/tsx';
import typescript from 'react-syntax-highlighter/dist/esm/languages/prism/typescript';
import yaml from 'react-syntax-highlighter/dist/esm/languages/prism/yaml';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism';

const LANGUAGE_ALIASES: Record<string, string> = {
  bash: 'bash',
  console: 'bash',
  go: 'go',
  golang: 'go',
  html: 'markup',
  java: 'java',
  javascript: 'javascript',
  js: 'javascript',
  json: 'json',
  jsonc: 'json',
  jsx: 'jsx',
  markdown: 'markdown',
  md: 'markdown',
  py: 'python',
  python: 'python',
  rs: 'rust',
  rust: 'rust',
  scss: 'scss',
  sh: 'bash',
  shell: 'bash',
  toml: 'toml',
  ts: 'typescript',
  tsx: 'tsx',
  typescript: 'typescript',
  xml: 'markup',
  yaml: 'yaml',
  yml: 'yaml',
  zsh: 'bash',
};

let registeredLanguages = false;

function registerWorkspaceLanguages() {
  if (registeredLanguages) {
    return;
  }

  WorkspaceSyntaxHighlighter.registerLanguage('bash', bash);
  WorkspaceSyntaxHighlighter.registerLanguage('css', css);
  WorkspaceSyntaxHighlighter.registerLanguage('go', go);
  WorkspaceSyntaxHighlighter.registerLanguage('java', java);
  WorkspaceSyntaxHighlighter.registerLanguage('javascript', javascript);
  WorkspaceSyntaxHighlighter.registerLanguage('json', json);
  WorkspaceSyntaxHighlighter.registerLanguage('jsx', jsx);
  WorkspaceSyntaxHighlighter.registerLanguage('markdown', markdown);
  WorkspaceSyntaxHighlighter.registerLanguage('markup', markup);
  WorkspaceSyntaxHighlighter.registerLanguage('python', python);
  WorkspaceSyntaxHighlighter.registerLanguage('rust', rust);
  WorkspaceSyntaxHighlighter.registerLanguage('scss', scss);
  WorkspaceSyntaxHighlighter.registerLanguage('toml', toml);
  WorkspaceSyntaxHighlighter.registerLanguage('tsx', tsx);
  WorkspaceSyntaxHighlighter.registerLanguage('typescript', typescript);
  WorkspaceSyntaxHighlighter.registerLanguage('yaml', yaml);

  registeredLanguages = true;
}

registerWorkspaceLanguages();

export function resolveWorkspaceCodeLanguage(language?: string) {
  const normalizedLanguage = language?.trim().toLowerCase();
  if (!normalizedLanguage) {
    return undefined;
  }

  return LANGUAGE_ALIASES[normalizedLanguage] ?? normalizedLanguage;
}

export { WorkspaceSyntaxHighlighter, oneDark, oneLight };
