package guacamole

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
)

// ConnectionParams holds RDP connection parameters for Guacamole.
type ConnectionParams struct {
	Hostname     string
	Port         string
	Username     string
	Password     string
	Security     string
	IgnoreCert   string
	ResizeMethod string
	Width        string
	Height       string
	DPI          string
}

type connectionSettings struct {
	Hostname     string `json:"hostname"`
	Port         string `json:"port"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	Security     string `json:"security"`
	IgnoreCert   string `json:"ignore-cert"`
	ResizeMethod string `json:"resize-method"`
	Width        string `json:"width,omitempty"`
	Height       string `json:"height,omitempty"`
	DPI          string `json:"dpi,omitempty"`
}

type connectionInfo struct {
	Type     string             `json:"type"`
	Settings connectionSettings `json:"settings"`
}

type connectionPayload struct {
	Connection connectionInfo `json:"connection"`
}

type encryptedToken struct {
	IV    string `json:"iv"`
	Value string `json:"value"`
}

// GenerateToken creates an encrypted Guacamole token compatible with guacamole-lite.
// The secret must be exactly 32 bytes (raw, not hex/base64 encoded).
func GenerateToken(secret string, params ConnectionParams) (string, error) {
	secretBytes := []byte(secret)
	if len(secretBytes) != 32 {
		return "", fmt.Errorf("secret must be exactly 32 bytes, got %d", len(secretBytes))
	}

	// Build connection JSON
	payload := connectionPayload{
		Connection: connectionInfo{
			Type: "rdp",
			Settings: connectionSettings{
				Hostname:     params.Hostname,
				Port:         params.Port,
				Username:     params.Username,
				Password:     params.Password,
				Security:     params.Security,
				IgnoreCert:   params.IgnoreCert,
				ResizeMethod: params.ResizeMethod,
				Width:        params.Width,
				Height:       params.Height,
				DPI:          params.DPI,
			},
		},
	}

	plaintext, err := json.Marshal(payload)
	if err != nil {
		return "", fmt.Errorf("failed to marshal connection params: %w", err)
	}

	// Generate random 16-byte IV
	iv := make([]byte, aes.BlockSize)
	if _, err := rand.Read(iv); err != nil {
		return "", fmt.Errorf("failed to generate IV: %w", err)
	}

	// PKCS7 pad
	padded := pkcs7Pad(plaintext, aes.BlockSize)

	// AES-256-CBC encrypt
	block, err := aes.NewCipher(secretBytes)
	if err != nil {
		return "", fmt.Errorf("failed to create cipher: %w", err)
	}

	ciphertext := make([]byte, len(padded))
	cipher.NewCBCEncrypter(block, iv).CryptBlocks(ciphertext, padded)

	// Build {"iv": base64(iv), "value": base64(ciphertext)}
	token := encryptedToken{
		IV:    base64.StdEncoding.EncodeToString(iv),
		Value: base64.StdEncoding.EncodeToString(ciphertext),
	}

	tokenJSON, err := json.Marshal(token)
	if err != nil {
		return "", fmt.Errorf("failed to marshal token: %w", err)
	}

	// Base64-encode the entire JSON string
	return base64.StdEncoding.EncodeToString(tokenJSON), nil
}

// pkcs7Pad appends PKCS#7 padding to data to make it a multiple of blockSize.
func pkcs7Pad(data []byte, blockSize int) []byte {
	padding := blockSize - (len(data) % blockSize)
	padBytes := make([]byte, padding)
	for i := range padBytes {
		padBytes[i] = byte(padding)
	}
	return append(data, padBytes...)
}
