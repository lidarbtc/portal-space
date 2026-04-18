/**
 * Effect Schema definitions for WebSocket messages.
 * Validates incoming server messages at runtime.
 *
 * Based on Go protocol.go OutgoingMessage struct.
 * Note: Go's json marshaling means x/y are always present (no omitempty),
 * while most other fields use omitempty and may be absent.
 */
import { Schema } from 'effect'

// --- Primitive schemas ---

const DirectionSchema = Schema.Literal('up', 'down', 'left', 'right')

const Facing8Schema = Schema.Literal(
	'up',
	'down',
	'left',
	'right',
	'up-left',
	'up-right',
	'down-left',
	'down-right',
)

const PlayerStatusSchema = Schema.Literal('online', 'away', 'dnd')

const EmojiSchema = Schema.Literal('👋', '☕', '🔥', '💻', '📢')

const ZoneEventSchema = Schema.Literal('enter', 'exit')

// --- Nested object schemas ---

export const ChatImageSchema = Schema.Struct({
	mime: Schema.String,
	data: Schema.String,
	size: Schema.Number,
	name: Schema.optional(Schema.String),
})

export const ColorPaletteSchema = Schema.Struct({
	body: Schema.String,
	eye: Schema.String,
	foot: Schema.String,
})

export const PlayerInfoSchema = Schema.Struct({
	id: Schema.String,
	nickname: Schema.String,
	x: Schema.Number,
	y: Schema.Number,
	status: PlayerStatusSchema,
	dir: DirectionSchema,
	avatar: Schema.Number,
	colors: Schema.optional(ColorPaletteSchema),
	customStatus: Schema.optional(Schema.String),
})

export const InteractiveObjectSchema = Schema.Struct({
	id: Schema.String,
	type: Schema.String,
	x: Schema.Number,
	y: Schema.Number,
	state: Schema.optional(Schema.Unknown),
	ownerId: Schema.optional(Schema.String),
	placedAt: Schema.optional(Schema.Number),
})

export const ActionMessageSchema = Schema.Struct({
	domain: Schema.String,
	action: Schema.String,
	objectId: Schema.optional(Schema.String),
	senderId: Schema.optional(Schema.String),
	payload: Schema.optional(Schema.Unknown),
	snapshot: Schema.optional(Schema.Unknown),
	strokes: Schema.optional(Schema.Array(Schema.Unknown)),
})

// --- Per-variant message schemas ---

const BaseFields = {
	x: Schema.Number,
	y: Schema.Number,
}

export const JoinMessageSchema = Schema.Struct({
	type: Schema.Literal('join'),
	...BaseFields,
	id: Schema.optional(Schema.String),
	nickname: Schema.optional(Schema.String),
	dir: Schema.optional(DirectionSchema),
	status: Schema.optional(PlayerStatusSchema),
	player: Schema.optional(PlayerInfoSchema),
	colors: Schema.optional(ColorPaletteSchema),
})

export const LeaveMessageSchema = Schema.Struct({
	type: Schema.Literal('leave'),
	...BaseFields,
	id: Schema.optional(Schema.String),
})

export const MoveMessageSchema = Schema.Struct({
	type: Schema.Literal('move'),
	...BaseFields,
	id: Schema.optional(Schema.String),
	dir: Schema.optional(DirectionSchema),
	facing8: Schema.optional(Facing8Schema),
})

export const DashMessageSchema = Schema.Struct({
	type: Schema.Literal('dash'),
	...BaseFields,
	id: Schema.optional(Schema.String),
	dir: Schema.optional(DirectionSchema),
	facing8: Schema.optional(Facing8Schema),
})

export const StatusMessageSchema = Schema.Struct({
	type: Schema.Literal('status'),
	...BaseFields,
	id: Schema.optional(Schema.String),
	status: Schema.optional(PlayerStatusSchema),
})

