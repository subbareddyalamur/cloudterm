package tenant

import "testing"

func TestFromHost(t *testing.T) {
	if got := FromHost("localhost:5000"); got != "local" {
		t.Fatal(got)
	}
	if got := FromHost("acme.cloudterm.io"); got != "acme" {
		t.Fatal(got)
	}
	if got := FromHost("app.cloudterm.io"); got != "local" {
		t.Fatal(got)
	}
}
