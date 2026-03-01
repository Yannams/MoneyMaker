import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';

const ROOT = process.cwd();

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
]);

const IGNORED_FILES = new Set([
  'package-lock.json',
  'bun.lockb',
  'types.ts',
]);

const TEXT_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.json',
  '.md',
  '.html',
  '.css',
  '.scss',
  '.sql',
  '.toml',
  '.yml',
  '.yaml',
]);

const BROKEN_TOKENS = [
  '\u00C3', // mojibake marker #1
  '\u00C2', // mojibake marker #2
  '\u00E2\u20AC\u2122', // mojibake marker #3
  '\u00E2\u20AC\u0153', // mojibake marker #4
  '\u00E2\u20AC', // mojibake marker #5
  '\uFFFD', // replacement-char marker
];

const CONTRACTION_REGEX = new RegExp(
  String.raw`\b([cCdDjJlLmMnNsStT])\s+([aAeEiIoOuUyYhH\u00C0\u00C2\u00C4\u00C8\u00C9\u00CA\u00CB\u00CE\u00CF\u00D4\u00D6\u00D9\u00DB\u00DC\u00E0\u00E2\u00E4\u00E8\u00E9\u00EA\u00EB\u00EE\u00EF\u00F4\u00F6\u00F9\u00FB\u00FC])`,
  'g',
);

const issues = [];

function walk(dirPath) {
  for (const entry of readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.name.startsWith('.') && entry.name !== '.vscode') continue;
    const fullPath = join(dirPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) continue;
      walk(fullPath);
      continue;
    }

    if (!entry.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(extname(entry.name))) continue;
    if (IGNORED_FILES.has(entry.name)) continue;
    checkFile(fullPath);
  }
}

function getStringLiterals(line) {
  return line.match(/(['"`])(?:\\.|(?!\1).)*\1/g) ?? [];
}

function checkFile(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf8');
  } catch (error) {
    issues.push({
      filePath,
      line: 1,
      reason: `Non-UTF8 file (${String(error)})`,
    });
    return;
  }

  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
    if (line.includes('french-text-check-ignore')) return;

    for (const token of BROKEN_TOKENS) {
      if (line.includes(token)) {
        issues.push({
          filePath,
          line: index + 1,
          reason: `Suspicious encoding token found (${token})`,
        });
      }
    }

    for (const literal of getStringLiterals(line)) {
      CONTRACTION_REGEX.lastIndex = 0;
      let match;
      while ((match = CONTRACTION_REGEX.exec(literal)) !== null) {
        const contraction = `${match[1]} ${match[2]}`;
        const expected = `${match[1]}'${match[2]}`;
        issues.push({
          filePath,
          line: index + 1,
          reason: `Possible missing apostrophe: "${contraction}" -> "${expected}"`,
        });
      }
    }
  });
}

walk(ROOT);

if (issues.length > 0) {
  console.error('French text issues detected:\n');
  for (const issue of issues) {
    console.error(`- ${issue.filePath}:${issue.line} ${issue.reason}`);
  }
  process.exit(1);
}

console.log('OK: encoding/apostrophes checks passed.');
