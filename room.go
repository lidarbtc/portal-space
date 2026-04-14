package main

import (
	"encoding/json"
	"math"
	"sync"
	"time"

	"github.com/rs/zerolog/log"
)

// InteractiveObject represents a clickable object in the game world.
type InteractiveObject struct {
	ID    string          `json:"id"`
	Type  string          `json:"type"`
	X     float64         `json:"x"`
	Y     float64         `json:"y"`
	State json.RawMessage `json:"state,omitempty"`
}

// Room manages a single map instance with its players and objects.
type Room struct {
	id      string
	mu      sync.RWMutex
	players map[string]*Client
	objects map[string]*InteractiveObject

	collision [][]bool
	width     int
	height    int

	register   chan *Client
	unregister chan *Client
	broadcast  chan *OutgoingMessage

	hub  *Hub
	done chan struct{}
	wg   sync.WaitGroup
}

func newRoom(id string, hub *Hub, width, height int) *Room {
	collision := make([][]bool, height)
	for y := range collision {
		collision[y] = make([]bool, width)
	}

	r := &Room{
		id:         id,
		players:    make(map[string]*Client),
		objects:    make(map[string]*InteractiveObject),
		collision:  collision,
		width:      width,
		height:     height,
		register:   make(chan *Client),
		unregister: make(chan *Client),
		broadcast:  make(chan *OutgoingMessage, 256),
		hub:        hub,
		done:       make(chan struct{}),
	}

	r.initCollisionMap()
	return r
}

func (r *Room) initCollisionMap() {
	for x := 0; x < r.width; x++ {
		r.collision[0][x] = true
		r.collision[r.height-1][x] = true
	}
	for y := 0; y < r.height; y++ {
		r.collision[y][0] = true
		r.collision[y][r.width-1] = true
	}

	baseTables := [][2]int{
		{4, 4}, {5, 4}, {4, 7}, {5, 7}, {4, 10}, {5, 10},
		{10, 4}, {11, 4}, {10, 7}, {11, 7}, {10, 10}, {11, 10},
		{16, 4}, {17, 4}, {16, 7}, {17, 7}, {16, 10}, {17, 10},
	}
	for blockY := 0; blockY < r.height/15; blockY++ {
		for blockX := 0; blockX < r.width/20; blockX++ {
			for _, f := range baseTables {
				x := f[0] + blockX*20
				y := f[1] + blockY*15
				if x >= 0 && x < r.width && y >= 0 && y < r.height {
					r.collision[y][x] = true
				}
			}
		}
	}
}

func (r *Room) isWalkable(x, y int) bool {
	if x < 0 || x >= r.width || y < 0 || y >= r.height {
		return false
	}
	return !r.collision[y][x]
}

func (r *Room) findSpawnPoint() (float64, float64) {
	cx, cy := r.width/2, r.height/2
	candidates := [][2]int{
		{cx, cy}, {cx - 1, cy}, {cx, cy - 1}, {cx - 1, cy - 1},
		{cx - 2, cy + 2}, {cx + 2, cy + 2}, {cx - 2, cy - 2}, {cx + 2, cy - 2},
		{r.width / 4, r.height / 4}, {3 * r.width / 4, r.height / 4},
		{r.width / 4, 3 * r.height / 4}, {3 * r.width / 4, 3 * r.height / 4},
	}
	for _, c := range candidates {
		if r.isWalkable(c[0], c[1]) {
			return float64(c[0]*32 + 16), float64(c[1]*32 + 16)
		}
	}
	for y := 1; y < r.height-1; y++ {
		for x := 1; x < r.width-1; x++ {
			if r.isWalkable(x, y) {
				return float64(x*32 + 16), float64(y*32 + 16)
			}
		}
	}
	return float64(1*32 + 16), float64(1*32 + 16)
}

func (r *Room) addObject(obj *InteractiveObject) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.objects[obj.ID] = obj
}

func (r *Room) run() {
	r.wg.Add(1)
	defer r.wg.Done()

	for {
		select {
		case client := <-r.register:
			r.mu.Lock()
			if len(r.players) >= maxPlayers {
				r.mu.Unlock()
				client.sendMsg(&OutgoingMessage{
					Type:    MsgError,
					Message: "room is full",
				})
				client.conn.Close()
				continue
			}
			snapshot := r.snapshotLocked()
			r.players[client.id] = client
			r.mu.Unlock()

			// Send snapshot with objects
			r.mu.RLock()
			objects := make([]*InteractiveObject, 0, len(r.objects))
			for _, obj := range r.objects {
				objects = append(objects, obj)
			}
			r.mu.RUnlock()

			client.sendMsg(&OutgoingMessage{
				Type:    MsgSnapshot,
				Players: snapshot,
				Objects: objects,
				Self: &PlayerInfo{
					ID:           client.id,
					Nickname:     client.nickname,
					X:            client.x,
					Y:            client.y,
					Status:       client.status,
					Dir:          client.dir,
					Avatar:       client.avatar,
					Colors:       client.colors,
					CustomStatus: client.customStatus,
				},
			})

			joinMsg := &OutgoingMessage{
				Type: MsgJoin,
				Player: &PlayerInfo{
					ID:           client.id,
					Nickname:     client.nickname,
					X:            client.x,
					Y:            client.y,
					Status:       client.status,
					Dir:          client.dir,
					Avatar:       client.avatar,
					Colors:       client.colors,
					CustomStatus: client.customStatus,
				},
				Reconnect: client.reconnect,
			}
			r.mu.RLock()
			for _, c := range r.players {
				if c.id != client.id {
					c.sendMsg(joinMsg)
				}
			}
			r.mu.RUnlock()

		case client := <-r.unregister:
			r.mu.Lock()
			_, ok := r.players[client.id]
			if ok {
				delete(r.players, client.id)
			}
			r.mu.Unlock()
			if ok {
				r.broadcast <- &OutgoingMessage{
					Type: MsgLeave,
					ID:   client.id,
				}
			}

		case msg := <-r.broadcast:
			r.mu.RLock()
			for _, client := range r.players {
				client.sendMsg(msg)
			}
			r.mu.RUnlock()

		case <-r.done:
			return
		}
	}
}

