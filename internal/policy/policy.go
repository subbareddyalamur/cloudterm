package policy

import "strings"

type Role string

const (
	Admin    Role = "admin"
	Operator Role = "operator"
	Viewer   Role = "viewer"
)

type Decision struct {
	Allow  bool
	Reason string
}

// OpenSession decides whether this person may start SSH or RDP.
// Production can require an operator and an active recording.
func OpenSession(role Role, env string, recordingOn, requireRecordProd bool) Decision {
	if role == Viewer {
		return Decision{Reason: "viewers cannot open sessions"}
	}
	if role != Admin && role != Operator {
		return Decision{Reason: "unknown role"}
	}
	if requireRecordProd && isProd(env) && !recordingOn {
		return Decision{Reason: "production sessions must be recorded"}
	}
	return Decision{Allow: true}
}

func isProd(env string) bool {
	e := strings.ToLower(env)
	return strings.Contains(e, "prod")
}
