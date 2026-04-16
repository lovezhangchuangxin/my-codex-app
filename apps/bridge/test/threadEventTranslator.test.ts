import assert from 'node:assert/strict';
import test from 'node:test';

import type { CommandApprovalDecision } from '@my-codex-app/protocol';

import { ThreadEventTranslator } from '../src/threads/threadEventTranslator';
import { ThreadRuntimeCache } from '../src/threads/threadRuntimeCache';

test('ThreadEventTranslator parses richer command approval request fields', () => {
  const translator = new ThreadEventTranslator(new ThreadRuntimeCache());
  const event = translator.toRequestBridgeEvent({
    id: 42,
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-1',
      approvalId: 'approval-1',
      reason: 'Needs network',
      command: 'curl https://example.com',
      cwd: '/tmp/project',
      commandActions: [
        {
          type: 'read',
          command: 'cat README.md',
          name: 'README',
          path: '/tmp/project/README.md',
        },
        {
          type: 'unknown',
          command: 'custom-op',
        },
      ],
      additionalPermissions: {
        network: { enabled: true },
        fileSystem: {
          read: ['/tmp/project/README.md'],
        },
      },
      networkApprovalContext: {
        host: 'example.com',
        protocol: 'https',
      },
      proposedExecpolicyAmendment: {
        command: ['curl', 'https://example.com'],
      },
      proposedNetworkPolicyAmendments: [
        {
          host: 'example.com',
          action: 'allow',
        },
      ],
      availableDecisions: [
        'accept',
        {
          acceptWithExecpolicyAmendment: {
            execpolicy_amendment: { command: ['curl', 'https://example.com'] },
          },
        },
        {
          applyNetworkPolicyAmendment: {
            network_policy_amendment: {
              host: 'example.com',
              action: 'allow',
            },
          },
        },
        'cancel',
      ],
    },
  });

  assert.ok(event && event.type === 'pendingRequestAdded');
  assert.equal(event.request.kind, 'command');
  assert.equal(event.request.requestId, 42);
  assert.equal(event.request.threadId, 'thread-1');
  assert.equal(event.request.turnId, 'turn-1');
  assert.equal(event.request.itemId, 'item-1');
  assert.equal(event.request.approvalId, 'approval-1');
  assert.equal(event.request.reason, 'Needs network');
  assert.equal(event.request.command, 'curl https://example.com');
  assert.equal(event.request.cwd, '/tmp/project');
  assert.deepEqual(event.request.commandActions, [
    {
      type: 'read',
      command: 'cat README.md',
      name: 'README',
      path: '/tmp/project/README.md',
    },
    {
      type: 'unknown',
      command: 'custom-op',
    },
  ]);
  assert.deepEqual(event.request.additionalPermissions, {
    network: { enabled: true },
    fileSystem: { read: ['/tmp/project/README.md'] },
  });
  assert.deepEqual(event.request.networkApprovalContext, {
    host: 'example.com',
    protocol: 'https',
  });
  assert.deepEqual(event.request.proposedExecpolicyAmendment, {
    command: ['curl', 'https://example.com'],
  });
  assert.deepEqual(event.request.proposedNetworkPolicyAmendments, [
    { host: 'example.com', action: 'allow' },
  ]);
  assert.deepEqual(event.request.availableDecisions, [
    'accept',
    {
      acceptWithExecpolicyAmendment: {
        execpolicy_amendment: { command: ['curl', 'https://example.com'] },
      },
    },
    {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: {
          host: 'example.com',
          action: 'allow',
        },
      },
    },
    'cancel',
  ]);
});

