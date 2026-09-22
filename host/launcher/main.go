// Command journal-host-launcher is a minimal Chrome Native Messaging host.
// It starts the Journal Node host from the directory containing this executable.
package main

import (
	"bufio"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
)

type message struct {
	Type string `json:"type"`
}

func readMessage(r io.Reader) (message, error) {
	var length uint32
	if err := binary.Read(r, binary.LittleEndian, &length); err != nil {
		return message{}, err
	}
	if length == 0 || length > 1024*1024 {
		return message{}, fmt.Errorf("invalid message length: %d", length)
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(r, payload); err != nil {
		return message{}, err
	}
	var msg message
	if err := json.Unmarshal(payload, &msg); err != nil {
		return message{}, err
	}
	return msg, nil
}

func writeMessage(w io.Writer, value any) error {
	payload, err := json.Marshal(value)
	if err != nil {
		return err
	}
	if err := binary.Write(w, binary.LittleEndian, uint32(len(payload))); err != nil {
		return err
	}
	_, err = w.Write(payload)
	return err
}

func nodeExecutable() string {
	candidates := []string{
		"/opt/homebrew/bin/node",
		"/usr/local/bin/node",
	}
	for _, path := range candidates {
		if info, err := os.Stat(path); err == nil && !info.IsDir() {
			return path
		}
	}
	if path, err := exec.LookPath("node"); err == nil {
		return path
	}
	return "node"
}

func startNode() error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	hostDir := filepath.Dir(exe)
	cmd := exec.Command(nodeExecutable(), "server.js")
	cmd.Dir = hostDir
	cmd.Stdin = nil
	cmd.Stdout = nil
	cmd.Stderr = nil
	hideWindow(cmd)
	return cmd.Start()
}

func main() {
	reader := bufio.NewReader(os.Stdin)
	msg, err := readMessage(reader)
	if err != nil {
		_ = writeMessage(os.Stdout, map[string]any{"type": "result", "success": false, "error": err.Error()})
		return
	}
	if msg.Type != "start" {
		_ = writeMessage(os.Stdout, map[string]any{"type": "result", "success": false, "error": "unsupported message type"})
		return
	}
	if err := startNode(); err != nil {
		_ = writeMessage(os.Stdout, map[string]any{"type": "result", "success": false, "error": err.Error()})
		return
	}
	_ = writeMessage(os.Stdout, map[string]any{"type": "result", "success": true})
}
