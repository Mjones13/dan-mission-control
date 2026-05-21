import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { Api } from 'telegram';
import {
  __resetTelegramClientManagerForTests,
  getTelegramClientManagerHealth,
  resetTelegramClientManager,
  withTelegramClient,
} from './client-manager';
import { getGroupDialogsCached } from './dialog-cache';
import { listTelegramGroupChatMessages, sendTelegramGroupChatMessage } from './messages';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((innerResolve, innerReject) => {
    resolve = innerResolve;
    reject = innerReject;
  });
  return { promise, resolve, reject };
}

class FakeTelegramClient {
  connected = false;
  disconnected = true;
  connectCalls = 0;
  checkAuthorizationCalls = 0;
  disconnectCalls = 0;
  destroyCalls = 0;
  getDialogsCalls = 0;
  getMessagesCalls = 0;
  sendMessageCalls = 0;
  markAsReadCalls = 0;
  authorize = true;
  connectGate: ReturnType<typeof deferred<void>> | null = null;
  sendActive = 0;
  maxSendActive = 0;

  async connect() {
    this.connectCalls += 1;
    if (this.connectGate) await this.connectGate.promise;
    this.connected = true;
    this.disconnected = false;
    return true;
  }

  async checkAuthorization() {
    this.checkAuthorizationCalls += 1;
    return this.authorize;
  }

  async disconnect() {
    this.disconnectCalls += 1;
    this.connected = false;
    this.disconnected = true;
  }

  async destroy() {
    this.destroyCalls += 1;
    this.connected = false;
    this.disconnected = true;
  }

  async getDialogs() {
    this.getDialogsCalls += 1;
    return [{
      id: { toString: () => '123' },
      title: 'Test Group',
      name: 'Test Group',
      unreadCount: 0,
      isGroup: true,
      isChannel: false,
      date: 1_700_000_000,
      inputEntity: { _: 'inputPeerChannel', channelId: '123' },
      message: null,
    }];
  }

  async getMessages() {
    this.getMessagesCalls += 1;
    return [new Api.Message({ id: 7, message: 'hello', date: 1_700_000_001, out: false })];
  }

  async markAsRead() {
    this.markAsReadCalls += 1;
  }

  async sendMessage(_entity: unknown, options: { message: string; replyTo?: number }) {
    this.sendMessageCalls += 1;
    this.sendActive += 1;
    this.maxSendActive = Math.max(this.maxSendActive, this.sendActive);
    await new Promise((resolve) => setTimeout(resolve, 5));
    this.sendActive -= 1;
    return new Api.Message({ id: this.sendMessageCalls, message: options.message, date: 1_700_000_002, out: true, replyTo: options.replyTo ? new Api.MessageReplyHeader({ replyToMsgId: options.replyTo }) : undefined });
  }
}

afterEach(async () => {
  await resetTelegramClientManager('test-cleanup');
  __resetTelegramClientManagerForTests();
});

