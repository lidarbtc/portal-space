package main

import (
	"strings"
	"unicode"
)

type MsgType string

const (
	MsgJoin     MsgType = "join"
	MsgLeave    MsgType = "leave"
	MsgMove     MsgType = "move"
	MsgStatus   MsgType = "status"
	MsgChat     MsgType = "chat"
	MsgEmote    MsgType = "emote"
	MsgSnapshot MsgType = "snapshot"
	MsgError    MsgType = "error"
)

// Client → Server messages

type IncomingMessage struct {
	Type      MsgType `json:"type"`
	Nickname  string  `json:"nickname,omitempty"`
	X         float64 `json:"x"`
	Y         float64 `json:"y"`
	Dir       string  `json:"dir,omitempty"`
	Status    string  `json:"status,omitempty"`
	Text      string  `json:"text,omitempty"`
	Avatar    int     `json:"avatar"`
	Emoji     string  `json:"emoji,omitempty"`
	Reconnect bool    `json:"reconnect,omitempty"`
}

// Server → Client messages

type OutgoingMessage struct {
	Type     MsgType       `json:"type"`
	ID       string        `json:"id,omitempty"`
	Nickname string        `json:"nickname,omitempty"`
	X        float64       `json:"x"`
	Y        float64       `json:"y"`
	Dir      string        `json:"dir,omitempty"`
	Status   string        `json:"status,omitempty"`
	Text     string        `json:"text,omitempty"`
	Message  string        `json:"message,omitempty"`
	Emoji    string        `json:"emoji,omitempty"`
	Player    *PlayerInfo   `json:"player,omitempty"`
	Players   []*PlayerInfo `json:"players,omitempty"`
	Self      *PlayerInfo   `json:"self,omitempty"`
	Reconnect bool          `json:"reconnect,omitempty"`
}

type PlayerInfo struct {
	ID       string  `json:"id"`
	Nickname string  `json:"nickname"`
	X        float64 `json:"x"`
	Y        float64 `json:"y"`
	Status   string  `json:"status"`
	Dir      string  `json:"dir"`
	Avatar   int     `json:"avatar"`
}

// Validation

const (
	maxNicknameLen = 20
	maxChatLen     = 500
	mapWidth       = 60
	mapHeight      = 45
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
	// Remove control characters
	s = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) && r != '\n' {
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
