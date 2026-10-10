package license

import (
	"path/filepath"
	"testing"
	"time"
)

func TestIssueRedeemAndVerify(t *testing.T) {
	c, err := NewController(filepath.Join(t.TempDir(), "lic.json"), []byte("seed-seed-seed-seed-seed-seed-seed"))
	if err != nil {
		t.Fatal(err)
	}
	rec, err := c.Issue("dep-1", "lab", 1, 5)
	if err != nil {
		t.Fatal(err)
	}
	if err := c.Redeem(rec.Key, "LAB-30"); err == nil {
		t.Fatal("internal coupon must stay disabled")
	}
	c.SetAllowInternal(true)
	before := rec.ExpiresAt
	if err := c.Redeem(rec.Key, "LAB-30"); err != nil {
		t.Fatal(err)
	}
	ent, packed, err := c.Heartbeat(rec.Key, "dep-1", 2)
	if err != nil {
		t.Fatal(err)
	}
	if ent.DaysRemaining < 30 {
		t.Fatalf("days %d", ent.DaysRemaining)
	}
	if !ent.ExpiresAt.After(before) {
		t.Fatal("coupon did not extend expiry")
	}
	got, err := Verify(c.PublicKey(), packed)
	if err != nil {
		t.Fatal(err)
	}
	if got.Plan != "lab" {
		t.Fatal(got.Plan)
	}
	if _, err := Verify(c.PublicKey(), packed+"x"); err == nil {
		t.Fatal("expected bad signature")
	}
}

func TestAllowBlocksExpiredSessions(t *testing.T) {
	var c Client
	if !c.Allow("ssh") {
		t.Fatal("unconfigured license should allow")
	}
	c.Store(Entitlement{
		Status: "expired", Plan: "team",
		ExpiresAt:  time.Now().Add(-48 * time.Hour),
		GraceUntil: time.Now().Add(-time.Hour),
	})
	if c.Allow("ssh") || c.Allow("rdp") || c.Allow("ai") {
		t.Fatal("expired past grace should block sessions")
	}
	if !c.Allow("audit") {
		t.Fatal("audit read stays available")
	}
}
