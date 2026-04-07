package main

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gorilla/websocket"
	"github.com/rs/zerolog/log"
)

// y-websocket message type prefixes
const (
	yjsMsgSync      byte = 0
	yjsMsgAwareness byte = 1

	yjsSyncStep1  byte = 0
	yjsSyncStep2  byte = 1
	yjsSyncUpdate byte = 2
)

type yjsClient struct {
	conn *websocket.Conn
	send chan []byte
	done chan struct{} // signals writePump to exit
}

type yjsRoom struct {
	mu        sync.RWMutex
	clients   map[*yjsClient]bool
	docState  []byte   // base state (from SyncStep2)
	updates   [][]byte // buffered incremental updates since last full state
}

// YjsRelay manages Y.js WebSocket connections per board.
type YjsRelay struct {
	mu           sync.RWMutex
	rooms        map[string]*yjsRoom
	storage      *Storage
	validBoards  map[string]bool // whitelist of known board IDs
	upgrader     websocket.Upgrader
}

func newYjsRelay(storage *Storage, validBoardIDs []string) *YjsRelay {
	valid := make(map[string]bool, len(validBoardIDs))
	for _, id := range validBoardIDs {
		valid[id] = true
	}

	r := &YjsRelay{
		rooms:       make(map[string]*yjsRoom),
		storage:     storage,
		validBoards: valid,
		upgrader: websocket.Upgrader{
			CheckOrigin: func(r *http.Request) bool { return true },
		},
	}
	r.loadFromStorage()
	return r
}

func (r *YjsRelay) loadFromStorage() {
	if r.storage == nil {
		return
	}
	rows, err := r.storage.db.Query("SELECT board_id, doc_state FROM yjs_documents")
	if err != nil {
		log.Warn().Err(err).Msg("failed to load yjs documents")
		return
	}
	defer rows.Close()

	count := 0
	for rows.Next() {
		var boardID string
		var state []byte
		if err := rows.Scan(&boardID, &state); err != nil {
			continue
		}
		room := &yjsRoom{
			clients:  make(map[*yjsClient]bool),
			docState: state,
		}
		r.rooms[boardID] = room
		count++
	}
	if count > 0 {
		log.Info().Int("boards", count).Msg("loaded yjs document states")
	}
}

func (r *YjsRelay) getRoom(boardID string) *yjsRoom {
	r.mu.Lock()
	defer r.mu.Unlock()
	room, ok := r.rooms[boardID]
	if !ok {
		room = &yjsRoom{
			clients: make(map[*yjsClient]bool),
		}
		r.rooms[boardID] = room
	}
	return room
}

// extractBoardID extracts the board ID from the URL path.
func extractBoardID(path string) string {
	idx := strings.Index(path, "/ws/yjs/")
	if idx < 0 {
		return ""
	}
	id := path[idx+len("/ws/yjs/"):]
	// Strip trailing slashes
	id = strings.TrimRight(id, "/")
	return id
}

// ServeHTTP handles /ws/yjs/{boardId} requests.
func (r *YjsRelay) ServeHTTP(w http.ResponseWriter, req *http.Request) {
	boardID := extractBoardID(req.URL.Path)
	if boardID == "" {
		http.NotFound(w, req)
		return
	}

	// Validate board ID against whitelist
	if !r.validBoards[boardID] {
		http.Error(w, "unknown board", http.StatusForbidden)
		return
	}

	conn, err := r.upgrader.Upgrade(w, req, nil)
	if err != nil {
		log.Warn().Err(err).Msg("yjs websocket upgrade failed")
		return
	}

	room := r.getRoom(boardID)
	client := &yjsClient{
		conn: conn,
		send: make(chan []byte, 64),
		done: make(chan struct{}),
	}

	// Add client to room
	room.mu.Lock()
	room.clients[client] = true
	room.mu.Unlock()

	// Send stored state to new client
	r.sendFullState(room, client)

	go r.writePump(client)
	go r.readPump(boardID, room, client)
}

