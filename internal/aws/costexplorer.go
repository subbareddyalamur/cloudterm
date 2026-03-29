package aws

import (
	"context"
	"crypto/sha256"
	"fmt"
	"log"
	"sort"
	"strings"
	"sync"
	"time"

	"cloudterm-go/internal/config"

	"github.com/aws/aws-sdk-go-v2/aws"
	awsconfig "github.com/aws/aws-sdk-go-v2/config"
	"github.com/aws/aws-sdk-go-v2/credentials"
	"github.com/aws/aws-sdk-go-v2/service/costexplorer"
	cetypes "github.com/aws/aws-sdk-go-v2/service/costexplorer/types"
	"github.com/aws/aws-sdk-go-v2/service/iam"
	"github.com/aws/aws-sdk-go-v2/service/sts"
)

type CostExplorerService struct {
	cfg      *config.Config
	accounts *AccountStore
	logger   *log.Logger
	cache    map[string]*costCacheEntry
	mu       sync.RWMutex
}

type costCacheEntry struct {
	data      interface{}
	expiresAt time.Time
}

const costCacheTTL = 5 * time.Minute

type CostQueryParams struct {
	Start       string      `json:"start"`
	End         string      `json:"end"`
	Granularity string      `json:"granularity"`
	Accounts    []string    `json:"accounts,omitempty"`
	Services    []string    `json:"services,omitempty"`
	Regions     []string    `json:"regions,omitempty"`
	TagFilters  []TagFilter `json:"tag_filters,omitempty"`
}

type TagFilter struct {
	Key    string   `json:"key"`
	Values []string `json:"values"`
}

type CostSummary struct {
	TotalCost     float64  `json:"total_cost"`
	PreviousCost  float64  `json:"previous_cost"`
	ChangePercent float64  `json:"change_percent"`
	TopService    CostItem `json:"top_service"`
	TopAccount    CostItem `json:"top_account"`
	Currency      string   `json:"currency"`
	ServiceCount  int      `json:"service_count"`
	AccountCount  int      `json:"account_count"`
}

type CostItem struct {
	Name string  `json:"name"`
	Cost float64 `json:"cost"`
}

type CostBreakdown struct {
	Items    []CostItem `json:"items"`
	Total    float64    `json:"total"`
	Currency string     `json:"currency"`
}

type CostTrendPoint struct {
	Date     string             `json:"date"`
	Total    float64            `json:"total"`
	Services map[string]float64 `json:"services"`
}

type CostTrend struct {
	Points       []CostTrendPoint `json:"points"`
	ServiceNames []string         `json:"service_names"`
	Currency     string           `json:"currency"`
}

type CostDetailRow struct {
	Account  string  `json:"account"`
	Service  string  `json:"service"`
	Cost     float64 `json:"cost"`
	Currency string  `json:"currency"`
}

type CostDetails struct {
	Rows     []CostDetailRow `json:"rows"`
	Total    float64         `json:"total"`
	Currency string          `json:"currency"`
}

type ComprehensiveCost struct {
	Accounts         []AccountCost           `json:"accounts"`
	TotalLastMonth   float64                 `json:"total_last_month"`
	TotalThisMonth   float64                 `json:"total_this_month"`
	TotalLast7Days   float64                 `json:"total_last_7_days"`
	TotalYesterday   float64                 `json:"total_yesterday"`
	TotalDayBefore   float64                 `json:"total_day_before"`
	ServiceBreakdown []ServiceCostRow        `json:"service_breakdown"`
	RegionBreakdown  []RegionCostRow         `json:"region_breakdown"`
	TagBreakdown     map[string][]TagCostRow `json:"tag_breakdown"`
	DailyTrend       []DailyPoint            `json:"daily_trend"`
	TopCostDrivers   []CostDriver            `json:"top_cost_drivers"`
	Currency         string                  `json:"currency"`
}

type AccountCost struct {
	AccountID string  `json:"account_id"`
	Alias     string  `json:"alias"`
	LastMonth float64 `json:"last_month"`
	ThisMonth float64 `json:"this_month"`
	Last7Days float64 `json:"last_7_days"`
	Yesterday float64 `json:"yesterday"`
}

type ServiceCostRow struct {
	Service   string  `json:"service"`
	Account   string  `json:"account"`
	LastMonth float64 `json:"last_month"`
	ThisMonth float64 `json:"this_month"`
	Last7Days float64 `json:"last_7_days"`
	Yesterday float64 `json:"yesterday"`
}

type TagCostRow struct {
	Value     string  `json:"value"`
	Account   string  `json:"account"`
	LastMonth float64 `json:"last_month"`
	ThisMonth float64 `json:"this_month"`
	Last7Days float64 `json:"last_7_days"`
	Yesterday float64 `json:"yesterday"`
}

type RegionCostRow struct {
	Region    string  `json:"region"`
	Account   string  `json:"account"`
	ThisMonth float64 `json:"this_month"`
	LastMonth float64 `json:"last_month"`
}

type DailyPoint struct {
	Date string  `json:"date"`
	Cost float64 `json:"cost"`
}

type CostDriver struct {
	Service    string  `json:"service"`
	ThisMonth  float64 `json:"this_month"`
	Percentage float64 `json:"percentage"`
	Change     float64 `json:"change"`
}

type CostFilters struct {
	Accounts  []AccountInfo       `json:"accounts"`
	Services  []string            `json:"services"`
	Regions   []string            `json:"regions"`
	TagKeys   []string            `json:"tag_keys"`
	TagValues map[string][]string `json:"tag_values"`
}

type AccountInfo struct {
	AccountID string `json:"account_id"`
	Alias     string `json:"alias"`
	Profile   string `json:"profile"`
}