test('ThreadEventTranslator maps v2 and legacy command approval decisions', () => {
  const translator = new ThreadEventTranslator(new ThreadRuntimeCache());

  const structuredDecision: CommandApprovalDecision = {
    acceptWithExecpolicyAmendment: {
      execpolicy_amendment: { command: ['npm', 'test'] },
    },
  };
  translator.toRequestBridgeEvent({
    id: 'v2',
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-1',
    },
  });
  assert.deepEqual(
    translator.toAppServerCommandDecision('v2', structuredDecision),
    structuredDecision,
  );

  translator.toRequestBridgeEvent({
    id: 'legacy',
    method: 'execCommandApproval',
    params: {
      conversationId: 'thread-legacy',
      callId: 'call-legacy',
    },
  });
  assert.equal(
    translator.toAppServerCommandDecision('legacy', 'accept'),
    'approved',
  );
  assert.equal(
    translator.toAppServerCommandDecision('legacy', 'acceptForSession'),
    'approved_for_session',
  );
  assert.equal(
    translator.toAppServerCommandDecision('legacy', 'decline'),
    'denied',
  );
  assert.equal(
    translator.toAppServerCommandDecision('legacy', 'cancel'),
    'abort',
  );
  assert.deepEqual(
    translator.toAppServerCommandDecision('legacy', structuredDecision),
    {
      approved_execpolicy_amendment: {
        proposed_execpolicy_amendment: ['npm', 'test'],
      },
    },
  );
  assert.deepEqual(
    translator.toAppServerCommandDecision('legacy', {
      applyNetworkPolicyAmendment: {
        network_policy_amendment: {
          host: 'example.com',
          action: 'allow',
        },
      },
    }),
    {
      network_policy_amendment: {
        network_policy_amendment: {
          host: 'example.com',
          action: 'allow',
        },
      },
    },
  );
});

test('ThreadEventTranslator maps reasoning delta notifications', () => {
  const translator = new ThreadEventTranslator(new ThreadRuntimeCache());

  const summaryPartEvent = translator.toNotificationBridgeEvent(
    'item/reasoning/summaryPartAdded',
    {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'reasoning-1',
      summaryIndex: 0,
    },
  );
  assert.deepEqual(summaryPartEvent, {
    type: 'reasoningSummaryPartAdded',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'reasoning-1',
    summaryIndex: 0,
  });

  const summaryTextEvent = translator.toNotificationBridgeEvent(
    'item/reasoning/summaryTextDelta',
    {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'reasoning-1',
      summaryIndex: 1,
      delta: 'thinking...',
    },
  );
  assert.deepEqual(summaryTextEvent, {
    type: 'reasoningSummaryTextDelta',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'reasoning-1',
    summaryIndex: 1,
    delta: 'thinking...',
  });

  const textEvent = translator.toNotificationBridgeEvent(
    'item/reasoning/textDelta',
    {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'reasoning-1',
      contentIndex: 2,
      delta: 'raw token',
    },
  );
  assert.deepEqual(textEvent, {
    type: 'reasoningTextDelta',
    threadId: 'thread-1',
    turnId: 'turn-1',
    itemId: 'reasoning-1',
    contentIndex: 2,
    delta: 'raw token',
  });

  const invalidNegative = translator.toNotificationBridgeEvent(
    'item/reasoning/summaryPartAdded',
    {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'reasoning-1',
      summaryIndex: -1,
    },
  );
  assert.equal(invalidNegative, null);

  const invalidFraction = translator.toNotificationBridgeEvent(
    'item/reasoning/textDelta',
    {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'reasoning-1',
      contentIndex: 1.5,
      delta: 'bad',
    },
  );
  assert.equal(invalidFraction, null);
});

test('ThreadEventTranslator omits availableDecisions when raw list is unparseable', () => {
  const translator = new ThreadEventTranslator(new ThreadRuntimeCache());
  const event = translator.toRequestBridgeEvent({
    id: 99,
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-1',
      availableDecisions: [{ unknownFutureDecision: { value: true } }],
    },
  });

  assert.ok(event && event.type === 'pendingRequestAdded');
  assert.equal(event.request.kind, 'command');
  assert.equal('availableDecisions' in event.request, false);

  const explicitEmpty = translator.toRequestBridgeEvent({
    id: 100,
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-2',
      availableDecisions: [],
    },
  });
  assert.ok(explicitEmpty && explicitEmpty.type === 'pendingRequestAdded');
  assert.equal(explicitEmpty.request.kind, 'command');
  assert.deepEqual(explicitEmpty.request.availableDecisions, []);

  const explicitNull = translator.toRequestBridgeEvent({
    id: 101,
    method: 'item/commandExecution/requestApproval',
    params: {
      threadId: 'thread-1',
      turnId: 'turn-1',
      itemId: 'item-3',
      availableDecisions: null,
    },
  });
  assert.ok(explicitNull && explicitNull.type === 'pendingRequestAdded');
  assert.equal(explicitNull.request.kind, 'command');
  assert.equal('availableDecisions' in explicitNull.request, false);
});
