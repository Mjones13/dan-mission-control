import { createHash } from 'crypto';

export interface SourceTaskSnapshot {
  sourcePath: string;
  lineNumber: number;
  checked: boolean;
  text: string;
  indent: number;
  contentHash: string;
}

const CHECKBOX_TASK_PATTERN = /^(\s*)[-*]\s+\[([ xX])\]\s+(.+?)\s*$/;

function normalizeTaskText(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

function buildContentHash(input: Omit<SourceTaskSnapshot, 'contentHash'>): string {
  return createHash('sha256')
    .update(JSON.stringify({
      sourcePath: input.sourcePath,
      checked: input.checked,
      text: input.text,
    }))
    .digest('hex')
    .slice(0, 24);
}

export function parseMarkdownSourceTasks(content: string, sourcePath: string): SourceTaskSnapshot[] {
  return content.split(/\r?\n/).flatMap((line, index) => {
    const match = line.match(CHECKBOX_TASK_PATTERN);
    if (!match) return [];

    const [, leadingWhitespace, state, rawText] = match;
    const text = normalizeTaskText(rawText);
    if (!text) return [];

    const taskWithoutHash = {
      sourcePath,
      lineNumber: index + 1,
      checked: state.toLowerCase() === 'x',
      text,
      indent: leadingWhitespace.length,
    };

    return [{
      ...taskWithoutHash,
      contentHash: buildContentHash(taskWithoutHash),
    }];
  });
}
