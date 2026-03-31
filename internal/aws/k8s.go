package aws

import (
	"context"
	"encoding/base64"
	"fmt"
	"log"
	"sync"
	"time"

	"cloudterm-go/internal/config"

	awsv2 "github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/eks"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

// EKSCluster represents a discovered EKS cluster.
type EKSCluster struct {
	Name      string `json:"name"`
	Status    string `json:"status"`
	Version   string `json:"version"`
	Endpoint  string `json:"endpoint"`
	Region    string `json:"region"`
	AccountID string `json:"account_id"`
	CACert    string `json:"ca_cert"`
}

// EKSService discovers EKS clusters and generates auth tokens.
type EKSService struct {
	cfg      *config.Config
	accounts *AccountStore
	logger   *log.Logger
	cache    map[string]*eksCacheEntry
	mu       sync.RWMutex
}

type eksCacheEntry struct {
	clusters  []EKSCluster
	expiresAt time.Time
}

const eksCacheTTL = 2 * time.Minute

func NewEKSService(cfg *config.Config, accounts *AccountStore, logger *log.Logger) *EKSService {
	return &EKSService{
		cfg:      cfg,
		accounts: accounts,
		logger:   logger,
		cache:    make(map[string]*eksCacheEntry),
	}
}

// ListClusters discovers EKS clusters for a given account and region.
func (s *EKSService) ListClusters(ctx context.Context, accountID, region string) ([]EKSCluster, error) {
	cacheKey := fmt.Sprintf("%s:%s", accountID, region)

	s.mu.RLock()
	if entry, ok := s.cache[cacheKey]; ok && time.Now().Before(entry.expiresAt) {
		s.mu.RUnlock()
		return entry.clusters, nil
	}
	s.mu.RUnlock()

	awsCfg, err := s.awsConfigForAccount(ctx, accountID, region)
	if err != nil {
		return nil, fmt.Errorf("aws config for account %s: %w", accountID, err)
	}

	client := eks.NewFromConfig(awsCfg)
	listOut, err := client.ListClusters(ctx, &eks.ListClustersInput{})
	if err != nil {
		return nil, fmt.Errorf("list clusters in %s/%s: %w", accountID, region, err)
	}

	var clusters []EKSCluster
	for _, name := range listOut.Clusters {
		desc, err := client.DescribeCluster(ctx, &eks.DescribeClusterInput{Name: &name})
		if err != nil {
			s.logger.Printf("WARN: describe cluster %s: %v", name, err)
			continue
		}
		c := desc.Cluster
		cluster := EKSCluster{
			Name:      name,
			Status:    string(c.Status),
			Version:   derefStr(c.Version),
			Endpoint:  derefStr(c.Endpoint),
			Region:    region,
			AccountID: accountID,
		}
		if c.CertificateAuthority != nil {
			cluster.CACert = derefStr(c.CertificateAuthority.Data)
		}
		clusters = append(clusters, cluster)
	}

	s.mu.Lock()
	s.cache[cacheKey] = &eksCacheEntry{clusters: clusters, expiresAt: time.Now().Add(eksCacheTTL)}
	s.mu.Unlock()

	return clusters, nil
}

// GetToken generates a bearer token for authenticating to an EKS cluster.
// Uses the STS GetCallerIdentity presigned URL method (same as aws eks get-token).
func (s *EKSService) GetToken(ctx context.Context, accountID, region, clusterName string) (string, error) {
	awsCfg, err := s.awsConfigForAccount(ctx, accountID, region)
	if err != nil {
		return "", fmt.Errorf("aws config for token: %w", err)
	}

	stsClient := sts.NewFromConfig(awsCfg)
	presignClient := sts.NewPresignClient(stsClient)

	presigned, err := presignClient.PresignGetCallerIdentity(ctx, &sts.GetCallerIdentityInput{}, func(o *sts.PresignOptions) {
		o.ClientOptions = append(o.ClientOptions, func(opts *sts.Options) {
			opts.APIOptions = append(opts.APIOptions, addClusterIDHeader(clusterName))
		})
	})
	if err != nil {
		return "", fmt.Errorf("presign caller identity: %w", err)
	}

	token := "k8s-aws-v1." + base64.RawURLEncoding.EncodeToString([]byte(presigned.URL))
	return token, nil
}

// GetClusterCA returns the base64-decoded CA certificate for a cluster.
func (s *EKSService) GetClusterCA(ctx context.Context, accountID, region, clusterName string) ([]byte, error) {
	clusters, err := s.ListClusters(ctx, accountID, region)
	if err != nil {
		return nil, err
	}
	for _, c := range clusters {
		if c.Name == clusterName {
			return base64.StdEncoding.DecodeString(c.CACert)
		}
	}
	return nil, fmt.Errorf("cluster %s not found", clusterName)
}

func (s *EKSService) awsConfigForAccount(ctx context.Context, accountID, region string) (awsv2.Config, error) {
	acct, ok := s.accounts.Get(accountID)
	if !ok {
		return awsv2.Config{}, fmt.Errorf("account %s not found", accountID)
	}
	return awsconfig.LoadDefaultConfig(ctx,
		awsconfig.WithRegion(region),
		awsconfig.WithCredentialsProvider(credentials.NewStaticCredentialsProvider(
			acct.AccessKeyID,
			acct.SecretAccessKey,
			acct.SessionToken,
		)),
	)
}

func derefStr(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