func (r *Room) handleMove(client *Client, x, y float64, dir string) {
	if !r.validateMove(x, y) {
		return
	}
	if !validateDirection(dir) {
		return
	}

	now := time.Now()
	elapsed := now.Sub(client.lastMove)
	if !client.lastMove.IsZero() && elapsed < 2*time.Second && elapsed > 0 {
		dx := x - client.x
		dy := y - client.y
		dist := math.Sqrt(dx*dx + dy*dy)
		speed := dist / elapsed.Seconds()
		maxSpeed := 400.0
		if now.Before(client.dashUntil) {
			maxSpeed = 1000.0
		}
		if speed > maxSpeed {
			return
		}
	}

	if elapsed < time.Second/moveRateLimit {
		return
	}
	client.lastMove = now

	client.x = x
	client.y = y
	client.dir = dir

	r.broadcast <- &OutgoingMessage{
		Type: MsgMove,
		ID:   client.id,
		X:    x,
		Y:    y,
		Dir:  dir,
	}
}

func (r *Room) handleStatus(client *Client, status string) {
	if !validateStatus(status) {
		return
	}
	client.status = status
	r.broadcast <- &OutgoingMessage{
		Type:   MsgStatus,
		ID:     client.id,
		Status: status,
	}
}

func (r *Room) handleEmote(client *Client, emoji string) {
	if !validateEmoji(emoji) {
		return
	}
	now := time.Now()
	if now.Sub(client.lastEmote) < time.Second/emoteRateLimit {
		return
	}
	client.lastEmote = now
	r.broadcast <- &OutgoingMessage{
		Type:  MsgEmote,
		ID:    client.id,
		Emoji: emoji,
	}
}

func (r *Room) handleProfile(client *Client, nickname string, colors *ColorPalette) {
	now := time.Now()
	if now.Sub(client.lastProfile) < time.Duration(profileCooldown)*time.Second {
		return
	}
	client.lastProfile = now
	client.nickname = nickname
	client.colors = colors
	r.broadcast <- &OutgoingMessage{
		Type:     MsgProfile,
		ID:       client.id,
		Nickname: nickname,
		Player: &PlayerInfo{
			ID:       client.id,
			Nickname: nickname,
			X:        client.x,
			Y:        client.y,
			Status:   client.status,
			Dir:      client.dir,
			Avatar:   client.avatar,
			Colors:   colors,
		},
	}
}

func (r *Room) handleDash(client *Client, dir string) {
	if !validateDirection(dir) {
		return
	}
	now := time.Now()
	const dashCooldown = 1500 * time.Millisecond
	const dashDuration = 150 * time.Millisecond
	if now.Sub(client.lastDash) < dashCooldown {
		return
	}
	client.lastDash = now
	client.dashUntil = now.Add(dashDuration)

	r.broadcast <- &OutgoingMessage{
		Type: MsgDash,
		ID:   client.id,
		X:    client.x,
		Y:    client.y,
		Dir:  dir,
	}
}

func (r *Room) handleCustomStatus(client *Client, text string) {
	now := time.Now()
	if now.Sub(client.lastCustomStatus) < time.Duration(customStatusCooldown)*time.Second {
		return
	}
	client.lastCustomStatus = now

	text = sanitizeString(text, maxCustomStatusLen)
	client.customStatus = text

	r.broadcast <- &OutgoingMessage{
		Type:         MsgCustomStatus,
		ID:           client.id,
		CustomStatus: text,
	}
}

func (r *Room) handleChat(client *Client, text string, image *ChatImage) {
	text = sanitizeChat(text)
	normalizedImage := normalizeChatImage(image)

	if image != nil && normalizedImage == nil {
		return
	}

	if text == "" && normalizedImage == nil {
		return
	}

	msg := &OutgoingMessage{
		Type:     MsgChat,
		ID:       client.id,
		Nickname: client.nickname,
	}

	if text != "" {
		msg.Text = text
	}
	if normalizedImage != nil {
		msg.Image = normalizedImage
	}

	r.broadcast <- msg
}

func (r *Room) handleAction(client *Client, raw json.RawMessage) {
	var action ActionMessage
	if err := json.Unmarshal(raw, &action); err != nil {
		log.Warn().Err(err).Str("client", client.id).Msg("invalid action message")
		return
	}

	switch action.Domain {
	default:
		log.Debug().Str("domain", action.Domain).Msg("unknown action domain")
	}
}

func (r *Room) validateMove(x, y float64) bool {
	pw := float64(r.width * 32)
	ph := float64(r.height * 32)
	return x >= 0 && x < pw && y >= 0 && y < ph
}

func (r *Room) snapshotLocked() []*PlayerInfo {
	players := make([]*PlayerInfo, 0, len(r.players))
	for _, c := range r.players {
		players = append(players, &PlayerInfo{
			ID:           c.id,
			Nickname:     c.nickname,
			X:            c.x,
			Y:            c.y,
			Status:       c.status,
			Dir:          c.dir,
			Avatar:       c.avatar,
			Colors:       c.colors,
			CustomStatus: c.customStatus,
		})
	}
	return players
}

func (r *Room) closeAll() {
	close(r.done)
	r.mu.RLock()
	for _, client := range r.players {
		client.conn.Close()
	}
	r.mu.RUnlock()
}

func (r *Room) wait() {
	r.wg.Wait()
}
