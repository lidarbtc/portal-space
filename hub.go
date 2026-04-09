package main

import (
	"encoding/json"
	"sync"

	"github.com/rs/zerolog/log"
)

// Hub manages rooms and global state.
type Hub struct {
	mu    sync.RWMutex
	rooms map[string]*Room

	storage *Storage
}

func newHub(storage *Storage) *Hub {
	h := &Hub{
		rooms:   make(map[string]*Room),
		storage: storage,
	}

	// Create default room
	defaultRoom := newRoom("default", h, mapWidth, mapHeight)
	h.rooms["default"] = defaultRoom

	// Place whiteboards near map center for visibility
	defaultRoom.addObject(&InteractiveObject{
		ID:   "wb-1",
		Type: "whiteboard",
		X:    float64(27*32 + 16),
		Y:    float64(22*32 + 16),
	})
	defaultRoom.addObject(&InteractiveObject{
		ID:   "wb-2",
		Type: "whiteboard",
		X:    float64(33*32 + 16),
		Y:    float64(22*32 + 16),
	})

	// Place a regional chat zone
	defaultRoom.addObject(&InteractiveObject{
		ID:    "rc-1",
		Type:  "regional_chat",
		X:     float64(20*32 + 16),
		Y:     float64(15*32 + 16),
		State: json.RawMessage(`{"name":"결계석","radius":160,"retainHistory":false}`),
	})

	return h
}

func (h *Hub) defaultRoom() *Room {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return h.rooms["default"]
}

func (h *Hub) run() {
	h.mu.RLock()
	for _, room := range h.rooms {
		go room.run()
	}
	h.mu.RUnlock()
}

func (h *Hub) closeAll() {
	h.mu.RLock()
	for _, room := range h.rooms {
		room.closeAll()
	}
	h.mu.RUnlock()
	log.Info().Msg("[portal-space] all connections closed")
}

func (h *Hub) wait() {
	h.mu.RLock()
	for _, room := range h.rooms {
		room.wait()
	}
	h.mu.RUnlock()
}
