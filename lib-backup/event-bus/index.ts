// Internal event bus — lightweight publish/subscribe for intra-process
// communication inside the worker. Decouples processors from each other
// without introducing another external dependency.
//
// Usage:
//   import { eventBus } from "@/lib/event-bus"
//   eventBus.emit("message:stored", { conversationId, messageId, ... })
//   eventBus.on("message:stored", (payload) => { ... })

import { EventEmitter } from "events";

// ─── Event catalog ────────────────────────────────────────────────────────────

export interface EventMap {
  // Fired after a message is written to the DB — triggers automation
  "message:stored": {
    instanceName: string;
    userId: string;
    conversationId: string;
    contactId: string | null;
    phone: string;
    incomingText: string;
    isFirstMessage: boolean;
    serverUrl: string;
    instanceApiKey: string;
  };

  // Fired after an outbound message is successfully sent
  "message:sent": {
    instanceName: string;
    conversationId: string;
    externalId: string;
    phone: string;
  };

  // Fired when an instance connects or disconnects
  "connection:changed": {
    instanceName: string;
    state: "open" | "close" | "connecting";
    userId?: string;
  };

  // Fired when media upload is complete
  "media:uploaded": {
    messageId: string;
    publicUrl: string;
  };

  // Worker-level error (caught but non-fatal)
  "worker:error": {
    queue: string;
    jobId: string;
    error: string;
  };
}

// ─── Typed emitter ────────────────────────────────────────────────────────────

class TypedEventBus extends EventEmitter {
  emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): boolean {
    return super.emit(event, payload);
  }

  on<K extends keyof EventMap>(
    event: K,
    listener: (payload: EventMap[K]) => void
  ): this {
    return super.on(event, listener);
  }

  once<K extends keyof EventMap>(
    event: K,
    listener: (payload: EventMap[K]) => void
  ): this {
    return super.once(event, listener);
  }

  off<K extends keyof EventMap>(
    event: K,
    listener: (payload: EventMap[K]) => void
  ): this {
    return super.off(event, listener);
  }
}

export const eventBus = new TypedEventBus();
eventBus.setMaxListeners(50); // support many concurrent subscribers
