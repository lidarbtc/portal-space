package main

import (
	"context"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"

	"github.com/gosuda/portal/v2/sdk"
	"github.com/gosuda/portal/v2/types"
	"github.com/gosuda/portal/v2/utils"
	"github.com/rs/zerolog/log"
	"github.com/spf13/cobra"
)

var rootCmd = &cobra.Command{
	Use:   "portal-space",
	Short: "Portal Space — 2D pixel co-coding space",
	RunE:  runServer,
}

var (
	flagServerURLs   string
	flagDiscovery    bool
	flagBanMITM      bool
	flagPort         int
	flagName         string
	flagIdentityPath string
	flagHide         bool
	flagDescription  string
	flagTags         string
	flagOwner        string
)

func init() {
	flags := rootCmd.PersistentFlags()
	flags.StringVar(&flagServerURLs, "server-url", os.Getenv("RELAY"), "relay base URL(s); repeat or comma-separated (from env RELAY/RELAY_URL if set)")
	flags.BoolVar(&flagDiscovery, "discovery", utils.ResolveBoolEnv(false, "DISCOVERY", "DEFAULT_RELAYS"), "include registry relays and enable relay discovery [env: DISCOVERY, DEFAULT_RELAYS]")
	flags.BoolVar(&flagBanMITM, "ban-mitm", utils.ResolveBoolEnv(false, "BAN_MITM"), "ban relay when MITM self-probe detects TLS termination [env: BAN_MITM]")
	flags.IntVar(&flagPort, "port", 3000, "optional local HTTP port (negative to disable)")
	flags.StringVar(&flagName, "name", "portal-space", "backend display name")
	flags.StringVar(&flagIdentityPath, "identity-path", "identity.json", "optional path to load/save the portal identity")
	flags.BoolVar(&flagHide, "hide", false, "hide this lease from portal listings")
	flags.StringVar(&flagDescription, "description", "Portal Space — 2D pixel co-coding space", "lease description")
	flags.StringVar(&flagOwner, "owner", "Portal Space", "lease owner")
	flags.StringVar(&flagTags, "tags", "collab,portal-space", "comma-separated lease tags")
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		log.Fatal().Err(err).Msg("execute portal-space command")
	}
}

// mimeTypes maps file extensions to correct MIME types.
// macOS may report "text/plain" for .js/.css via embed.FS, blocking ES module loads.
var mimeTypes = map[string]string{
	".js":    "application/javascript",
	".mjs":   "application/javascript",
	".css":   "text/css",
	".json":  "application/json",
	".html":  "text/html; charset=utf-8",
	".woff2": "font/woff2",
	".woff":  "font/woff",
	".png":   "image/png",
	".svg":   "image/svg+xml",
	".ico":   "image/x-icon",
}

// mimeResponseWriter intercepts WriteHeader to force the correct Content-Type
// before the response is flushed. http.FileServer calls ServeContent which
// sniffs and sets Content-Type before Write, so we must override at WriteHeader time.
type mimeResponseWriter struct {
	http.ResponseWriter
	contentType string
	wroteHeader bool
}

func (w *mimeResponseWriter) WriteHeader(code int) {
	if !w.wroteHeader && w.contentType != "" {
		w.ResponseWriter.Header().Set("Content-Type", w.contentType)
	}
	w.wroteHeader = true
	w.ResponseWriter.WriteHeader(code)
}

func (w *mimeResponseWriter) Write(b []byte) (int, error) {
	if !w.wroteHeader {
		w.WriteHeader(http.StatusOK)
	}
	return w.ResponseWriter.Write(b)
}

// withMIME wraps an http.Handler and overrides Content-Type based on file extension.
func withMIME(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ct := ""
		for ext, mime := range mimeTypes {
			if strings.HasSuffix(r.URL.Path, ext) {
				ct = mime
				break
			}
		}
		if ct != "" {
			next.ServeHTTP(&mimeResponseWriter{ResponseWriter: w, contentType: ct}, r)
		} else {
			next.ServeHTTP(w, r)
		}
	})
}

func runServer(cmd *cobra.Command, args []string) error {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	hub := newHub()
	go hub.run()

	// Static FS
	sub, err := fs.Sub(embeddedStatic, "static")
	if err != nil {
		return fmt.Errorf("embed static: %w", err)
	}
	staticFS := withMIME(http.FileServer(http.FS(sub)))

	mux := http.NewServeMux()

	// WebSocket endpoint
	mux.HandleFunc("/ws", func(w http.ResponseWriter, r *http.Request) {
		serveWS(hub, w, r)
	})

	// Relay /peer/{token}/... routing
	mux.HandleFunc("/peer/", func(w http.ResponseWriter, r *http.Request) {
		const prefix = "/peer/"
		rest := strings.TrimPrefix(r.URL.Path, prefix)
		token := rest
		suffix := ""
		if i := strings.IndexByte(rest, '/'); i >= 0 {
			token = rest[:i]
			suffix = rest[i:]
		}

		if token == "" || len(token) < 8 {
			http.NotFound(w, r)
			return
		}

		if suffix == "" {
			http.Redirect(w, r, "/peer/"+token+"/", http.StatusMovedPermanently)
			return
		}

		if suffix == "/" || suffix == "/index.html" {
			b, err := fs.ReadFile(sub, "index.html")
			if err != nil {
				http.NotFound(w, r)
				return
			}
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write(b)
			return
		}

		if suffix == "/ws" {
			serveWS(hub, w, r)
			return
		}

		// Rewrite to suffix for static serving
		r2 := r.Clone(r.Context())
		r2.URL.Path = suffix
		staticFS.ServeHTTP(w, r2)
	})

	// Favicon
	mux.HandleFunc("/favicon.ico", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})

	// Static files
	mux.Handle("/", staticFS)

	// Portal SDK Expose
	exposure, err := sdk.Expose(ctx, sdk.ExposeConfig{
		RelayURLs:    utils.SplitCSV(flagServerURLs),
		BanMITM:      flagBanMITM,
		Discovery:    flagDiscovery,
		Name:         flagName,
		IdentityPath: flagIdentityPath,
		Metadata: types.LeaseMetadata{
			Description: flagDescription,
			Tags:        utils.SplitCSV(flagTags),
			Owner:       flagOwner,
			Hide:        flagHide,
		},
	})
	if err != nil {
		return fmt.Errorf("expose: %w", err)
	}
	if exposure != nil {
		defer func() { _ = exposure.Close() }()
	}

	localAddr := ""
	if flagPort >= 0 {
		localAddr = fmt.Sprintf(":%d", flagPort)
	}

	log.Info().Str("name", flagName).Int("port", flagPort).Msg("[portal-space] starting")

	err = exposure.RunHTTP(ctx, mux, localAddr)
	hub.closeAll()
	hub.wait()
	if err != nil {
		return err
	}
	log.Info().Msg("[portal-space] shutdown complete")
	return nil
}
