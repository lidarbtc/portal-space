package main

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"strings"
	"testing"
)

func encodeBase64(data []byte) string {
	return base64.StdEncoding.EncodeToString(data)
}

func TestNormalizeChatImageAcceptsAllowedMIMEs(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name string
		data []byte
		mime string
	}{
		{
			name: "png",
			data: []byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n', 0x00},
			mime: "image/png",
		},
		{
			name: "jpeg",
			data: []byte{0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 'J', 'F', 'I', 'F', 0x00},
			mime: "image/jpeg",
		},
		{
			name: "gif",
			data: []byte{'G', 'I', 'F', '8', '9', 'a', 0x01, 0x00, 0x01, 0x00},
			mime: "image/gif",
		},
		{
			name: "webp",
			data: []byte{'R', 'I', 'F', 'F', 0x1a, 0x00, 0x00, 0x00, 'W', 'E', 'B', 'P', 'V', 'P', '8', ' ', 0x0a, 0x00, 0x00, 0x00},
			mime: "image/webp",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			t.Parallel()

			got := normalizeChatImage(&ChatImage{
				Mime: "application/octet-stream",
				Data: encodeBase64(tt.data),
				Size: 1,
				Name: "..\\folder/test.bin",
			})

			if got == nil {
				t.Fatalf("normalizeChatImage returned nil")
			}
			if got.Mime != tt.mime {
				t.Fatalf("mime = %q, want %q", got.Mime, tt.mime)
			}
			if got.Size != len(tt.data) {
				t.Fatalf("size = %d, want %d", got.Size, len(tt.data))
			}
			if got.Name != "..foldertest.bin" {
				t.Fatalf("name = %q, want sanitized filename", got.Name)
			}
		})
	}
}

func TestNormalizeChatImageRejectsInvalidBase64(t *testing.T) {
	t.Parallel()

	got := normalizeChatImage(&ChatImage{Data: "%%%"})
	if got != nil {
		t.Fatalf("expected nil for invalid base64")
	}
}

func TestNormalizeChatImageRejectsOversizedDecodedBytes(t *testing.T) {
	t.Parallel()

	oversized := bytes.Repeat([]byte{0x89, 'P', 'N', 'G', '\r', '\n', 0x1a, '\n'}, (maxChatImageBytes/8)+1)
	got := normalizeChatImage(&ChatImage{Data: encodeBase64(oversized)})
	if got != nil {
		t.Fatalf("expected nil for oversized image")
	}
}

func TestNormalizeChatImageRejectsUnsupportedMIME(t *testing.T) {
	t.Parallel()

	got := normalizeChatImage(&ChatImage{Data: encodeBase64([]byte("hello world"))})
	if got != nil {
		t.Fatalf("expected nil for unsupported mime")
	}
}

func TestNormalizeChatImageRejectsOversizedBase64Payload(t *testing.T) {
	t.Parallel()

	got := normalizeChatImage(&ChatImage{Data: string(bytes.Repeat([]byte{'A'}, maxChatImageBase64Len+1))})
	if got != nil {
		t.Fatalf("expected nil for oversized base64 payload")
	}
}

func TestMaxIncomingWSMessageBytesFitsMaxChatImageEnvelope(t *testing.T) {
	t.Parallel()

	msg := IncomingMessage{
		Type: MsgChat,
		X:    123,
		Y:    456,
		Image: &ChatImage{
			Mime: "image/webp",
			Data: string(bytes.Repeat([]byte{'A'}, maxChatImageBase64Len)),
			Size: maxChatImageBytes,
			Name: strings.Repeat("a", 100),
		},
	}

	encoded, err := json.Marshal(msg)
	if err != nil {
		t.Fatalf("marshal message: %v", err)
	}

	if len(encoded) > maxIncomingWSMessageBytes {
		t.Fatalf("encoded message length = %d, want <= %d", len(encoded), maxIncomingWSMessageBytes)
	}
}
