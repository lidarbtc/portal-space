export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting'

class ConnectionStore {
	state = $state<ConnectionState>('disconnected')
}

export const connectionState = new ConnectionStore()