export const ChatMessageSchema = Schema.Struct({
	type: Schema.Literal('chat'),
	...BaseFields,
	id: Schema.optional(Schema.String),
	nickname: Schema.optional(Schema.String),
	text: Schema.optional(Schema.String),
	image: Schema.optional(ChatImageSchema),
	isSystem: Schema.optional(Schema.Boolean),
	zoneId: Schema.optional(Schema.String),
	zoneName: Schema.optional(Schema.String),
	zoneEvent: Schema.optional(ZoneEventSchema),
})

export const EmoteMessageSchema = Schema.Struct({
	type: Schema.Literal('emote'),
	...BaseFields,
	id: Schema.optional(Schema.String),
	emoji: Schema.optional(EmojiSchema),
})

export const ProfileMessageSchema = Schema.Struct({
	type: Schema.Literal('profile'),
	...BaseFields,
	id: Schema.optional(Schema.String),
	nickname: Schema.optional(Schema.String),
	colors: Schema.optional(ColorPaletteSchema),
	player: Schema.optional(PlayerInfoSchema),
})

export const CustomStatusMessageSchema = Schema.Struct({
	type: Schema.Literal('customStatus'),
	...BaseFields,
	id: Schema.optional(Schema.String),
	customStatus: Schema.optional(Schema.String),
})

export const SnapshotMessageSchema = Schema.Struct({
	type: Schema.Literal('snapshot'),
	...BaseFields,
	players: Schema.optional(Schema.Array(PlayerInfoSchema)),
	self: Schema.optional(PlayerInfoSchema),
	reconnect: Schema.optional(Schema.Boolean),
	objects: Schema.optional(Schema.Array(InteractiveObjectSchema)),
})

export const ErrorMessageSchema = Schema.Struct({
	type: Schema.Literal('error'),
	...BaseFields,
	message: Schema.optional(Schema.String),
})

export const ActionPayloadMessageSchema = Schema.Struct({
	type: Schema.Literal('action'),
	...BaseFields,
	actionPayload: Schema.optional(ActionMessageSchema),
	zoneId: Schema.optional(Schema.String),
	zoneName: Schema.optional(Schema.String),
	zoneEvent: Schema.optional(ZoneEventSchema),
})

export const ObjectAddMessageSchema = Schema.Struct({
	type: Schema.Literal('object_add'),
	...BaseFields,
	object: InteractiveObjectSchema,
})

export const ObjectRemoveMessageSchema = Schema.Struct({
	type: Schema.Literal('object_remove'),
	...BaseFields,
	objectId: Schema.String,
})

// --- Discriminated union ---

export const OutgoingMessageSchema = Schema.Union(
	JoinMessageSchema,
	LeaveMessageSchema,
	MoveMessageSchema,
	DashMessageSchema,
	StatusMessageSchema,
	ChatMessageSchema,
	EmoteMessageSchema,
	ProfileMessageSchema,
	CustomStatusMessageSchema,
	SnapshotMessageSchema,
	ErrorMessageSchema,
	ActionPayloadMessageSchema,
	ObjectAddMessageSchema,
	ObjectRemoveMessageSchema,
)

export type OutgoingMessageDecoded = typeof OutgoingMessageSchema.Type

// --- Error type ---

export class MessageDecodeError {
	readonly _tag = 'MessageDecodeError' as const
	constructor(
		readonly raw: unknown,
		readonly error: string,
	) {}
}

// --- Decode helper ---

const decodeOutgoingMessage = Schema.decodeUnknownEither(OutgoingMessageSchema)

export function parseOutgoingMessage(
	data: unknown,
): { _tag: 'ok'; message: OutgoingMessageDecoded } | { _tag: 'error'; error: MessageDecodeError } {
	const result = decodeOutgoingMessage(data)
	if (result._tag === 'Right') {
		return { _tag: 'ok', message: result.right }
	}
	const errorStr = JSON.stringify(result.left, null, 2)
	return { _tag: 'error', error: new MessageDecodeError(data, errorStr) }
}
