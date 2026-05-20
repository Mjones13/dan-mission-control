'use client';

import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react';

interface LinkifiedTextProps {
  children: ReactNode;
  className?: string;
}

export type TextPart =
  | { type: 'text'; value: string }
  | { type: 'url'; value: string }
  | { type: 'slash-token'; value: string }
  | { type: 'code-identifier'; value: string };

const TOKEN_CANDIDATE_PATTERN = /\S+/g;
const TRAILING_PUNCTUATION_PATTERN = /[.,!?;:)\]}'"`]+$/;
const LEADING_PUNCTUATION_PATTERN = /^[([{"'`]+/;
const KNOWN_FILE_EXTENSION_PATTERN = /\.(?:c|cc|cpp|cs|css|csv|go|h|hpp|html|java|js|jsx|json|kt|lock|md|mdx|mjs|php|py|rb|rs|scss|sh|sql|swift|toml|ts|tsx|txt|xml|ya?ml)$/i;
const FILENAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const RELATIVE_PATH_PATTERN = /^(?:\.{1,2}\/)?[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+$/;
const ABSOLUTE_PATH_PATTERN = /^\/(?!\/)(?:[A-Za-z0-9._~:@%+-]+\/)+[A-Za-z0-9._~:@%+-]*$/;
const SLASH_COMMAND_PATTERN = /^\/[A-Za-z][A-Za-z0-9_-]*$/;
const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]*$/;
const LOWER_TO_UPPER_BOUNDARY_PATTERN = /[a-z][A-Z]/;
const MIN_CODE_IDENTIFIER_LENGTH = 4;

function isSafeHttpUrl(value: string): boolean {
  if (!/^https?:\/\//i.test(value)) return false;

  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function splitLeadingPunctuation(value: string): [string, string] {
  const leadingMatch = value.match(LEADING_PUNCTUATION_PATTERN);
  if (!leadingMatch) return ['', value];

  return [leadingMatch[0], value.slice(leadingMatch[0].length)];
}

function splitTrailingPunctuation(value: string): [string, string] {
  const trailingMatch = value.match(TRAILING_PUNCTUATION_PATTERN);
  if (!trailingMatch) return [value, ''];

  return [value.slice(0, -trailingMatch[0].length), trailingMatch[0]];
}

function isKnownFileLikeToken(value: string): boolean {
  if (!KNOWN_FILE_EXTENSION_PATTERN.test(value)) return false;

  if (value.includes('/')) {
    return RELATIVE_PATH_PATTERN.test(value);
  }

  return FILENAME_PATTERN.test(value);
}

function isSlashToken(value: string): boolean {
  return SLASH_COMMAND_PATTERN.test(value) || ABSOLUTE_PATH_PATTERN.test(value);
}

function isCodeIdentifier(value: string): boolean {
  if (value.length < MIN_CODE_IDENTIFIER_LENGTH) return false;
  if (!IDENTIFIER_PATTERN.test(value)) return false;

  return LOWER_TO_UPPER_BOUNDARY_PATTERN.test(value);
}

function classifyToken(value: string): TextPart['type'] | null {
  if (isSafeHttpUrl(value)) return 'url';
  if (isSlashToken(value) || isKnownFileLikeToken(value)) return 'slash-token';
  if (isCodeIdentifier(value)) return 'code-identifier';

  return null;
}

export function tokenizeText(text: string): TextPart[] {
  const parts: TextPart[] = [];
  let lastIndex = 0;
  TOKEN_CANDIDATE_PATTERN.lastIndex = 0;

  let match = TOKEN_CANDIDATE_PATTERN.exec(text);
  while (match) {
    const rawCandidate = match[0];
    const index = match.index;
    const [leadingPunctuation, candidateWithTrailing] = splitLeadingPunctuation(rawCandidate);
    const [token, trailingPunctuation] = splitTrailingPunctuation(candidateWithTrailing);
    const tokenType = token ? classifyToken(token) : null;

    if (tokenType) {
      if (index > lastIndex) {
        parts.push({ type: 'text', value: text.slice(lastIndex, index) });
      }

      if (leadingPunctuation) {
        parts.push({ type: 'text', value: leadingPunctuation });
      }

      parts.push({ type: tokenType, value: token });

      if (trailingPunctuation) {
        parts.push({ type: 'text', value: trailingPunctuation });
      }

      lastIndex = index + rawCandidate.length;
    }

    match = TOKEN_CANDIDATE_PATTERN.exec(text);
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'text', value: text.slice(lastIndex) });
  }

  return parts;
}

function copyTokenWithTextareaFallback(token: string): boolean {
  const textarea = document.createElement('textarea');
  textarea.value = token;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.left = '-9999px';
  textarea.style.top = '0';
  document.body.appendChild(textarea);

  const previousSelection = document.getSelection()?.rangeCount ? document.getSelection()?.getRangeAt(0) : null;
  textarea.select();
  textarea.setSelectionRange(0, textarea.value.length);

  let copied = false;
  try {
    copied = document.execCommand('copy');
  } catch {
    copied = false;
  } finally {
    document.body.removeChild(textarea);
    if (previousSelection) {
      const selection = document.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(previousSelection);
    }
  }

  return copied;
}

async function copyTokenToClipboard(token: string): Promise<boolean> {
  if (navigator.clipboard?.writeText && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(token);
      return true;
    } catch {
      // Fall through to the legacy copy path below.
    }
  }

  return copyTokenWithTextareaFallback(token);
}

function CopyableToken({ value, type }: { value: string; type: 'slash-token' | 'code-identifier' }) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const didCopy = await copyTokenToClipboard(value);
    if (!didCopy) return;

    setCopied(true);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setCopied(false), 900);
  };

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => { void handleCopy(); }}
        className="inline cursor-pointer rounded px-0.5 text-left font-medium text-sky-300 transition-colors hover:bg-sky-300/10 hover:text-sky-200 focus:outline-none focus:ring-1 focus:ring-sky-300/60"
        title={type === 'code-identifier' ? 'Copy identifier' : 'Copy token'}
      >
        {value}
      </button>
      {copied && (
        <span className="pointer-events-none absolute left-1/2 top-0 z-10 -translate-x-1/2 -translate-y-full rounded bg-mc-bg px-1.5 py-0.5 text-[10px] font-medium text-mc-accent shadow-lg ring-1 ring-mc-accent/40">
          Copied
        </span>
      )}
    </span>
  );
}

function renderText(text: string, keyPrefix: string) {
  return tokenizeText(text).map((part, index) => {
    const key = `${keyPrefix}-${index}`;

    if (part.type === 'url') {
      return (
        <a
          key={key}
          href={part.value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-sky-300 underline underline-offset-2 hover:text-sky-200"
        >
          {part.value}
        </a>
      );
    }

    if (part.type === 'slash-token' || part.type === 'code-identifier') {
      return <CopyableToken key={key} value={part.value} type={part.type} />;
    }

    return <Fragment key={key}>{part.value}</Fragment>;
  });
}

function renderNode(node: ReactNode, keyPrefix: string): ReactNode {
  if (typeof node === 'string' || typeof node === 'number') {
    return renderText(String(node), keyPrefix);
  }

  if (Array.isArray(node)) {
    return node.map((child, index) => <Fragment key={`${keyPrefix}-${index}`}>{renderNode(child, `${keyPrefix}-${index}`)}</Fragment>);
  }

  return node;
}

export function LinkifiedText({ children, className }: LinkifiedTextProps) {
  return <div className={className}>{renderNode(children, 'text')}</div>;
}