func NewCostExplorerService(cfg *config.Config, accounts *AccountStore, logger *log.Logger) *CostExplorerService {
	return &CostExplorerService{
		cfg:      cfg,
		accounts: accounts,
		logger:   logger,
		cache:    make(map[string]*costCacheEntry),
	}
}

func cacheKey(endpoint string, params CostQueryParams) string {
	raw := fmt.Sprintf("%s|%s|%s|%s|%v|%v|%v|%v",
		endpoint, params.Start, params.End, params.Granularity,
		params.Accounts, params.Services, params.Regions, params.TagFilters)
	h := sha256.Sum256([]byte(raw))
	return fmt.Sprintf("%x", h[:8])
}

func (s *CostExplorerService) getCached(key string) (interface{}, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	entry, ok := s.cache[key]
	if !ok || time.Now().After(entry.expiresAt) {
		return nil, false
	}
	return entry.data, true
}

func (s *CostExplorerService) setCache(key string, data interface{}) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.cache[key] = &costCacheEntry{
		data:      data,
		expiresAt: time.Now().Add(costCacheTTL),
	}
}

type ceClientInfo struct {
	client    *costexplorer.Client
	accountID string
	alias     string
	profile   string
}

func (s *CostExplorerService) buildCEClients(ctx context.Context) []ceClientInfo {
	var clients []ceClientInfo
	seen := make(map[string]bool)

	profiles := parseAWSProfiles()
	for _, profile := range profiles {
		awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
			awsconfig.WithRegion("us-east-1"),
			awsconfig.WithSharedConfigProfile(profile),
		)
		if err != nil {
			s.logger.Printf("Cost explorer: failed to load profile %s: %v", profile, err)
			continue
		}

		accountID, alias := resolveAccountInfo(ctx, awsCfg)
		if accountID != "" && seen[accountID] {
			continue
		}
		if accountID != "" {
			seen[accountID] = true
		}

		clients = append(clients, ceClientInfo{
			client:    costexplorer.NewFromConfig(awsCfg),
			accountID: accountID,
			alias:     alias,
			profile:   profile,
		})
	}

	if s.accounts != nil {
		for _, acct := range s.accounts.ListRaw() {
			credProvider := credentials.NewStaticCredentialsProvider(
				acct.AccessKeyID, acct.SecretAccessKey, acct.SessionToken,
			)
			awsCfg, err := awsconfig.LoadDefaultConfig(ctx,
				awsconfig.WithRegion("us-east-1"),
				awsconfig.WithCredentialsProvider(credProvider),
			)
			if err != nil {
				s.logger.Printf("Cost explorer: failed to load manual account %s: %v", acct.Name, err)
				continue
			}

			accountID, alias := resolveAccountInfo(ctx, awsCfg)
			if accountID != "" && seen[accountID] {
				continue
			}
			if accountID != "" {
				seen[accountID] = true
			}
			if alias == "" {
				alias = acct.Name
			}

			clients = append(clients, ceClientInfo{
				client:    costexplorer.NewFromConfig(awsCfg),
				accountID: accountID,
				alias:     alias,
				profile:   "manual:" + acct.ID,
			})
		}
	}

	return clients
}

func resolveAccountInfo(ctx context.Context, cfg aws.Config) (string, string) {
	stsClient := sts.NewFromConfig(cfg)
	identity, err := stsClient.GetCallerIdentity(ctx, &sts.GetCallerIdentityInput{})
	if err != nil {
		return "", ""
	}
	accountID := ""
	if identity.Account != nil {
		accountID = *identity.Account
	}

	alias := ""
	iamClient := iam.NewFromConfig(cfg)
	aliases, err := iamClient.ListAccountAliases(ctx, &iam.ListAccountAliasesInput{})
	if err == nil && len(aliases.AccountAliases) > 0 {
		alias = aliases.AccountAliases[0]
	}

	return accountID, alias
}

// recordTypeExcludeFilter excludes Credit, Refund, Upfront, Support line items
// (matches aws-cost-cli behavior for accurate cost reporting).
var recordTypeExcludeFilter = &cetypes.Expression{
	Not: &cetypes.Expression{
		Dimensions: &cetypes.DimensionValues{
			Key:    cetypes.DimensionRecordType,
			Values: []string{"Credit", "Refund", "Upfront", "Support"},
		},
	},
}

// BuildFilter constructs a CE Expression combining user filters with the
// standard record-type exclusion. Every query excludes credits/refunds.
func BuildFilter(params CostQueryParams) *cetypes.Expression {
	var userFilters []cetypes.Expression

	if len(params.Accounts) > 0 {
		userFilters = append(userFilters, cetypes.Expression{
			Dimensions: &cetypes.DimensionValues{
				Key:    cetypes.DimensionLinkedAccount,
				Values: params.Accounts,
			},
		})
	}

	if len(params.Services) > 0 {
		userFilters = append(userFilters, cetypes.Expression{
			Dimensions: &cetypes.DimensionValues{
				Key:    cetypes.DimensionService,
				Values: params.Services,
			},
		})
	}

	if len(params.Regions) > 0 {
		userFilters = append(userFilters, cetypes.Expression{
			Dimensions: &cetypes.DimensionValues{
				Key:    cetypes.DimensionRegion,
				Values: params.Regions,
			},
		})
	}

	for _, tf := range params.TagFilters {
		if tf.Key == "" || len(tf.Values) == 0 {
			continue
		}
		userFilters = append(userFilters, cetypes.Expression{
			Tags: &cetypes.TagValues{
				Key:    aws.String(tf.Key),
				Values: tf.Values,
			},
		})
	}

	allFilters := []cetypes.Expression{*recordTypeExcludeFilter}
	allFilters = append(allFilters, userFilters...)

	if len(allFilters) == 1 {
		return &allFilters[0]
	}
	return &cetypes.Expression{
		And: allFilters,
	}
}

