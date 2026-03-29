package handlers

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/client-go/kubernetes/scheme"
	"k8s.io/client-go/tools/remotecommand"
)

// handleK8sLogs streams container logs over WebSocket.
func (h *Handler) handleK8sLogs(w http.ResponseWriter, r *http.Request) {
	conn, err := h.getK8sConn(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	follow := r.URL.Query().Get("follow") == "true"
	tailLines := int64(100)

	if namespace == "" || pod == "" {
		http.Error(w, "namespace and pod required", http.StatusBadRequest)
		return
	}

	ws, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Printf("K8s logs WS upgrade: %v", err)
		return
	}
	defer ws.Close()

	opts := &corev1.PodLogOptions{
		Container:  container,
		Follow:     follow,
		Timestamps: true,
		TailLines:  &tailLines,
	}

	stream, err := conn.Client.CoreV1().Pods(namespace).GetLogs(pod, opts).Stream(r.Context())
	if err != nil {
		ws.WriteJSON(map[string]string{"error": err.Error()})
		return
	}
	defer stream.Close()

	// Read from log stream, write to WebSocket
	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Close on WS disconnect
	go func() {
		for {
			if _, _, err := ws.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	scanner := bufio.NewScanner(stream)
	for scanner.Scan() {
		select {
		case <-ctx.Done():
			return
		default:
			if err := ws.WriteJSON(map[string]string{"log": scanner.Text()}); err != nil {
				return
			}
		}
	}
}

// handleK8sExec provides a bi-directional terminal session into a container.
func (h *Handler) handleK8sExec(w http.ResponseWriter, r *http.Request) {
	conn, err := h.getK8sConn(r)
	if err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	namespace := r.URL.Query().Get("namespace")
	pod := r.URL.Query().Get("pod")
	container := r.URL.Query().Get("container")
	command := r.URL.Query().Get("command")
	if command == "" {
		command = "/bin/sh"
	}

	if namespace == "" || pod == "" {
		http.Error(w, "namespace and pod required", http.StatusBadRequest)
		return
	}

	ws, err := h.upgrader.Upgrade(w, r, nil)
	if err != nil {
		h.logger.Printf("K8s exec WS upgrade: %v", err)
		return
	}
	defer ws.Close()

	req := conn.Client.CoreV1().RESTClient().Post().
		Resource("pods").
		Name(pod).
		Namespace(namespace).
		SubResource("exec").
		VersionedParams(&corev1.PodExecOptions{
			Container: container,
			Command:   strings.Split(command, " "),
			Stdin:     true,
			Stdout:    true,
			Stderr:    true,
			TTY:       true,
		}, scheme.ParameterCodec)

	executor, err := remotecommand.NewSPDYExecutor(conn.RestCfg, "POST", req.URL())
	if err != nil {
		ws.WriteJSON(map[string]string{"error": fmt.Sprintf("exec setup: %v", err)})
		return
	}

	// Bidirectional pipe: WS ↔ K8s exec
	stdinR, stdinW := io.Pipe()
	stdoutR, stdoutW := io.Pipe()

	// WS → stdin
	go func() {
		defer stdinW.Close()
		for {
			_, msg, err := ws.ReadMessage()
			if err != nil {
				return
			}
			stdinW.Write(msg)
		}
	}()

	// stdout → WS
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := stdoutR.Read(buf)
			if n > 0 {
				ws.WriteMessage(1, buf[:n]) // TextMessage
			}
			if err != nil {
				return
			}
		}
	}()

	// Run exec with timeout context
	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Minute)
	defer cancel()

	err = executor.StreamWithContext(ctx, remotecommand.StreamOptions{
		Stdin:  stdinR,
		Stdout: stdoutW,
		Stderr: stdoutW,
		Tty:    true,
	})
	if err != nil {
		h.logger.Printf("K8s exec stream ended: %v", err)
	}
	stdoutW.Close()
}
