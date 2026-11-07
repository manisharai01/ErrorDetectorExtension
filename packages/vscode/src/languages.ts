/**
 * Which documents the extension analyzes. Kept free of `vscode` imports so the
 * language coverage can be unit-tested in plain Node (test/languages.test.cjs).
 *
 * A document is analyzed when its FILE EXTENSION is one @ied/core supports
 * (`SOURCE_EXTENSIONS`) — that works even when no language extension is
 * installed for it (e.g. `.kt` or `.dart` files open as plain text). The
 * VS Code language ids are only a fallback for unsaved (untitled) editors and
 * for activation.
 */

import { SOURCE_EXTENSIONS, languageFromPath, type Language } from '@ied/core';

/** VS Code language id -> the IED language it maps to. */
export const LANGUAGE_BY_ID: Readonly<Record<string, Language>> = {
  javascript: 'javascript',
  javascriptreact: 'jsx',
  typescript: 'typescript',
  typescriptreact: 'tsx',
  vue: 'vue',
  python: 'python',
  go: 'go',
  rust: 'rust',
  java: 'java',
  kotlin: 'kotlin',
  swift: 'swift',
  c: 'c',
  cpp: 'cpp',
  php: 'php',
  csharp: 'csharp',
  ruby: 'ruby',
  dart: 'dart'
};

export const LANGUAGE_IDS: readonly string[] = Object.keys(LANGUAGE_BY_ID);

/** Glob matching every file the engine can analyze. */
export const SOURCE_GLOB = `**/*.{${SOURCE_EXTENSIONS.map((e) => e.slice(1)).join(',')}}`;

/** Document selector for providers and the LSP client: by language id OR by file pattern. */
export const DOCUMENT_SELECTOR: ReadonlyArray<{ scheme: string; language?: string; pattern?: string }> = [
  ...LANGUAGE_IDS.map((language) => ({ scheme: 'file', language })),
  ...LANGUAGE_IDS.map((language) => ({ scheme: 'untitled', language })),
  { scheme: 'file', pattern: SOURCE_GLOB }
];

/** The IED language for a document, or null when it should not be analyzed. */
export function iedLanguageFor(doc: { fileName: string; languageId: string; uri: { scheme: string } }): Language | null {
  if (doc.uri.scheme !== 'file' && doc.uri.scheme !== 'untitled') return null; // git:, output:, …
  return languageFromPath(doc.fileName) ?? LANGUAGE_BY_ID[doc.languageId] ?? null;
}

/** Glob for `workspace.findFiles` excludes, from the `invisibleErrors.exclude` setting. */
export function excludeGlob(patterns: readonly string[]): string | undefined {
  if (patterns.length === 0) return undefined;
  return patterns.length === 1 ? patterns[0] : `{${patterns.join(',')}}`;
}
