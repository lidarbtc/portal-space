package main

import (
	"encoding/json"
	"regexp"
	"strings"
	"unicode"
)

type MsgType string

const (
	MsgJoin         MsgType = "join"
	MsgLeave        MsgType = "leave"
	MsgMove         MsgType = "move"
	MsgStatus       MsgType = "status"
	MsgChat         MsgType = "chat"
	MsgEmote        MsgType = "emote"
	MsgProfile      MsgType = "profile"
	MsgCustomStatus MsgType = "customStatus"
	MsgDash         MsgType = "dash"
	MsgSnapshot     MsgType = "snapshot"
	MsgError        MsgType = "error"
	MsgAction       MsgType = "action"
)

// ActionMessage is the envelope for feature-specific messages.
type ActionMessage struct {
	Domain   string          `json:"domain"`
	Action   string          `json:"action"`
	ObjectID string          `json:"objectId,omitempty"`
	Payload  json.RawMessage `json:"payload,omitempty"`
}

const (
	proximityRadius      = 5.0
	maxPlayers           = 20
	moveRateLimit        = 10
	emoteRateLimit       = 2
	profileCooldown      = 2
	customStatusCooldown = 2
	settingsCooldown     = 2

	// Regional chat zone radius bounds (in pixels)
	defaultZoneRadius = 160.0 // 5 tiles
	maxZoneRadius     = 320.0 // 10 tiles
	minZoneRadius     = 64.0  // 2 tiles

	// Action domains and actions
	DomainRegionalChat   = "regional_chat"
	ActionUpdateSettings = "update_settings"
)

// RegionalChatState is the per-object state for regional chat zones.
type RegionalChatState struct {
	Name          string  `json:"name"`
	Radius        float64 `json:"radius"`
	RetainHistory bool    `json:"retainHistory"`
}

// Client → Server messages

type IncomingMessage struct {
	Type         MsgType         `json:"type"`
	Nickname     string          `json:"nickname,omitempty"`
	X            float64         `json:"x"`
	Y            float64         `json:"y"`
	Dir          string          `json:"dir,omitempty"`
	Status       string          `json:"status,omitempty"`
	Text         string          `json:"text,omitempty"`
	Avatar       int             `json:"avatar"`
	Colors       *ColorPalette   `json:"colors,omitempty"`
	Emoji        string          `json:"emoji,omitempty"`
	CustomStatus string          `json:"customStatus,omitempty"`
	Reconnect    bool            `json:"reconnect,omitempty"`
	Payload      json.RawMessage `json:"payload,omitempty"`
}

// Server → Client messages

type OutgoingMessage struct {
	Type          MsgType              `json:"type"`
	ID            string               `json:"id,omitempty"`
	Nickname      string               `json:"nickname,omitempty"`
	X             float64              `json:"x"`
	Y             float64              `json:"y"`
	Dir           string               `json:"dir,omitempty"`
	Status        string               `json:"status,omitempty"`
	Text          string               `json:"text,omitempty"`
	Message       string               `json:"message,omitempty"`
	Emoji         string               `json:"emoji,omitempty"`
	CustomStatus  string               `json:"customStatus,omitempty"`
	Player        *PlayerInfo          `json:"player,omitempty"`
	Players       []*PlayerInfo        `json:"players,omitempty"`
	Self          *PlayerInfo          `json:"self,omitempty"`
	Reconnect     bool                 `json:"reconnect,omitempty"`
	Objects       []*InteractiveObject `json:"objects,omitempty"`
	ActionPayload json.RawMessage      `json:"actionPayload,omitempty"`
	ZoneID        string               `json:"zoneId,omitempty"`
	ZoneName      string               `json:"zoneName,omitempty"`
	ZoneEvent     string               `json:"zoneEvent,omitempty"` // "enter" or "exit"
	IsSystem      bool                 `json:"isSystem,omitempty"`
}

type ColorPalette struct {
	Body string `json:"body"`
	Eye  string `json:"eye"`
	Foot string `json:"foot"`
}

type PlayerInfo struct {
	ID           string        `json:"id"`
	Nickname     string        `json:"nickname"`
	X            float64       `json:"x"`
	Y            float64       `json:"y"`
	Status       string        `json:"status"`
	Dir          string        `json:"dir"`
	Avatar       int           `json:"avatar"`
	Colors       *ColorPalette `json:"colors,omitempty"`
	CustomStatus string        `json:"customStatus,omitempty"`
}

// Validation

const (
	maxNicknameLen     = 20
	maxChatLen         = 500
	maxCustomStatusLen = 20
	mapWidth           = 60
	mapHeight          = 45
)

var validStatuses = map[string]bool{
	"online": true,
	"away":   true,
	"dnd":    true,
}

var validDirections = map[string]bool{
	"up":    true,
	"down":  true,
	"left":  true,
	"right": true,
}

func sanitizeString(s string, maxLen int) string {
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && r != '\n' {
			return -1
		}
		switch r {
		case '\u200B', '\u200C', '\u200D', '\uFEFF', '\u00AD', '\u2060', '\u180E',
			'\u200E', '\u200F', '\u202A', '\u202B', '\u202C', '\u202D', '\u202E',
			'\u2066', '\u2067', '\u2068', '\u2069', '\u00A0':
			return -1
		}
		if unicode.In(r, unicode.Zs) && r != ' ' {
			return -1
		}
		return r
	}, s)
	s = strings.TrimSpace(s)
	if len([]rune(s)) > maxLen {
		s = string([]rune(s)[:maxLen])
	}
	return s
}

func sanitizeNickname(s string) string {
	return sanitizeString(s, maxNicknameLen)
}

func sanitizeChat(s string) string {
	return sanitizeString(s, maxChatLen)
}

const (
	mapPixelWidth  = mapWidth * 32
	mapPixelHeight = mapHeight * 32
)

func validateMove(x, y float64) bool {
	return x >= 0 && x < float64(mapPixelWidth) && y >= 0 && y < float64(mapPixelHeight)
}

func validateStatus(s string) bool {
	return validStatuses[s]
}

func validateDirection(d string) bool {
	return validDirections[d]
}

const maxAvatars = 4

func validateAvatar(a int) bool {
	return a >= 0 && a < maxAvatars
}

var validEmojis = map[string]bool{
	"👋": true, "☕": true, "🔥": true, "💻": true, "📢": true,
}

func validateEmoji(e string) bool {
	return validEmojis[e]
}

var hexColorRe = regexp.MustCompile(`^#[0-9a-fA-F]{6}$`)

func validateHexColor(c string) bool {
	return hexColorRe.MatchString(c)
}

func validateColors(cp *ColorPalette) bool {
	if cp == nil {
		return false
	}
	return validateHexColor(cp.Body) && validateHexColor(cp.Eye) && validateHexColor(cp.Foot)
}