func granularity(s string) cetypes.Granularity {
	switch strings.ToUpper(s) {
	case "DAILY":
		return cetypes.GranularityDaily
	case "MONTHLY":
		return cetypes.GranularityMonthly
	default:
		return cetypes.GranularityMonthly
	}
}

type ceResult struct {
	accountID   string
	displayName string
	output      *costexplorer.GetCostAndUsageOutput
	err         error
}

// queryAllAccounts runs the same GetCostAndUsage query against every unique
// account in parallel and collects the results. Each account is queried
// independently because accounts may belong to different AWS Organizations.
func (s *CostExplorerService) queryAllAccounts(ctx context.Context, buildInput func() *costexplorer.GetCostAndUsageInput) ([]ceResult, map[string]string) {
	clients := s.buildCEClients(ctx)
	if len(clients) == 0 {
		return nil, nil
	}

	aliasMap := make(map[string]string)
	for _, ci := range clients {
		if ci.accountID != "" && ci.alias != "" {
			aliasMap[ci.accountID] = ci.alias
		}
	}

	results := make([]ceResult, len(clients))
	var wg sync.WaitGroup

	for i, ci := range clients {
		wg.Add(1)
		go func(idx int, ci ceClientInfo) {
			defer wg.Done()
			input := buildInput()
			output, err := ci.client.GetCostAndUsage(ctx, input)
			displayName := ci.accountID
			if ci.alias != "" {
				displayName = fmt.Sprintf("%s (%s)", ci.alias, ci.accountID)
			}
			results[idx] = ceResult{
				accountID:   ci.accountID,
				displayName: displayName,
				output:      output,
				err:         err,
			}
			if err != nil {
				s.logger.Printf("Cost explorer: query failed for %s (%s): %v", ci.profile, ci.accountID, err)
			}
		}(i, ci)
	}
	wg.Wait()

	return results, aliasMap
}

func (s *CostExplorerService) GetSummary(ctx context.Context, params CostQueryParams) (*CostSummary, error) {
	key := cacheKey("summary", params)
	if cached, ok := s.getCached(key); ok {
		return cached.(*CostSummary), nil
	}

	byService, err := s.GetCostByService(ctx, params)
	if err != nil {
		return nil, err
	}

	byAccount, err := s.GetCostByAccount(ctx, params)
	if err != nil {
		return nil, err
	}

	prevParams := previousPeriod(params)
	prevByService, _ := s.GetCostByService(ctx, prevParams)
	prevTotal := 0.0
	if prevByService != nil {
		prevTotal = prevByService.Total
	}

	summary := &CostSummary{
		TotalCost:    byService.Total,
		PreviousCost: prevTotal,
		Currency:     byService.Currency,
		ServiceCount: len(byService.Items),
		AccountCount: len(byAccount.Items),
	}

	if prevTotal > 0 {
		summary.ChangePercent = ((byService.Total - prevTotal) / prevTotal) * 100
	}

	if len(byService.Items) > 0 {
		summary.TopService = byService.Items[0]
	}
	if len(byAccount.Items) > 0 {
		summary.TopAccount = byAccount.Items[0]
	}

	s.setCache(key, summary)
	return summary, nil
}

func (s *CostExplorerService) GetCostByService(ctx context.Context, params CostQueryParams) (*CostBreakdown, error) {
	key := cacheKey("by-service", params)
	if cached, ok := s.getCached(key); ok {
		return cached.(*CostBreakdown), nil
	}

	results, _ := s.queryAllAccounts(ctx, func() *costexplorer.GetCostAndUsageInput {
		return &costexplorer.GetCostAndUsageInput{
			TimePeriod:  &cetypes.DateInterval{Start: aws.String(params.Start), End: aws.String(params.End)},
			Granularity: cetypes.GranularityMonthly,
			Metrics:     []string{"UnblendedCost"},
			GroupBy:     []cetypes.GroupDefinition{{Type: cetypes.GroupDefinitionTypeDimension, Key: aws.String("SERVICE")}},
			Filter:      BuildFilter(params),
		}
	})

	aggregated := make(map[string]float64)
	currency := "USD"
	for _, r := range results {
		if r.err != nil || r.output == nil {
			continue
		}
		for _, rbt := range r.output.ResultsByTime {
			for _, group := range rbt.Groups {
				svcName := ""
				if len(group.Keys) > 0 {
					svcName = group.Keys[0]
				}
				if metrics, ok := group.Metrics["UnblendedCost"]; ok && metrics.Amount != nil {
					aggregated[svcName] += parseFloat(*metrics.Amount)
					if metrics.Unit != nil {
						currency = *metrics.Unit
					}
				}
			}
		}
	}

	breakdown := buildBreakdown(aggregated, currency)
	s.setCache(key, breakdown)
	return breakdown, nil
}

