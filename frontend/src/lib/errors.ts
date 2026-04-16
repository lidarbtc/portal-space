/**
 * Tagged error types for the network layer.
 * All network errors use _tag for exhaustive matching at Effect.runPromise boundaries.
 */

export class WebSocketError {
	readonly _tag = 'WebSocketError' as const
	constructor(readonly message: string = 'WebSocket connection failed') {}
}

export class ConnectionTimeoutError {
	readonly _tag = 'ConnectionTimeoutError' as const
	constructor(readonly timeoutMs: number = 5000) {}
}

export class ReconnectionFailedError {
	readonly _tag = 'ReconnectionFailedError' as const
	constructor(readonly message: string = 'Reconnection failed after max elapsed time') {}
}

export class MessageSendError {
	readonly _tag = 'MessageSendError' as const
	constructor(readonly message: string = 'WebSocket not connected') {}
}

export type NetworkError =
	| WebSocketError
	| ConnectionTimeoutError
	| ReconnectionFailedError
	| MessageSendError
