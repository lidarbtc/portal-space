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
	MsgSnapshot MsgType = "snapshot"
	MsgError    MsgType = "error"
)

// Client → Server messages

type IncomingMessage struct {
	Type     MsgType `json:"type"`
	Nickname string  `json:"nickname,omitempty"`
	X        int     `json:"x,omitempty"`
	Y        int     `json:"y,omitempty"`
	Dir      string  `json:"dir,omitempty"`
	Status   string  `json:"status,omitempty"`
	Text     string  `json:"text,omitempty"`
}

// Server → Client messages

type OutgoingMessage struct {
	Type     MsgType       `json:"type"`
	ID       string        `json:"id,omitempty"`
	Nickname string        `json:"nickname,omitempty"`
	X        int           `json:"x,omitempty"`
	Y        int           `json:"y,omitempty"`
	Dir      string        `json:"dir,omitempty"`
	Status   string        `json:"status,omitempty"`
	Text     string        `json:"text,omitempty"`
	Message  string        `json:"message,omitempty"`
	Player   *PlayerInfo   `json:"player,omitempty"`
	Players  []*PlayerInfo `json:"players,omitempty"`
	Self     *PlayerInfo   `json:"self,omitempty"`
}

type PlayerInfo struct {
	ID       string `json:"id"`
	Nickname string `json:"nickname"`
	X        int    `json:"x"`
	Y        int    `json:"y"`
	Status   string `json:"status"`
	Dir      string `json:"dir"`
}

// Validation

const (
	maxNicknameLen = 20
	maxChatLen     = 500
	mapWidth       = 20
	mapHeight      = 15
)

var validStatuses = map[string]bool{
	"coding":  true,
	"resting": true,
	"away":    true,
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

func validateMove(x, y int) bool {
	return x >= 0 && x < mapWidth && y >= 0 && y < mapHeight
}

func validateStatus(s string) bool {
	return validStatuses[s]
}

func validateDirection(d string) bool {
	return validDirections[d]
}
