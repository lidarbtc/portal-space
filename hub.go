package main

import (
	"math"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

const (
	proximityRadius = 5.0
	maxPlayers      = 20
	moveRateLimit   = 10 // max moves per second per client
	emoteRateLimit  = 2  // max emotes per second per client
)

// collisionMap stores which tiles block movement (true = blocked).
var collisionMap [mapHeight][mapWidth]bool

func initCollisionMap() {
	// Outer walls
	for x := 0; x < mapWidth; x++ {
		collisionMap[0][x] = true
		collisionMap[mapHeight-1][x] = true
	}
	for y := 0; y < mapHeight; y++ {
		collisionMap[y][0] = true
		collisionMap[y][mapWidth-1] = true
	}

	// Interior furniture (tables, chairs, shelves)
	// Tables (2x1 blocks)
	furniture := [][2]int{
		{4, 4}, {5, 4},
		{4, 7}, {5, 7},
		{4, 10}, {5, 10},
		{10, 4}, {11, 4},
		{10, 7}, {11, 7},
		{10, 10}, {11, 10},
		{16, 4}, {17, 4},
		{16, 7}, {17, 7},
		{16, 10}, {17, 10},
	}
	for _, f := range furniture {
		if f[1] >= 0 && f[1] < mapHeight && f[0] >= 0 && f[0] < mapWidth {
			collisionMap[f[1]][f[0]] = true
		}
	}
}

func isWalkable(x, y int) bool {
	if x < 0 || x >= mapWidth || y < 0 || y >= mapHeight {
		return false
	}
	return !collisionMap[y][x]
}

// findSpawnPoint finds a random walkable tile for a new player.
func findSpawnPoint() (int, int) {
	// Try center area first, then expand
	candidates := [][2]int{
		{9, 6}, {10, 6}, {9, 8}, {10, 8},
		{7, 5}, {12, 5}, {7, 9}, {12, 9},
		{3, 3}, {15, 3}, {3, 12}, {15, 12},
	}
	for _, c := range candidates {
		if isWalkable(c[0], c[1]) {
			return c[0], c[1]
		}
	}
	// Fallback: scan for any walkable tile
	for y := 1; y < mapHeight-1; y++ {
		for x := 1; x < mapWidth-1; x++ {
			if isWalkable(x, y) {
				return x, y
			}
		}
	}
	return 1, 1
}

type Hub struct {
	mu      sync.RWMutex
	players map[string]*Client

	register   chan *Client
	unregister chan *Client
	broadcast  chan *OutgoingMessage

	done chan struct{}
	wg   sync.WaitGroup
}

func newHub() *Hub {
	initCollisionMap()
	return &Hub{
		players:    make(map[string]*Client),
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *OutgoingMessage, 256),
		done:       make(chan struct{}),
	}
}

func (h *Hub) run() {
	h.wg.Add(1)
	defer h.wg.Done()

	for {
		select {
		case client := <-h.register:
			h.mu.Lock()
			if len(h.players) >= maxPlayers {
				h.mu.Unlock()
				client.sendMsg(&OutgoingMessage{
					Type:    MsgError,
					Message: "room is full",
				})
				client.conn.Close()
				continue
			}
			// Send snapshot of existing players BEFORE adding new client
			snapshot := h.snapshotLocked()
			h.players[client.id] = client
			h.mu.Unlock()

			client.sendMsg(&OutgoingMessage{
				Type:    MsgSnapshot,
				Players: snapshot,
				Self: &PlayerInfo{
					ID:       client.id,
					Nickname: client.nickname,
					X:        client.x,
					Y:        client.y,
					Status:   client.status,
					Dir:      client.dir,
					Avatar:   client.avatar,
				},
			})

			// Broadcast join to all others (not the joining client)
			joinMsg := &OutgoingMessage{
				Type: MsgJoin,
				Player: &PlayerInfo{
					ID:       client.id,
					Nickname: client.nickname,
					X:        client.x,
					Y:        client.y,
					Status:   client.status,
					Dir:      client.dir,
					Avatar:   client.avatar,
				},
				Reconnect: client.reconnect,
			}
			h.mu.RLock()
			for _, c := range h.players {
				if c.id != client.id {
					c.sendMsg(joinMsg)
				}
			}
			h.mu.RUnlock()

		case client := <-h.unregister:
			h.mu.Lock()
			if _, ok := h.players[client.id]; ok {
				delete(h.players, client.id)
			}
			h.mu.Unlock()
			h.broadcast <- &OutgoingMessage{
				Type: MsgLeave,
				ID:   client.id,
			}

		case msg := <-h.broadcast:
			h.mu.RLock()
			for _, client := range h.players {
				client.sendMsg(msg)
			}
			h.mu.RUnlock()

		case <-h.done:
			return
		}
	}
}

func (h *Hub) broadcastProximity(msg *OutgoingMessage, senderX, senderY int, senderID string) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, client := range h.players {
		dx := float64(client.x - senderX)
		dy := float64(client.y - senderY)
		dist := math.Sqrt(dx*dx + dy*dy)
		if dist <= proximityRadius {
			client.sendMsg(msg)
		}
	}
}

func (h *Hub) handleMove(client *Client, x, y int, dir string) {
	if !validateMove(x, y) {
		return
	}
	if !validateDirection(dir) {
		return
	}
	if !isWalkable(x, y) {
		return
	}

	// Rate limit
	now := time.Now()
	if now.Sub(client.lastMove) < time.Second/moveRateLimit {
		return
	}
	client.lastMove = now

	client.x = x
	client.y = y
	client.dir = dir

	h.broadcast <- &OutgoingMessage{
		Type: MsgMove,
		ID:   client.id,
		X:    x,
		Y:    y,
		Dir:  dir,
	}
}

func (h *Hub) handleStatus(client *Client, status string) {
	if !validateStatus(status) {
		return
	}
	client.status = status
	h.broadcast <- &OutgoingMessage{
		Type:   MsgStatus,
		ID:     client.id,
		Status: status,
	}
}

func (h *Hub) handleEmote(client *Client, emoji string) {
	if !validateEmoji(emoji) {
		return
	}
	now := time.Now()
	if now.Sub(client.lastEmote) < time.Second/emoteRateLimit {
		return
	}
	client.lastEmote = now

	h.broadcast <- &OutgoingMessage{
		Type:  MsgEmote,
		ID:    client.id,
		Emoji: emoji,
	}
}

func (h *Hub) handleChat(client *Client, text string) {
	text = sanitizeChat(text)
	if text == "" {
		return
	}

	h.broadcast <- &OutgoingMessage{
		Type:     MsgChat,
		ID:       client.id,
		Nickname: client.nickname,
		Text:     text,
	}
}

func (h *Hub) snapshotLocked() []*PlayerInfo {
	players := make([]*PlayerInfo, 0, len(h.players))
	for _, c := range h.players {
		players = append(players, &PlayerInfo{
			ID:       c.id,
			Nickname: c.nickname,
			X:        c.x,
			Y:        c.y,
			Status:   c.status,
			Dir:      c.dir,
			Avatar:   c.avatar,
		})
	}
	return players
}

func (h *Hub) closeAll() {
	close(h.done)
	h.mu.RLock()
	for _, client := range h.players {
		client.conn.Close()
	}
	h.mu.RUnlock()
	log.Info().Msg("[portal-space] all connections closed")
}

func (h *Hub) wait() {
	h.wg.Wait()
}
