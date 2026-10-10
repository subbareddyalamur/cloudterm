package policy

import "testing"

func TestProductionRequiresRecording(t *testing.T) {
	if d := OpenSession(Viewer, "dev", false, true); d.Allow {
		t.Fatal("viewer")
	}
	if d := OpenSession(Operator, "prod", false, true); d.Allow {
		t.Fatal("prod without recording")
	}
	if d := OpenSession(Operator, "prod", true, true); !d.Allow {
		t.Fatal(d.Reason)
	}
	if d := OpenSession(Operator, "dev", false, true); !d.Allow {
		t.Fatal("dev should not require recording")
	}
}
