// Base dos controllers: guarda um estado e avisa as views (React) quando ele muda.
import { useSyncExternalStore } from 'react';

export class Store {
  constructor(state) {
    this.state = state;
    this.listeners = new Set();
    this.subscribe = this.subscribe.bind(this);
    this.getState = this.getState.bind(this);
  }
  getState() { return this.state; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  set(patch) {
    const next = { ...this.state, ...(typeof patch === 'function' ? patch(this.state) : patch) };
    if (Object.keys(next).every(k => next[k] === this.state[k])) return;
    this.state = next;
    for (const fn of this.listeners) fn();
  }
}

/** Liga uma view ao estado de um controller */
export const useStore = store => useSyncExternalStore(store.subscribe, store.getState);