describe('telegram client manager', () => {
  it('reuses a connected authorized client without per-request disconnects', async () => {
    const fake = new FakeTelegramClient();
    __resetTelegramClientManagerForTests(() => fake as never);

    const first = await withTelegramClient({ operation: 'test.first' }, async (client) => client);
    const second = await withTelegramClient({ operation: 'test.second' }, async (client) => client);

    assert.equal(first, fake);
    assert.equal(second, fake);
    assert.equal(fake.connectCalls, 1);
    assert.equal(fake.checkAuthorizationCalls, 1);
    assert.equal(fake.disconnectCalls, 0);
    assert.equal(fake.destroyCalls, 0);
    assert.equal(getTelegramClientManagerHealth().state, 'ready');
  });

  it('coalesces concurrent initial connects into one connect and authorization check', async () => {
    const fake = new FakeTelegramClient();
    fake.connectGate = deferred<void>();
    __resetTelegramClientManagerForTests(() => fake as never);

    const calls = Promise.all([
      withTelegramClient({ operation: 'test.one' }, async (client) => client),
      withTelegramClient({ operation: 'test.two' }, async (client) => client),
      withTelegramClient({ operation: 'test.three' }, async (client) => client),
    ]);

    await new Promise((resolve) => setTimeout(resolve, 0));
    assert.equal(fake.connectCalls, 1);
    fake.connectGate.resolve();

    const clients = await calls;
    assert.deepEqual(clients, [fake, fake, fake]);
    assert.equal(fake.checkAuthorizationCalls, 1);
  });

  it('throws session-required and does not execute the operation when authorization fails', async () => {
    const fake = new FakeTelegramClient();
    fake.authorize = false;
    __resetTelegramClientManagerForTests(() => fake as never);

    await assert.rejects(
      withTelegramClient({ operation: 'test.unauthorized' }, async () => 'should-not-run'),
      /TELEGRAM_SESSION_REQUIRED/,
    );

    assert.equal(fake.connectCalls, 1);
    assert.equal(fake.checkAuthorizationCalls, 1);
    assert.equal(getTelegramClientManagerHealth().state, 'unauthorized');
  });

  it('resets by destroying the warm client and incrementing generation', async () => {
    const fake = new FakeTelegramClient();
    __resetTelegramClientManagerForTests(() => fake as never);

    await withTelegramClient({ operation: 'test.ready' }, async () => undefined);
    const before = getTelegramClientManagerHealth().generation;
    await resetTelegramClientManager('explicit-test');
    const after = getTelegramClientManagerHealth();

    assert.equal(fake.destroyCalls, 1);
    assert.equal(after.generation, before + 1);
    assert.equal(after.state, 'idle');
    assert.equal(after.hasClient, false);
  });

  it('serializes send-priority operations and does not retry failed sends', async () => {
    const fake = new FakeTelegramClient();
    __resetTelegramClientManagerForTests(() => fake as never);

    await Promise.all([
      withTelegramClient({ operation: 'send.one', priority: 'send' }, async (client) => {
        await (client as unknown as FakeTelegramClient).sendMessage({}, { message: 'one' });
      }),
      withTelegramClient({ operation: 'send.two', priority: 'send' }, async (client) => {
        await (client as unknown as FakeTelegramClient).sendMessage({}, { message: 'two' });
      }),
    ]);

    assert.equal(fake.sendMessageCalls, 2);
    assert.equal(fake.maxSendActive, 1);

    await assert.rejects(
      withTelegramClient({ operation: 'send.fail', priority: 'send' }, async () => {
        throw new Error('TIMEOUT');
      }),
      /TIMEOUT/,
    );
    assert.equal(fake.sendMessageCalls, 2);
  });
});

describe('telegram dialog cache and helpers', () => {
  it('coalesces concurrent dialog lookups', async () => {
    const fake = new FakeTelegramClient();
    __resetTelegramClientManagerForTests(() => fake as never);

    await withTelegramClient({ operation: 'test.dialog-cache' }, async (client) => {
      const [first, second] = await Promise.all([
        getGroupDialogsCached(client),
        getGroupDialogsCached(client),
      ]);
      assert.equal(first[0], second[0]);
    });

    assert.equal(fake.getDialogsCalls, 1);
  });

  it('uses the warm manager path for message list and send helpers without disconnecting', async () => {
    const fake = new FakeTelegramClient();
    __resetTelegramClientManagerForTests(() => fake as never);

    const messages = await listTelegramGroupChatMessages('123');
    const sent = await sendTelegramGroupChatMessage('123', ' reply ', 7);

    assert.equal(messages.length, 1);
    assert.equal(messages[0].text, 'hello');
    assert.equal(sent.text, 'reply');
    assert.equal(sent.replyToMessageId, 7);
    assert.equal(fake.connectCalls, 1);
    assert.equal(fake.getDialogsCalls, 1);
    assert.equal(fake.disconnectCalls, 0);
  });
});