func (s *CostExplorerService) GetCostByAccount(ctx context.Context, params CostQueryParams) (*CostBreakdown, error) {
	key := cacheKey("by-account", params)
	if cached, ok := s.getCached(key); ok {
		return cached.(*CostBreakdown), nil
	}

	results, aliasMap := s.queryAllAccounts(ctx, func() *costexplorer.GetCostAndUsageInput {
		return &costexplorer.GetCostAndUsageInput{
			TimePeriod:  &cetypes.DateInterval{Start: aws.String(params.Start), End: aws.String(params.End)},
			Granularity: cetypes.GranularityMonthly,
			Metrics:     []string{"UnblendedCost"},
			GroupBy:     []cetypes.GroupDefinition{{Type: cetypes.GroupDefinitionTypeDimension, Key: aws.String("LINKED_ACCOUNT")}},
			Filter:      BuildFilter(params),
		}
	})

	aggregated := make(map[string]float64)
	currency := "USD"
	seen := make(map[string]bool)
	for _, r := range results {
		if r.err != nil || r.output == nil {
			continue
		}
		for _, rbt := range r.output.ResultsByTime {
			for _, group := range rbt.Groups {
				acctID := ""
				if len(group.Keys) > 0 {
					acctID = group.Keys[0]
				}
				if seen[acctID] {
					continue
				}
				displayName := acctID
				if alias, ok := aliasMap[acctID]; ok {
					displayName = fmt.Sprintf("%s (%s)", alias, acctID)
				}
				if metrics, ok := group.Metrics["UnblendedCost"]; ok && metrics.Amount != nil {
					aggregated[displayName] += parseFloat(*metrics.Amount)
					if metrics.Unit != nil {
						currency = *metrics.Unit
					}
				}
			}
		}
		for _, rbt := range r.output.ResultsByTime {
			for _, group := range rbt.Groups {
				if len(group.Keys) > 0 {
					seen[group.Keys[0]] = true
				}
			}
		}
	}

	breakdown := buildBreakdown(aggregated, currency)
	s.setCache(key, breakdown)
	return breakdown, nil
}

func (s *CostExplorerService) GetCostByTag(ctx context.Context, params CostQueryParams, tagKey string) (*CostBreakdown, error) {
	tagParams := params
	tagParams.Granularity = "MONTHLY"
	key := cacheKey("by-tag-"+tagKey, tagParams)
	if cached, ok := s.getCached(key); ok {
		return cached.(*CostBreakdown), nil
	}

	results, _ := s.queryAllAccounts(ctx, func() *costexplorer.GetCostAndUsageInput {
		return &costexplorer.GetCostAndUsageInput{
			TimePeriod:  &cetypes.DateInterval{Start: aws.String(tagParams.Start), End: aws.String(tagParams.End)},
			Granularity: cetypes.GranularityMonthly,
			Metrics:     []string{"UnblendedCost"},
			GroupBy:     []cetypes.GroupDefinition{{Type: cetypes.GroupDefinitionTypeTag, Key: aws.String(tagKey)}},
			Filter:      BuildFilter(tagParams),
		}
	})

	aggregated := make(map[string]float64)
	currency := "USD"
	for _, r := range results {
		if r.err != nil || r.output == nil {
			continue
		}
		for _, rbt := range r.output.ResultsByTime {
			for _, group := range rbt.Groups {
				tagVal := "(untagged)"
				if len(group.Keys) > 0 {
					parts := strings.SplitN(group.Keys[0], "$", 2)
					if len(parts) == 2 && parts[1] != "" {
						tagVal = parts[1]
					}
				}
				if metrics, ok := group.Metrics["UnblendedCost"]; ok && metrics.Amount != nil {
					aggregated[tagVal] += parseFloat(*metrics.Amount)
					if metrics.Unit != nil {
						currency = *metrics.Unit
					}
				}
			}
		}
	}

	breakdown := buildBreakdown(aggregated, currency)
	s.setCache(key, breakdown)
	return breakdown, nil
}

func (s *CostExplorerService) GetTrend(ctx context.Context, params CostQueryParams) (*CostTrend, error) {
	key := cacheKey("trend", params)
	if cached, ok := s.getCached(key); ok {
		return cached.(*CostTrend), nil
	}

	results, _ := s.queryAllAccounts(ctx, func() *costexplorer.GetCostAndUsageInput {
		return &costexplorer.GetCostAndUsageInput{
			TimePeriod:  &cetypes.DateInterval{Start: aws.String(params.Start), End: aws.String(params.End)},
			Granularity: granularity(params.Granularity),
			Metrics:     []string{"UnblendedCost"},
			GroupBy:     []cetypes.GroupDefinition{{Type: cetypes.GroupDefinitionTypeDimension, Key: aws.String("SERVICE")}},
			Filter:      BuildFilter(params),
		}
	})

	type pointData struct {
		services map[string]float64
		total    float64
	}
	points := make(map[string]*pointData)
	currency := "USD"

	for _, r := range results {
		if r.err != nil || r.output == nil {
			continue
		}
		for _, rbt := range r.output.ResultsByTime {
			date := ""
			if rbt.TimePeriod != nil && rbt.TimePeriod.Start != nil {
				date = *rbt.TimePeriod.Start
			}
			if date == "" {
				continue
			}
			pt, ok := points[date]
			if !ok {
				pt = &pointData{services: make(map[string]float64)}
				points[date] = pt
			}
			for _, group := range rbt.Groups {
				svcName := ""
				if len(group.Keys) > 0 {
					svcName = group.Keys[0]
				}
				if metrics, ok := group.Metrics["UnblendedCost"]; ok && metrics.Amount != nil {
					amount := parseFloat(*metrics.Amount)
					pt.services[svcName] += amount
					pt.total += amount
					if metrics.Unit != nil {
						currency = *metrics.Unit
					}
				}
			}
		}
	}

	dates := make([]string, 0, len(points))
	for d := range points {
		dates = append(dates, d)
	}
	sort.Strings(dates)

	serviceTotals := make(map[string]float64)
	for _, pt := range points {
		for svc, cost := range pt.services {
			serviceTotals[svc] += cost
		}
	}
	topServices := topN(serviceTotals, 10)

	trendPoints := make([]CostTrendPoint, 0, len(dates))
	for _, date := range dates {
		pt := points[date]
		svcMap := make(map[string]float64)
		otherCost := 0.0
		for svc, cost := range pt.services {
			if contains(topServices, svc) {
				svcMap[svc] = cost
			} else {
				otherCost += cost
			}
		}
		if otherCost > 0.01 {
			svcMap["Other"] = otherCost
		}
		trendPoints = append(trendPoints, CostTrendPoint{
			Date:     date,
			Total:    pt.total,
			Services: svcMap,
		})
	}

	serviceNames := append(topServices, "Other")

	trend := &CostTrend{
		Points:       trendPoints,
		ServiceNames: serviceNames,
		Currency:     currency,
	}
	s.setCache(key, trend)
	return trend, nil
}

