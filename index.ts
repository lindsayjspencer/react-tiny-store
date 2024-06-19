import { useCallback, useEffect, useState } from 'react';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type StateTree = Record<string | number | symbol, any>;

export interface StoreOptions<State extends StateTree> {
	equalityFn?: <Key extends keyof State>(oldValue: State[Key], newValue: State[Key], key: Key) => boolean;
	batchUpdates?: boolean;
}

const defaultOptions: Required<StoreOptions<StateTree>> = {
	equalityFn: (oldValue, newValue) => oldValue === newValue,
	batchUpdates: false,
};

export default class Store<State extends StateTree> {
	protected state: State;
	private newState: Map<keyof State, State[keyof State]> = new Map();
	private awaitingUpdate = false;
	protected options = defaultOptions;

	constructor(defaultValues: State, options?: StoreOptions<State>) {
		this.state = defaultValues;
		this.options = { ...this.options, ...options };
	}

	private callbacks: Map<keyof State, Set<(newValue: State[keyof State]) => void>> = new Map();

	protected on(key: keyof State, callback: (newValue: State[keyof State]) => void) {
		const existingCallbacks = this.callbacks.get(key);
		if (existingCallbacks) {
			existingCallbacks.add(callback);
		} else {
			this.callbacks.set(key, new Set([callback]));
		}
	}

	protected off(key: keyof State, callback: (newValue: State[keyof State]) => void) {
		const existingCallbacks = this.callbacks.get(key);
		if (existingCallbacks) {
			existingCallbacks.delete(callback);
		}
	}

	public getState<Key extends keyof State>(key: Key) {
		// eslint-disable-next-line @typescript-eslint/no-unsafe-return
		return this.state[key];
	}

	private _setState<Key extends keyof State>(key: Key, newValue: State[Key]) {
		// determine equality and skip if equal
		const oldValue = this.state[key];
		if (this.options.equalityFn(oldValue, newValue, key)) {
			return;
		}
		this.state[key] = newValue;
		const existingCallbacks = this.callbacks.get(key);
		if (existingCallbacks) {
			existingCallbacks.forEach((callback) => callback(newValue));
		}
	}

	public setState<Key extends keyof State>(key: Key, newValue: State[Key]) {
		if (this.options.batchUpdates) {
			this.newState.set(key, newValue);
			if (!this.awaitingUpdate) {
				this.awaitingUpdate = true;
				requestAnimationFrame(() => {
					this.processNewState();
					this.awaitingUpdate = false;
				});
			}
		} else {
			this._setState(key, newValue);
		}
	}

	private processNewState() {
		this.newState.forEach((newValue, key) => {
			this._setState(key, newValue);
		});
		this.newState.clear();
	}

	public subscribe<Key extends keyof State>(key: Key, callback: (newValue: State[keyof State]) => void) {
		this.on(key, callback);
		return () => this.off(key, callback);
	}
}

export function useStoreValue<State extends StateTree, Key extends keyof State>(
	store: Store<State>,
	key: Key,
): State[Key];
export function useStoreValue<State extends StateTree, Key extends keyof State>(
	store: Store<State> | null,
	key: Key,
): State[Key] | null;
export function useStoreValue<State extends StateTree, Key extends keyof State>(store: Store<State> | null, key: Key) {
	const [state, setState] = useState(store?.getState(key) ?? null);

	useEffect(() => {
		if (!store) return;
		const unsubscribe = store.subscribe(key, setState);
		return () => unsubscribe();
	}, [store, key]);

	// eslint-disable-next-line @typescript-eslint/no-unsafe-return
	return state;
}

export function useStoreUpdate<State extends StateTree, Key extends keyof State>(
	store: Store<State>,
	key: Key,
): (newValue: State[Key]) => void;
export function useStoreUpdate<State extends StateTree, Key extends keyof State>(
	store: Store<State> | null,
	key: Key,
): (newValue: State[Key]) => void;
export function useStoreUpdate<State extends StateTree, Key extends keyof State>(store: Store<State> | null, key: Key) {
	return useCallback(
		(newValue: State[Key]) => {
			if (!store) return;
			store.setState(key, newValue);
		},
		[store, key],
	);
}

export function useStoreState<State extends StateTree, Key extends keyof State>(
	store: Store<State>,
	key: Key,
): [State[Key], (newValue: State[Key]) => void];
export function useStoreState<State extends StateTree, Key extends keyof State>(
	store: Store<State> | null,
	key: Key,
): [State[Key] | null, (newValue: State[Key]) => void];
export function useStoreState<State extends StateTree, Key extends keyof State>(store: Store<State> | null, key: Key) {
	const state = useStoreValue(store, key);
	const updateState = useStoreUpdate(store, key);

	return [state, updateState] as const;
}
