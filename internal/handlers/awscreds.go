package handlers

import (
	"context"
	"fmt"
	"strings"

	"cloudterm-go/internal/session"
	"cloudterm-go/internal/types"
)

// credsForProfile resolves the keys a child process (aws ssm start-session,
// the SSM forwarder) needs for an instance's account.
//
//   - role:<arn>  AssumeRole into CloudTermAccess; sessionName (the CloudTerm
//     user) is the STS session name, so CloudTrail shows who connected.
//   - manual:<id> long-lived keys kept only for migrated accounts.
//   - anything else is a shared ~/.aws profile, which hub mode refuses.
//
// A nil result with a nil error means "use the named shared profile".
func (h *Handler) credsForProfile(ctx context.Context, profile, sessionName string) (*session.AWSCreds, error) {
	switch {
	case strings.HasPrefix(profile, "role:"):
		arn := strings.TrimPrefix(profile, "role:")
		p, err := h.discovery.RoleProvider(ctx, arn, sessionName)
		if err != nil {
			return nil, fmt.Errorf("assume %s: %w", arn, err)
		}
		c, err := p.Retrieve(ctx)
		if err != nil {
			return nil, fmt.Errorf("assume %s: %w", arn, err)
		}
		return &session.AWSCreds{AccessKeyID: c.AccessKeyID, SecretAccessKey: c.SecretAccessKey, SessionToken: c.SessionToken}, nil
	case strings.HasPrefix(profile, "manual:"):
		id := strings.TrimPrefix(profile, "manual:")
		acct, ok := h.accounts.Get(id)
		if !ok {
			return nil, fmt.Errorf("account %s is not registered", id)
		}
		if h.discovery.HubMode() && !h.cfg.AllowAccessKeys {
			return nil, fmt.Errorf("access-key accounts are disabled; register the CloudTermAccess role for %s", acct.Name)
		}
		return &session.AWSCreds{AccessKeyID: acct.AccessKeyID, SecretAccessKey: acct.SecretAccessKey, SessionToken: acct.SessionToken}, nil
	default:
		if h.discovery.HubMode() {
			return nil, fmt.Errorf("profile %q is not allowed in hub mode; register the account's CloudTermAccess role", profile)
		}
		return nil, nil
	}
}

// applyForwarderCreds copies resolved keys onto an SSM forwarder request.
func applyForwarderCreds(req *types.ForwarderStartRequest, c *session.AWSCreds) {
	if c == nil {
		return
	}
	req.AWSAccessKeyID = c.AccessKeyID
	req.AWSSecretAccessKey = c.SecretAccessKey
	req.AWSSessionToken = c.SessionToken
}
