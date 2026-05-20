import test from 'node:test';
import assert from 'node:assert/strict';
import { parseMarkdownSourceTasks } from './parser';

test('parses checked and unchecked markdown checkbox tasks with line numbers', () => {
  const tasks = parseMarkdownSourceTasks([
    '# Plan',
    '',
    '- [ ] Implement queue filters',
    '- [x] Record verification evidence',
    '- [X] Done with uppercase marker',
  ].join('\n'), 'docs/plan.md');

  assert.equal(tasks.length, 3);
  assert.deepEqual(tasks.map((task) => task.lineNumber), [3, 4, 5]);
  assert.deepEqual(tasks.map((task) => task.checked), [false, true, true]);
  assert.deepEqual(tasks.map((task) => task.text), [
    'Implement queue filters',
    'Record verification evidence',
    'Done with uppercase marker',
  ]);
});

test('preserves indentation for nested tasks and ignores non-checkbox prose', () => {
  const tasks = parseMarkdownSourceTasks([
    '- regular bullet',
    '1. [ ] numbered item not supported yet',
    '  - [ ] Nested task',
    '\t- [x] Tab-indented task',
    '- [] malformed checkbox',
  ].join('\n'), '/tmp/spec.md');

  assert.equal(tasks.length, 2);
  assert.equal(tasks[0].text, 'Nested task');
  assert.equal(tasks[0].indent, 2);
  assert.equal(tasks[1].text, 'Tab-indented task');
  assert.equal(tasks[1].checked, true);
});

test('creates deterministic hashes independent of line movement', () => {
  const first = parseMarkdownSourceTasks('- [ ] Same task', 'docs/a.md')[0];
  const second = parseMarkdownSourceTasks('\n\n- [ ] Same task', 'docs/a.md')[0];
  const changedState = parseMarkdownSourceTasks('- [x] Same task', 'docs/a.md')[0];
  const changedPath = parseMarkdownSourceTasks('- [ ] Same task', 'docs/b.md')[0];

  assert.equal(first.contentHash, second.contentHash);
  assert.notEqual(first.contentHash, changedState.contentHash);
  assert.notEqual(first.contentHash, changedPath.contentHash);
});
