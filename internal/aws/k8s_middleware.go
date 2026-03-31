package aws

import (
	"context"
	"fmt"
	"net/http"

	"github.com/aws/smithy-go/middleware"
	smithyhttp "github.com/aws/smithy-go/transport/http"
)

// addClusterIDHeader returns an API option that injects the x-k8s-aws-id
// header into STS presign requests, required for EKS token generation.
func addClusterIDHeader(clusterName string) func(*middleware.Stack) error {
	return func(stack *middleware.Stack) error {
		return stack.Build.Add(middleware.BuildMiddlewareFunc(
			"AddK8sClusterID",
			func(ctx context.Context, in middleware.BuildInput, next middleware.BuildHandler) (middleware.BuildOutput, middleware.Metadata, error) {
				req, ok := in.Request.(*smithyhttp.Request)
				if !ok {
					return next.HandleBuild(ctx, in)
				}
				q := req.URL.Query()
				q.Set("Action", "GetCallerIdentity")
				q.Set("Version", "2011-06-15")
				req.URL.RawQuery = q.Encode()
				req.Header.Set("x-k8s-aws-id", clusterName)
				return next.HandleBuild(ctx, in)
			},
		), middleware.After)
	}
}

// stsPresignHeaderRule ensures presigned URLs include the x-k8s-aws-id header.
type stsPresignHeaderRule struct{}

func (s stsPresignHeaderRule) IsValid(url string, header http.Header) error {
	if header.Get("x-k8s-aws-id") == "" {
		return fmt.Errorf("missing x-k8s-aws-id header")
	}
	return nil
}
