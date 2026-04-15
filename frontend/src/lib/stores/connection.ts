import { writable } from 'svelte/store'

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

export const connectionState = writable<ConnectionState>('disconnected')