func (s *CostExplorerService) GetDetails(ctx context.Context, params CostQueryParams) (*CostDetails, error) {
	key := cacheKey("details", params)
	if cached, ok := s.getCached(key); ok {
		return cached.(*CostDetails), nil
	}

	results, aliasMap := s.queryAllAccounts(ctx, func() *costexplorer.GetCostAndUsageInput {
		return &costexplorer.GetCostAndUsageInput{
			TimePeriod:  &cetypes.DateInterval{Start: aws.String(params.Start), End: aws.String(params.End)},
			Granularity: cetypes.GranularityMonthly,
			Metrics:     []string{"UnblendedCost"},
			GroupBy: []cetypes.GroupDefinition{
				{Type: cetypes.GroupDefinitionTypeDimension, Key: aws.String("LINKED_ACCOUNT")},
				{Type: cetypes.GroupDefinitionTypeDimension, Key: aws.String("SERVICE")},
			},
			Filter: BuildFilter(params),
		}
	})

	type rowKey struct{ account, service string }
	aggregated := make(map[rowKey]float64)
	currency := "USD"
	for _, r := range results {
		if r.err != nil || r.output == nil {
			continue
		}
		for _, rbt := range r.output.ResultsByTime {
			for _, group := range rbt.Groups {
				acctID, svc := "", ""
				if len(group.Keys) > 0 {
					acctID = group.Keys[0]
				}
				if len(group.Keys) > 1 {
					svc = group.Keys[1]
				}
				displayAccount := acctID
				if alias, ok := aliasMap[acctID]; ok {
					displayAccount = fmt.Sprintf("%s (%s)", alias, acctID)
				}
				if metrics, ok := group.Metrics["UnblendedCost"]; ok && metrics.Amount != nil {
					aggregated[rowKey{displayAccount, svc}] += parseFloat(*metrics.Amount)
					if metrics.Unit != nil {
						currency = *metrics.Unit
					}
				}
			}
		}
	}

	var rows []CostDetailRow
	total := 0.0
	for rk, cost := range aggregated {
		if cost < 0.01 {
			continue
		}
		rows = append(rows, CostDetailRow{
			Account:  rk.account,
			Service:  rk.service,
			Cost:     cost,
			Currency: currency,
		})
		total += cost
	}

	sort.Slice(rows, func(i, j int) bool { return rows[i].Cost > rows[j].Cost })

	details := &CostDetails{Rows: rows, Total: total, Currency: currency}
	s.setCache(key, details)
	return details, nil
}

func (s *CostExplorerService) GetFilters(ctx context.Context, start, end string) (*CostFilters, error) {
	key := cacheKey("filters", CostQueryParams{Start: start, End: end})
	if cached, ok := s.getCached(key); ok {
		return cached.(*CostFilters), nil
	}

	clients := s.buildCEClients(ctx)
	if len(clients) == 0 {
		return &CostFilters{TagValues: make(map[string][]string)}, nil
	}

	filters := &CostFilters{
		TagValues: make(map[string][]string),
	}

	for _, ci := range clients {
		filters.Accounts = append(filters.Accounts, AccountInfo{
			AccountID: ci.accountID,
			Alias:     ci.alias,
			Profile:   ci.profile,
		})
	}

	serviceSet := make(map[string]bool)
	regionSet := make(map[string]bool)
	tagValSets := make(map[string]map[string]bool)
	standardTagKeys := []string{"Customer", "ProjectCode", "Environment", "Application", "Workload"}
	for _, k := range standardTagKeys {
		tagValSets[k] = make(map[string]bool)
	}

	var mu sync.Mutex
	var wg sync.WaitGroup

	for _, ci := range clients {
		wg.Add(1)
		go func(ci ceClientInfo) {
			defer wg.Done()

			svcOut, err := ci.client.GetDimensionValues(ctx, &costexplorer.GetDimensionValuesInput{
				TimePeriod: &cetypes.DateInterval{Start: aws.String(start), End: aws.String(end)},
				Dimension:  cetypes.DimensionService,
			})
			if err == nil {
				mu.Lock()
				for _, v := range svcOut.DimensionValues {
					if v.Value != nil {
						serviceSet[*v.Value] = true
					}
				}
				mu.Unlock()
			}

			regOut, err := ci.client.GetDimensionValues(ctx, &costexplorer.GetDimensionValuesInput{
				TimePeriod: &cetypes.DateInterval{Start: aws.String(start), End: aws.String(end)},
				Dimension:  cetypes.DimensionRegion,
			})
			if err == nil {
				mu.Lock()
				for _, v := range regOut.DimensionValues {
					if v.Value != nil {
						regionSet[*v.Value] = true
					}
				}
				mu.Unlock()
			}

			for _, tagKey := range standardTagKeys {
				tagOut, err := ci.client.GetTags(ctx, &costexplorer.GetTagsInput{
					TimePeriod: &cetypes.DateInterval{Start: aws.String(start), End: aws.String(end)},
					TagKey:     aws.String(tagKey),
				})
				if err == nil {
					mu.Lock()
					for _, t := range tagOut.Tags {
						tagValSets[tagKey][t] = true
					}
					mu.Unlock()
				}
			}
		}(ci)
	}
	wg.Wait()

	for s := range serviceSet {
		filters.Services = append(filters.Services, s)
	}
	for r := range regionSet {
		filters.Regions = append(filters.Regions, r)
	}
	filters.TagKeys = standardTagKeys
	for _, k := range standardTagKeys {
		for v := range tagValSets[k] {
			filters.TagValues[k] = append(filters.TagValues[k], v)
		}
		sort.Strings(filters.TagValues[k])
	}

	sort.Strings(filters.Services)
	sort.Strings(filters.Regions)

	s.setCache(key, filters)
	return filters, nil
}

