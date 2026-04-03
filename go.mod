module github.com/1ncursio/portal-mogakko

go 1.26.1

replace github.com/gosuda/portal/v2 => github.com/gosuda/portal-tunnel/v2 v2.1.2-0.20260403064421-440cea4f22c6

require (
	github.com/google/uuid v1.6.0
	github.com/gorilla/websocket v1.5.3
	github.com/gosuda/portal/v2 v2.1.1
	github.com/rs/zerolog v1.34.0
	github.com/spf13/cobra v1.10.1
)

require (
	github.com/decred/dcrd/dcrec/secp256k1/v4 v4.1.0 // indirect
	github.com/gosuda/keyless_tls v0.0.1-0.20260304212324-7733f8366abc // indirect
	github.com/inconshreveable/mousetrap v1.1.0 // indirect
	github.com/mattn/go-colorable v0.1.13 // indirect
	github.com/mattn/go-isatty v0.0.20 // indirect
	github.com/quic-go/quic-go v0.59.0 // indirect
	github.com/spf13/pflag v1.0.9 // indirect
	golang.org/x/crypto v0.48.0 // indirect
	golang.org/x/net v0.51.0 // indirect
	golang.org/x/sys v0.41.0 // indirect
	golang.org/x/text v0.34.0 // indirect
)
