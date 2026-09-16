'use client';

import * as React from 'react';

import type { RoutingIntent } from './routingQueue';
import { PendingIntentsContext, RoutingQueueApiContext } from './routingQueueContext';

type Props = {
  processIntent: (intent: RoutingIntent) => void;
};

export function RoutingQueueDrainer({ processIntent }: Props) {
  const intents = React.use(PendingIntentsContext);
  const { dequeue, startTransition } = React.use(RoutingQueueApiContext)!;
  const processed = React.useRef(new WeakSet<RoutingIntent>());

  React.useEffect(() => {
    let index = 0;
    if (intents[0] && processed.current.has(intents[0])) {
      // A browser traversal or cancellation must be able to supersede a destination
      // that has not committed (for example, an async route still loading).
      index = intents.findIndex(
        (intent) => !processed.current.has(intent) && interruptsPendingNavigation(intent)
      );
    }
    const intent = intents[index];
    if (!intent) {
      return;
    }
    // Protect both Strict Mode effect replay and urgent enqueues during a transition.
    processed.current.add(intent);
    startTransition(() => {
      // Commit one destination at a time so its navigator registers before the next
      // href is resolved. Otherwise two pushes into an unmounted stack both reach
      // its parent router, which replaces the first push's nested state.
      try {
        processIntent(intent);
      } catch (error) {
        const message =
          typeof error === 'object' && error != null && 'message' in error ? error.message : error;
        console.warn(
          `An error occurred when trying to handle navigation action ${JSON.stringify(intent)}: ${message}`
        );
      }
      // Dequeue in the same transition: the next intent becomes available only once
      // the destination commits, including its layout effects that register routers.
      dequeue(intents.slice(0, index + 1));
    });
  }, [dequeue, intents, processIntent, startTransition]);

  return null;
}

function interruptsPendingNavigation(intent: RoutingIntent): boolean {
  if (intent.type === 'BROWSER_HISTORY_CHANGED') return true;
  const actionType =
    intent.type === 'ACTION'
      ? intent.payload.action.type
      : intent.type === 'NAVIGATE_TO_HREF'
        ? intent.payload.options.event
        : undefined;
  return (
    actionType === 'GO_BACK' ||
    actionType === 'REPLACE' ||
    actionType === 'RESET' ||
    actionType === 'POP' ||
    actionType === 'POP_TO' ||
    actionType === 'POP_TO_TOP'
  );
}
