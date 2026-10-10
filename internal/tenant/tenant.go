package tenant

import (
	"context"
	"net/http"
	"strings"
	"sync"
	"time"
)

// FromHost returns the tenant slug from {tenant}.example.com.
// A bare host or localhost is the single-tenant deployment "local".
func FromHost(host string) string {
	host = strings.Split(host, ":")[0]
	if host == "" || host == "localhost" || strings.HasPrefix(host, "127.") {
		return "local"
	}
	parts := strings.Split(host, ".")
	if len(parts) < 3 {
		return "local"
	}
	switch parts[0] {
	case "app", "api", "www":
		return "local"
	default:
		return parts[0]
	}
}

type ctxKey struct{}

// ID is the tenant slug attached by Middleware.
func ID(r *http.Request) string {
	if v, ok := r.Context().Value(ctxKey{}).(string); ok && v != "" {
		return v
	}
	return FromHost(r.Host)
}

type limiter struct {
	mu     sync.Mutex
	hits   map[string][]time.Time
	limit  int
	window time.Duration
}

// Middleware caps requests per tenant per minute. It reads the tenant from the host.
func Middleware(perMinute int) func(http.Handler) http.Handler {
	l := &limiter{hits: map[string][]time.Time{}, limit: perMinute, window: time.Minute}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			id := FromHost(r.Host)
			if !l.allow(id) {
				http.Error(w, "rate limit", http.StatusTooManyRequests)
				return
			}
			r.Header.Set("X-CloudTerm-Tenant", id)
			next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), ctxKey{}, id)))
		})
	}
}

func (l *limiter) allow(id string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := time.Now()
	cut := now.Add(-l.window)
	prev := l.hits[id]
	kept := prev[:0]
	for _, t := range prev {
		if t.After(cut) {
			kept = append(kept, t)
		}
	}
	if len(kept) >= l.limit {
		l.hits[id] = kept
		return false
	}
	l.hits[id] = append(kept, now)
	return true
}
