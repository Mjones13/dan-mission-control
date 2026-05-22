import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { isInsideChildReplyMenuRoot } from './TelegramChatInboxPage';

describe('isInsideChildReplyMenuRoot', () => {
  const originalElement = globalThis.Element;

  afterEach(() => {
    globalThis.Element = originalElement;
  });

  it('returns true for targets inside the child reply menu root', () => {
    class FakeElement {
      closest(selector: string) {
        return selector === '[data-child-reply-menu-root]' ? this : null;
      }
    }
    globalThis.Element = FakeElement as typeof Element;

    assert.equal(isInsideChildReplyMenuRoot(new FakeElement() as unknown as EventTarget), true);
  });

  it('returns false for targets outside the child reply menu root', () => {
    class FakeElement {
      closest() {
        return null;
      }
    }
    globalThis.Element = FakeElement as typeof Element;

    assert.equal(isInsideChildReplyMenuRoot(new FakeElement() as unknown as EventTarget), false);
  });

  it('returns false for non-element targets', () => {
    class FakeElement {
      closest() {
        return this;
      }
    }
    globalThis.Element = FakeElement as typeof Element;

    assert.equal(isInsideChildReplyMenuRoot({} as EventTarget), false);
  });
});