func (s *CostExplorerService) GetComprehensive(ctx context.Context) (*ComprehensiveCost, error) {
	key := cacheKey("comprehensive", CostQueryParams{})
	if cached, ok := s.getCached(key); ok {
		return cached.(*ComprehensiveCost), nil
	}

	clients := s.buildCEClients(ctx)
	if len(clients) == 0 {
		return &ComprehensiveCost{Currency: "USD", TagBreakdown: make(map[string][]TagCostRow)}, nil
	}

	now := time.Now()
	yesterday := now.AddDate(0, 0, -1)
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
	startOfThisMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, time.UTC)
	startOfLastMonth := startOfThisMonth.AddDate(0, -1, 0)
	sevenDaysAgo := yesterday.AddDate(0, 0, -6)
	queryEnd := today.Format("2006-01-02")

	type acctData struct {
		accountID    string
		alias        string
		serviceCosts map[string]map[string]float64
		regionCosts  map[string]map[string]float64
		tagCosts     map[string]map[string]map[string]float64
		err          error
	}

	allData := make([]acctData, len(clients))
	var wg sync.WaitGroup

	for i, ci := range clients {
		wg.Add(1)
		go func(idx int, ci ceClientInfo) {
			defer wg.Done()
			ad := acctData{
				accountID:    ci.accountID,
				alias:        ci.alias,
				serviceCosts: make(map[string]map[string]float64),
				tagCosts:     make(map[string]map[string]map[string]float64),
			}

			svcResult, err := ci.client.GetCostAndUsage(ctx, &costexplorer.GetCostAndUsageInput{
				TimePeriod: &cetypes.DateInterval{
					Start: aws.String(startOfLastMonth.Format("2006-01-02")),
					End:   aws.String(queryEnd),
				},
				Granularity: cetypes.GranularityDaily,
				Metrics:     []string{"UnblendedCost"},
				GroupBy:     []cetypes.GroupDefinition{{Type: cetypes.GroupDefinitionTypeDimension, Key: aws.String("SERVICE")}},
				Filter:      BuildFilter(CostQueryParams{}),
			})
			if err != nil {
				s.logger.Printf("Cost explorer comprehensive: service query failed for %s: %v", ci.profile, err)
				ad.err = err
				allData[idx] = ad
				return
			}

			for _, rbt := range svcResult.ResultsByTime {
				date := ""
				if rbt.TimePeriod != nil && rbt.TimePeriod.Start != nil {
					date = *rbt.TimePeriod.Start
				}
				for _, group := range rbt.Groups {
					svc := ""
					if len(group.Keys) > 0 {
						svc = group.Keys[0]
					}
					if metrics, ok := group.Metrics["UnblendedCost"]; ok && metrics.Amount != nil {
						amount := parseFloat(*metrics.Amount)
						if amount < 0.001 {
							continue
						}
						if ad.serviceCosts[svc] == nil {
							ad.serviceCosts[svc] = make(map[string]float64)
						}
						ad.serviceCosts[svc][date] += amount
					}
				}
			}

			tagKeys := []string{"Customer", "ProjectCode"}
			for _, tagKey := range tagKeys {
				tagResult, err := ci.client.GetCostAndUsage(ctx, &costexplorer.GetCostAndUsageInput{
					TimePeriod: &cetypes.DateInterval{
						Start: aws.String(startOfLastMonth.Format("2006-01-02")),
						End:   aws.String(queryEnd),
					},
					Granularity: cetypes.GranularityDaily,
					Metrics:     []string{"UnblendedCost"},
					GroupBy:     []cetypes.GroupDefinition{{Type: cetypes.GroupDefinitionTypeTag, Key: aws.String(tagKey)}},
					Filter:      BuildFilter(CostQueryParams{}),
				})
				if err != nil {
					continue
				}
				if ad.tagCosts[tagKey] == nil {
					ad.tagCosts[tagKey] = make(map[string]map[string]float64)
				}
				for _, rbt := range tagResult.ResultsByTime {
					date := ""
					if rbt.TimePeriod != nil && rbt.TimePeriod.Start != nil {
						date = *rbt.TimePeriod.Start
					}
					for _, group := range rbt.Groups {
						tagVal := "(untagged)"
						if len(group.Keys) > 0 {
							parts := strings.SplitN(group.Keys[0], "$", 2)
							if len(parts) == 2 && parts[1] != "" {
								tagVal = parts[1]
							}
						}
						if metrics, ok := group.Metrics["UnblendedCost"]; ok && metrics.Amount != nil {
							amount := parseFloat(*metrics.Amount)
							if amount < 0.001 {
								continue
							}
							if ad.tagCosts[tagKey][tagVal] == nil {
								ad.tagCosts[tagKey][tagVal] = make(map[string]float64)
							}
							ad.tagCosts[tagKey][tagVal][date] += amount
						}
					}
				}
			}

			regResult, err := ci.client.GetCostAndUsage(ctx, &costexplorer.GetCostAndUsageInput{
				TimePeriod: &cetypes.DateInterval{
					Start: aws.String(startOfLastMonth.Format("2006-01-02")),
					End:   aws.String(queryEnd),
				},
				Granularity: cetypes.GranularityMonthly,
				Metrics:     []string{"UnblendedCost"},
				GroupBy:     []cetypes.GroupDefinition{{Type: cetypes.GroupDefinitionTypeDimension, Key: aws.String("REGION")}},
				Filter:      BuildFilter(CostQueryParams{}),
			})
			if err == nil {
				ad.regionCosts = make(map[string]map[string]float64)
				for _, rbt := range regResult.ResultsByTime {
					date := ""
					if rbt.TimePeriod != nil && rbt.TimePeriod.Start != nil {
						date = *rbt.TimePeriod.Start
					}
					for _, group := range rbt.Groups {
						region := ""
						if len(group.Keys) > 0 {
							region = group.Keys[0]
						}
						if metrics, ok := group.Metrics["UnblendedCost"]; ok && metrics.Amount != nil {
							amount := parseFloat(*metrics.Amount)
							if amount < 0.01 {
								continue
							}
							if ad.regionCosts[region] == nil {
								ad.regionCosts[region] = make(map[string]float64)
							}
							ad.regionCosts[region][date] += amount
						}
					}
				}
			}

			allData[idx] = ad
		}(i, ci)
	}
	wg.Wait()

	yesterdayStr := yesterday.Format("2006-01-02")
	sevenDaysAgoStr := sevenDaysAgo.Format("2006-01-02")
	thisMonthStr := startOfThisMonth.Format("2006-01-02")
	lastMonthStr := startOfLastMonth.Format("2006-01-02")
	endOfLastMonthStr := startOfThisMonth.Format("2006-01-02")

	sumDateRange := func(dateCosts map[string]float64, rangeStart, rangeEnd string) float64 {
		total := 0.0
		for d, c := range dateCosts {
			if d >= rangeStart && d < rangeEnd {
				total += c
			}
		}
		return total
	}

	sumSingleDay := func(dateCosts map[string]float64, day string) float64 {
		return dateCosts[day]
	}

	comp := &ComprehensiveCost{
		Currency:     "USD",
		TagBreakdown: make(map[string][]TagCostRow),
	}

	svcAgg := make(map[string]*ServiceCostRow)
	tagAgg := make(map[string]map[string]*TagCostRow)

	for _, ad := range allData {
		if ad.err != nil {
			continue
		}

		displayName := ad.accountID
		if ad.alias != "" {
			displayName = ad.alias
		}

		acct := AccountCost{AccountID: ad.accountID, Alias: ad.alias}

		for _, dateCosts := range ad.serviceCosts {
			acct.LastMonth += sumDateRange(dateCosts, lastMonthStr, endOfLastMonthStr)
			acct.ThisMonth += sumDateRange(dateCosts, thisMonthStr, queryEnd)
			acct.Last7Days += sumDateRange(dateCosts, sevenDaysAgoStr, queryEnd)
			acct.Yesterday += sumSingleDay(dateCosts, yesterdayStr)
		}
		comp.Accounts = append(comp.Accounts, acct)
		comp.TotalLastMonth += acct.LastMonth
		comp.TotalThisMonth += acct.ThisMonth
		comp.TotalLast7Days += acct.Last7Days
		comp.TotalYesterday += acct.Yesterday

		for svc, dateCosts := range ad.serviceCosts {
			svcKey := displayName + "|" + svc
			if svcAgg[svcKey] == nil {
				svcAgg[svcKey] = &ServiceCostRow{Service: svc, Account: displayName}
			}
			svcAgg[svcKey].LastMonth += sumDateRange(dateCosts, lastMonthStr, endOfLastMonthStr)
			svcAgg[svcKey].ThisMonth += sumDateRange(dateCosts, thisMonthStr, queryEnd)
			svcAgg[svcKey].Last7Days += sumDateRange(dateCosts, sevenDaysAgoStr, queryEnd)
			svcAgg[svcKey].Yesterday += sumSingleDay(dateCosts, yesterdayStr)
		}

		for tagKey, tagVals := range ad.tagCosts {
			if tagAgg[tagKey] == nil {
				tagAgg[tagKey] = make(map[string]*TagCostRow)
			}
			for tagVal, dateCosts := range tagVals {
				tKey := displayName + "|" + tagVal
				if tagAgg[tagKey][tKey] == nil {
					tagAgg[tagKey][tKey] = &TagCostRow{Value: tagVal, Account: displayName}
				}
				tagAgg[tagKey][tKey].LastMonth += sumDateRange(dateCosts, lastMonthStr, endOfLastMonthStr)
				tagAgg[tagKey][tKey].ThisMonth += sumDateRange(dateCosts, thisMonthStr, queryEnd)
				tagAgg[tagKey][tKey].Last7Days += sumDateRange(dateCosts, sevenDaysAgoStr, queryEnd)
				tagAgg[tagKey][tKey].Yesterday += sumSingleDay(dateCosts, yesterdayStr)
			}
		}

		for region, dateCosts := range ad.regionCosts {
			rKey := displayName + "|" + region
			found := false
			for idx := range comp.RegionBreakdown {
				if comp.RegionBreakdown[idx].Account == displayName && comp.RegionBreakdown[idx].Region == region {
					comp.RegionBreakdown[idx].ThisMonth += sumDateRange(dateCosts, thisMonthStr, queryEnd)
					comp.RegionBreakdown[idx].LastMonth += sumDateRange(dateCosts, lastMonthStr, endOfLastMonthStr)
					found = true
					break
				}
			}
			if !found {
				comp.RegionBreakdown = append(comp.RegionBreakdown, RegionCostRow{
					Region:    region,
					Account:   displayName,
					ThisMonth: sumDateRange(dateCosts, thisMonthStr, queryEnd),
					LastMonth: sumDateRange(dateCosts, lastMonthStr, endOfLastMonthStr),
				})
			}
			_ = rKey
		}
	}

	for _, row := range svcAgg {
		comp.ServiceBreakdown = append(comp.ServiceBreakdown, *row)
	}
	sort.Slice(comp.ServiceBreakdown, func(i, j int) bool {
		return comp.ServiceBreakdown[i].ThisMonth > comp.ServiceBreakdown[j].ThisMonth
	})

	for tagKey, rows := range tagAgg {
		for _, row := range rows {
			comp.TagBreakdown[tagKey] = append(comp.TagBreakdown[tagKey], *row)
		}
		sort.Slice(comp.TagBreakdown[tagKey], func(i, j int) bool {
			return comp.TagBreakdown[tagKey][i].ThisMonth > comp.TagBreakdown[tagKey][j].ThisMonth
		})
	}

	sort.Slice(comp.Accounts, func(i, j int) bool {
		return comp.Accounts[i].ThisMonth > comp.Accounts[j].ThisMonth
	})

	sort.Slice(comp.RegionBreakdown, func(i, j int) bool {
		return comp.RegionBreakdown[i].ThisMonth > comp.RegionBreakdown[j].ThisMonth
	})

	dayBeforeStr := yesterday.AddDate(0, 0, -1).Format("2006-01-02")
	for _, ad := range allData {
		if ad.err != nil {
			continue
		}
		for _, dateCosts := range ad.serviceCosts {
			comp.TotalDayBefore += sumSingleDay(dateCosts, dayBeforeStr)
		}
	}

	dailyTotals := make(map[string]float64)
	for _, ad := range allData {
		if ad.err != nil {
			continue
		}
		for _, dateCosts := range ad.serviceCosts {
			for d, c := range dateCosts {
				dailyTotals[d] += c
			}
		}
	}
	dailyDates := make([]string, 0, len(dailyTotals))
	for d := range dailyTotals {
		dailyDates = append(dailyDates, d)
	}
	sort.Strings(dailyDates)
	for _, d := range dailyDates {
		comp.DailyTrend = append(comp.DailyTrend, DailyPoint{Date: d, Cost: dailyTotals[d]})
	}

	svcTotalsThisMonth := make(map[string]float64)
	svcTotalsLastMonth := make(map[string]float64)
	for _, row := range comp.ServiceBreakdown {
		svcTotalsThisMonth[row.Service] += row.ThisMonth
		svcTotalsLastMonth[row.Service] += row.LastMonth
	}
	type svcKV struct {
		svc  string
		cost float64
	}
	svcSorted := make([]svcKV, 0, len(svcTotalsThisMonth))
	for s, c := range svcTotalsThisMonth {
		svcSorted = append(svcSorted, svcKV{s, c})
	}
	sort.Slice(svcSorted, func(i, j int) bool { return svcSorted[i].cost > svcSorted[j].cost })
	for i := 0; i < 10 && i < len(svcSorted); i++ {
		svc := svcSorted[i]
		pct := 0.0
		if comp.TotalThisMonth > 0 {
			pct = (svc.cost / comp.TotalThisMonth) * 100
		}
		change := 0.0
		if lm, ok := svcTotalsLastMonth[svc.svc]; ok && lm > 0 {
			change = ((svc.cost - lm) / lm) * 100
		}
		comp.TopCostDrivers = append(comp.TopCostDrivers, CostDriver{
			Service:    svc.svc,
			ThisMonth:  svc.cost,
			Percentage: pct,
			Change:     change,
		})
	}

	s.setCache(key, comp)
	return comp, nil
}