// sendFullState sends the base docState + all buffered updates to a client.
func (r *YjsRelay) sendFullState(room *yjsRoom, client *yjsClient) {
	room.mu.RLock()
	state := room.docState
	updates := make([][]byte, len(room.updates))
	copy(updates, room.updates)
	room.mu.RUnlock()

	// Send base state as SyncStep2
	if len(state) > 0 {
		msg := make([]byte, 0, 2+len(state))
		msg = append(msg, yjsMsgSync, yjsSyncStep2)
		msg = append(msg, state...)
		select {
		case client.send <- msg:
		default:
		}
	}

	// Replay all buffered incremental updates
	for _, update := range updates {
		msg := make([]byte, 0, 2+len(update))
		msg = append(msg, yjsMsgSync, yjsSyncUpdate)
		msg = append(msg, update...)
		select {
		case client.send <- msg:
		default:
		}
	}
}

func (r *YjsRelay) readPump(boardID string, room *yjsRoom, client *yjsClient) {
	defer func() {
		// Remove client from room
		room.mu.Lock()
		delete(room.clients, client)
		isEmpty := len(room.clients) == 0
		room.mu.Unlock()

		// Signal writePump to exit (instead of closing send channel)
		close(client.done)
		client.conn.Close()

		// Persist state when last client leaves
		if isEmpty {
			r.persistState(boardID, room)
		}
	}()

	client.conn.SetReadLimit(1 << 20) // 1MB max message
	_ = client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	client.conn.SetPongHandler(func(string) error {
		_ = client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		messageType, data, err := client.conn.ReadMessage()
		if err != nil {
			break
		}
		_ = client.conn.SetReadDeadline(time.Now().Add(60 * time.Second))

		if messageType != websocket.BinaryMessage || len(data) < 1 {
			continue
		}

		msgType := data[0]

		switch msgType {
		case yjsMsgSync:
			if len(data) < 2 {
				continue
			}
			syncType := data[1]

			switch syncType {
			case yjsSyncStep1:
				// Client requests state — send full state
				r.sendFullState(room, client)

			case yjsSyncStep2:
				// Full state from client — replace base state, clear update buffer
				update := data[2:]
				if len(update) > 0 {
					room.mu.Lock()
					room.docState = make([]byte, len(update))
					copy(room.docState, update)
					room.updates = nil // clear buffer since we have full state
					room.mu.Unlock()
				}
				r.broadcast(room, client, data)

			case yjsSyncUpdate:
				// Incremental update — buffer AND broadcast
				update := data[2:]
				if len(update) > 0 {
					room.mu.Lock()
					room.updates = append(room.updates, update)
					room.mu.Unlock()
				}
				r.broadcast(room, client, data)
			}

		case yjsMsgAwareness:
			r.broadcast(room, client, data)
		}
	}
}

func (r *YjsRelay) broadcast(room *yjsRoom, sender *yjsClient, data []byte) {
	room.mu.RLock()
	defer room.mu.RUnlock()
	for c := range room.clients {
		if c == sender {
			continue
		}
		select {
		case c.send <- data:
		default:
		}
	}
}

func (r *YjsRelay) persistState(boardID string, room *yjsRoom) {
	if r.storage == nil {
		return
	}
	room.mu.RLock()
	state := room.docState
	room.mu.RUnlock()

	if len(state) > 0 {
		r.storage.WriteAsync(
			`INSERT INTO yjs_documents (board_id, doc_state, updated_at)
			 VALUES (?, ?, CURRENT_TIMESTAMP)
			 ON CONFLICT(board_id) DO UPDATE SET
			   doc_state = excluded.doc_state,
			   updated_at = CURRENT_TIMESTAMP`,
			boardID, state,
		)
	}
}

func (r *YjsRelay) writePump(client *yjsClient) {
	ticker := time.NewTicker(20 * time.Second)
	defer func() {
		ticker.Stop()
		client.conn.Close()
	}()

	for {
		select {
		case msg := <-client.send:
			_ = client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := client.conn.WriteMessage(websocket.BinaryMessage, msg); err != nil {
				return
			}

		case <-client.done:
			// readPump exited — drain remaining messages and exit
			for {
				select {
				case msg := <-client.send:
					_ = client.conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
					_ = client.conn.WriteMessage(websocket.BinaryMessage, msg)
				default:
					return
				}
			}

		case <-ticker.C:
			_ = client.conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := client.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
