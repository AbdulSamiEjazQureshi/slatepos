import type { RealtimeEvent } from '@roms/contracts/events';

type Subscriber = (event: RealtimeEvent) => void;

/**
 * In-process pub/sub used by the WebSocket endpoint. Each subscriber is scoped
 * to a topic (branch or user) so events are only fanned out to interested
 * clients. When running multiple API instances this would be backed by Redis
 * pub/sub, but the interface stays the same.
 */
export type RealtimeHub = {
  subscribe: (topic: string, subscriber: Subscriber) => () => void;
  publish: (topic: string, event: RealtimeEvent) => void;
  topics: () => string[];
};

export const createRealtimeHub = (): RealtimeHub => {
  const topics = new Map<string, Set<Subscriber>>();

  return {
    subscribe(topic, subscriber) {
      const set = topics.get(topic) ?? new Set<Subscriber>();
      set.add(subscriber);
      topics.set(topic, set);
      return () => {
        set.delete(subscriber);
        if (set.size === 0) topics.delete(topic);
      };
    },
    publish(topic, event) {
      const set = topics.get(topic);
      if (!set) return;
      for (const subscriber of set) subscriber(event);
    },
    topics() {
      return [...topics.keys()];
    }
  };
};