func buildBreakdown(aggregated map[string]float64, currency string) *CostBreakdown {
	items := make([]CostItem, 0, len(aggregated))
	total := 0.0
	for name, cost := range aggregated {
		if cost < 0.01 {
			continue
		}
		items = append(items, CostItem{Name: name, Cost: cost})
		total += cost
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Cost > items[j].Cost })
	return &CostBreakdown{Items: items, Total: total, Currency: currency}
}

func topN(m map[string]float64, n int) []string {
	type kv struct {
		key string
		val float64
	}
	sorted := make([]kv, 0, len(m))
	for k, v := range m {
		sorted = append(sorted, kv{k, v})
	}
	sort.Slice(sorted, func(i, j int) bool { return sorted[i].val > sorted[j].val })
	result := make([]string, 0, n)
	for i := 0; i < n && i < len(sorted); i++ {
		result = append(result, sorted[i].key)
	}
	return result
}

func contains(slice []string, s string) bool {
	for _, v := range slice {
		if v == s {
			return true
		}
	}
	return false
}

func previousPeriod(params CostQueryParams) CostQueryParams {
	prev := params
	start, err := time.Parse("2006-01-02", params.Start)
	if err != nil {
		return prev
	}
	end, err := time.Parse("2006-01-02", params.End)
	if err != nil {
		return prev
	}
	duration := end.Sub(start)
	prev.End = start.Format("2006-01-02")
	prev.Start = start.Add(-duration).Format("2006-01-02")
	return prev
}

func parseFloat(s string) float64 {
	var f float64
	fmt.Sscanf(s, "%f", &f)
	return f
}
