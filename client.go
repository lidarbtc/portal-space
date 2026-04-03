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
	maxMsgSize = 4096
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type Client struct {
	hub  *Hub
	conn *websocket.Conn

	id       string
	nickname string
	x        int
	y        int
	status   string
	dir      string
	avatar   int

	lastMove  time.Time
	lastEmote time.Time

	send chan []byte
	once sync.Once
}

func newClient(hub *Hub, conn *websocket.Conn) *Client {
	spawnX, spawnY := findSpawnPoint()
	return &Client{
		hub:    hub,
		conn:   conn,
		id:     uuid.NewString()[:8],
		x:      spawnX,
		y:      spawnY,
		status: "coding",
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
		// Drop message if buffer full
	}
}

func (c *Client) readPump() {
	defer func() {
		c.hub.unregister <- c
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMsgSize)
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
			c.hub.register <- c

		case MsgMove:
			c.hub.handleMove(c, msg.X, msg.Y, msg.Dir)

		case MsgStatus:
			c.hub.handleStatus(c, msg.Status)

		case MsgChat:
			c.hub.handleChat(c, msg.Text)

		case MsgEmote:
			c.hub.handleEmote(c, msg.Emoji)
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
		log.Warn().Err(err).Msg("[mogakko] websocket upgrade failed")
		return
	}

	client := newClient(hub, conn)
	// Don't register yet — wait for join message with nickname
	go client.writePump()
	go client.readPump()
}
