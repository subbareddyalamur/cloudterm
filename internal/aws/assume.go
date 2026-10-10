package aws

import (
	"context"
	"fmt"
	"sync"
	"time"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials/stscreds"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// noSharedFiles stops the SDK from reading ~/.aws/config and ~/.aws/credentials.
// A non-nil empty slice is honored by the SDK as "no files".
func noSharedFiles() []func(*awsconfig.LoadOptions) error {
	return []func(*awsconfig.LoadOptions) error{
		awsconfig.WithSharedConfigFiles([]string{}),
		awsconfig.WithSharedCredentialsFiles([]string{}),
	}
}

// Assumer calls STS AssumeRole into each customer account's CloudTermAccess role.
//
// In hub mode the starting identity is the server's own role (ECS task role,
// EC2 instance profile, or environment credentials) and ~/.aws is never read.
// hubProfile exists only for local development, where there is no task role.
type Assumer struct {
	externalID string
	hubOnly    bool
	hubProfile string
	mu         sync.Mutex
	providers  map[string]aws.CredentialsProvider
}

func NewAssumer(externalID string) *Assumer {
	return &Assumer{externalID: externalID, providers: map[string]aws.CredentialsProvider{}}
}

// UseHub makes every AssumeRole start from the hub identity instead of shared profiles.
func (a *Assumer) UseHub(hubProfile string) {
	a.mu.Lock()
	a.hubOnly = true
	a.hubProfile = hubProfile
	a.providers = map[string]aws.CredentialsProvider{}
	a.mu.Unlock()
}

// BaseConfig is the hub identity used to call STS.
func (a *Assumer) BaseConfig(ctx context.Context, region string) (aws.Config, error) {
	opts := []func(*awsconfig.LoadOptions) error{awsconfig.WithRegion(region)}
	a.mu.Lock()
	hubOnly, hubProfile := a.hubOnly, a.hubProfile
	a.mu.Unlock()
	if hubOnly {
		if hubProfile != "" {
			opts = append(opts, awsconfig.WithSharedConfigProfile(hubProfile))
		} else {
			opts = append(opts, noSharedFiles()...)
		}
	}
	return awsconfig.LoadDefaultConfig(ctx, opts...)
}

// Provider returns a refreshing credentials provider for one role. Credentials are
// cached and renewed before they expire; the session name is the CloudTerm user.
func (a *Assumer) Provider(ctx context.Context, roleARN, sessionName, externalID string) (aws.CredentialsProvider, error) {
	if externalID == "" {
		externalID = a.externalID
	}
	if sessionName == "" {
		sessionName = "cloudterm"
	}
	key := roleARN + "|" + sessionName + "|" + externalID
	a.mu.Lock()
	if p, ok := a.providers[key]; ok {
		a.mu.Unlock()
		return p, nil
	}
	a.mu.Unlock()

	base, err := a.BaseConfig(ctx, "us-east-1")
	if err != nil {
		return nil, fmt.Errorf("hub identity: %w", err)
	}
	p := aws.NewCredentialsCache(stscreds.NewAssumeRoleProvider(sts.NewFromConfig(base), roleARN, func(o *stscreds.AssumeRoleOptions) {
		o.RoleSessionName = safeSessionName(sessionName)
		o.ExternalID = aws.String(externalID)
		o.Duration = time.Hour
	}), func(o *aws.CredentialsCacheOptions) {
		o.ExpiryWindow = 10 * time.Minute
	})
	a.mu.Lock()
	a.providers[key] = p
	a.mu.Unlock()
	return p, nil
}

// Credentials returns current temporary keys for a role, for processes such as
// the AWS CLI that need them as environment variables.
func (a *Assumer) Credentials(ctx context.Context, roleARN, sessionName, region, externalID string) (string, string, string, error) {
	p, err := a.Provider(ctx, roleARN, sessionName, externalID)
	if err != nil {
		return "", "", "", err
	}
	c, err := p.Retrieve(ctx)
	if err != nil {
		return "", "", "", err
	}
	_ = region
	return c.AccessKeyID, c.SecretAccessKey, c.SessionToken, nil
}

// Verify assumes the role and asks STS who it is. The error text is what an
// admin needs to fix the trust policy.
func (a *Assumer) Verify(ctx context.Context, roleARN, externalID string) (string, string, error) {
	p, err := a.Provider(ctx, roleARN, "cloudterm-verify", externalID)
	if err != nil {
		return "", "", err
	}
	cfg, err := awsconfig.LoadDefaultConfig(ctx, append(noSharedFiles(), awsconfig.WithRegion("us-east-1"), awsconfig.WithCredentialsProvider(p))...)
	if err != nil {
		return "", "", err
	}
	out, err := sts.NewFromConfig(cfg).GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil {
		return "", "", err
	}
	return aws.ToString(out.Account), aws.ToString(out.Arn), nil
}

// safeSessionName keeps an STS RoleSessionName within [\w+=,.@-]{2,64}.
func safeSessionName(s string) string {
	out := make([]rune, 0, len(s))
	for _, r := range s {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9',
			r == '+', r == '=', r == ',', r == '.', r == '@', r == '-', r == '_':
			out = append(out, r)
		default:
			out = append(out, '-')
		}
	}
	if len(out) < 2 {
		return "cloudterm"
	}
	if len(out) > 64 {
		out = out[:64]
	}
	return string(out)
}
