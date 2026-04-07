package main

import (
	"database/sql"
	"sync"

	"github.com/rs/zerolog/log"
	_ "modernc.org/sqlite"
)

type WriteOp struct {
	query  string
	args   []any
	result chan error
}

type Storage struct {
	db      *sql.DB
	writeCh chan WriteOp
	done    chan struct{}
	wg      sync.WaitGroup
}

func newStorage(dbPath string) (*Storage, error) {
	db, err := sql.Open("sqlite", dbPath+"?_pragma=journal_mode(WAL)&_pragma=busy_timeout(5000)")
	if err != nil {
		return nil, err
	}

	s := &Storage{
		db:      db,
		writeCh: make(chan WriteOp, 256),
		done:    make(chan struct{}),
	}

	if err := s.migrate(); err != nil {
		db.Close()
		return nil, err
	}

	s.wg.Add(1)
	go s.writeLoop()

	return s, nil
}

func (s *Storage) migrate() error {
	_, err := s.db.Exec(`
		CREATE TABLE IF NOT EXISTS yjs_documents (
			board_id TEXT PRIMARY KEY,
			doc_state BLOB NOT NULL,
			updates_blob BLOB,
			updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
		);
	`)
	if err != nil {
		return err
	}
	// Migration for existing databases: add updates_blob column if missing.
	s.db.Exec(`ALTER TABLE yjs_documents ADD COLUMN updates_blob BLOB`)
	return nil
}

func (s *Storage) writeLoop() {
	defer s.wg.Done()
	for {
		select {
		case op := <-s.writeCh:
			_, err := s.db.Exec(op.query, op.args...)
			if op.result != nil {
				op.result <- err
			}
		case <-s.done:
			// Drain remaining writes
			for {
				select {
				case op := <-s.writeCh:
					_, err := s.db.Exec(op.query, op.args...)
					if op.result != nil {
						op.result <- err
					}
				default:
					return
				}
			}
		}
	}
}

// Write submits a write operation and waits for completion.
func (s *Storage) Write(query string, args ...any) error {
	result := make(chan error, 1)
	s.writeCh <- WriteOp{query: query, args: args, result: result}
	return <-result
}

// WriteAsync submits a write operation without waiting.
func (s *Storage) WriteAsync(query string, args ...any) {
	s.writeCh <- WriteOp{query: query, args: args}
}

func (s *Storage) Close() {
	close(s.done)
	s.wg.Wait()
	if err := s.db.Close(); err != nil {
		log.Warn().Err(err).Msg("failed to close database")
	}
}
