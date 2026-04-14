package main

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

const (
	writeWait  = 10 * time.Second
	pongWait   = 60 * time.Second
	pingPeriod = 20 * time.Second
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	hub  *Hub
	room *Room
	conn *websocket.Conn

	id           string
	nickname     string
	x            float64
	y            float64
	status       string
	dir          string
	avatar       int
	colors       *ColorPalette
	customStatus string

	reconnect     bool
	currentZoneID string

	lastMove           time.Time
	lastEmote          time.Time
	lastProfile        time.Time
	lastCustomStatus   time.Time
	lastSettingsUpdate time.Time
	lastDash           time.Time
	dashUntil          time.Time

	send chan []byte
	once sync.Once
}

func newClient(hub *Hub, room *Room, conn *websocket.Conn) *Client {
	spawnX, spawnY := room.findSpawnPoint()
	return &Client{
		hub:    hub,
		room:   room,
		conn:   conn,
		id:     uuid.NewString()[:8],
		x:      spawnX,
		y:      spawnY,
		status: "online",
		dir:    "down",
		send:   make(chan []byte, 64),
	}
}

func (c *Client) sendMsg(msg *OutgoingMessage) {
	data, err := json.Marshal(msg)
	if err != nil {
		return
	}
	select {
	case c.send <- data:
	default:
	}
}

func (c *Client) readPump() {
	defer func() {
		c.room.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxIncomingWSMessageBytes)
	_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, message, err := c.conn.ReadMessage()
		if err != nil {
			break
		}
		_ = c.conn.SetReadDeadline(time.Now().Add(pongWait))

		var msg IncomingMessage
		if err := json.Unmarshal(message, &msg); err != nil {
			continue
		}

		switch msg.Type {
		case MsgJoin:
			nickname := sanitizeNickname(msg.Nickname)
			if nickname == "" {
				nickname = "anonymous"
			}
			c.nickname = nickname
			if validateAvatar(msg.Avatar) {
				c.avatar = msg.Avatar
			}
			if msg.Colors != nil && validateColors(msg.Colors) {
				c.colors = msg.Colors
			}
			c.reconnect = msg.Reconnect
			if (msg.X != 0 || msg.Y != 0) && c.room.validateMove(msg.X, msg.Y) {
				tileX := int(msg.X) / 32
				tileY := int(msg.Y) / 32
				if c.room.isWalkable(tileX, tileY) {
					c.x = msg.X
					c.y = msg.Y
				}
			}
			c.room.register <- c

		case MsgMove:
			c.room.handleMove(c, msg.X, msg.Y, msg.Dir)

		case MsgStatus:
			c.room.handleStatus(c, msg.Status)

		case MsgChat:
			c.room.handleChat(c, msg.Text, msg.Image)

		case MsgEmote:
			c.room.handleEmote(c, msg.Emoji)

		case MsgCustomStatus:
			c.room.handleCustomStatus(c, msg.CustomStatus)

		case MsgDash:
			c.room.handleDash(c, msg.Dir)

		case MsgProfile:
			nickname := sanitizeNickname(msg.Nickname)
			if nickname == "" {
				nickname = c.nickname
			}
			var colors *ColorPalette
			if msg.Colors != nil && validateColors(msg.Colors) {
				colors = msg.Colors
			} else {
				colors = c.colors
			}
			c.room.handleProfile(c, nickname, colors)

		case MsgAction:
			if msg.Payload != nil {
				c.room.handleAction(c, msg.Payload)
			}
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.send:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				_ = c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, message); err != nil {
				return
			}

		case <-ticker.C:
			_ = c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}

func serveWS(hub *Hub, w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		log.Warn().Err(err).Msg("[portal-space] websocket upgrade failed")
		return
	}

	room := hub.defaultRoom()
	client := newClient(hub, room, conn)
	go client.writePump()
	go client.readPump()
}
