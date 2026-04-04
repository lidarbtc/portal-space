package main

import "embed"

//go:embed all:static
var embeddedStatic embed.FS
