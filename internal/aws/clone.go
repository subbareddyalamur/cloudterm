package aws

import (
	"context"
	"fmt"
	"time"

	"cloudterm-go/internal/types"

	"github.com/aws/aws-sdk-go-v2/aws"
	"github.com/aws/aws-sdk-go-v2/service/ec2"
	ec2types "github.com/aws/aws-sdk-go-v2/service/ec2/types"
	"github.com/google/uuid"
)

// CloneStatus tracks the state of a clone operation.
type CloneStatus struct {
	ID               string    `json:"id"`
	SourceInstanceID string    `json:"source_instance_id"`
	SourceName       string    `json:"source_name"`
	CloneName        string    `json:"clone_name"`
	AMIID            string    `json:"ami_id,omitempty"`
	Phase            string    `json:"phase"`    // "creating_ami", "ami_ready", "launching", "complete", "error"
	Progress         int       `json:"progress"` // 0-100
	Message          string    `json:"message"`
	NewInstanceID    string    `json:"new_instance_id,omitempty"`
	CreatedAt        time.Time `json:"created_at"`
}

// CloneSettings holds pre-filled launch parameters for the clone.
type CloneSettings struct {
	AMIID            string            `json:"ami_id"`
	InstanceType     string            `json:"instance_type"`
	SubnetID         string            `json:"subnet_id"`
	SecurityGroupIDs []string          `json:"security_group_ids"`
	KeyName          string            `json:"key_name"`
	IAMProfile       string            `json:"iam_profile"`
	Tags             map[string]string `json:"tags"`
	AvailableSubnets []SubnetOption    `json:"available_subnets"`
	AvailableSGs     []SGOption        `json:"available_sgs"`
}

// SubnetOption is a selectable subnet for the clone settings form.
type SubnetOption struct {
	SubnetID string `json:"subnet_id"`
	AZ       string `json:"az"`
	CIDR     string `json:"cidr"`
	Name     string `json:"name"`
}

// SGOption is a selectable security group for the clone settings form.
type SGOption struct {
	GroupID   string `json:"group_id"`
	GroupName string `json:"group_name"`
}

// StartClone creates an AMI from the source instance and starts a background poller.
func (d *Discovery) StartClone(ctx context.Context, instanceID, cloneName string) (string, error) {
	inst, err := d.findCachedInstance(instanceID)
	if err != nil {
		return "", fmt.Errorf("instance not found: %w", err)
	}

	ec2Client, err := d.ec2ClientForInstance(ctx, inst)
	if err != nil {
		return "", fmt.Errorf("create EC2 client: %w", err)
	}

	amiName := fmt.Sprintf("%s-%d", cloneName, time.Now().Unix())
	createOut, err := ec2Client.CreateImage(ctx, &ec2.CreateImageInput{
		InstanceId: aws.String(instanceID),
		Name:       aws.String(amiName),
		NoReboot:   aws.Bool(true),
	})
	if err != nil {
		return "", fmt.Errorf("CreateImage: %w", err)
	}

	cloneID := uuid.New().String()
	amiID := aws.ToString(createOut.ImageId)

	status := &CloneStatus{
		ID:               cloneID,
		SourceInstanceID: instanceID,
		SourceName:       inst.Name,
		CloneName:        cloneName,
		AMIID:            amiID,
		Phase:            "creating_ami",
		Progress:         10,
		Message:          "AMI creation started: " + amiID,
		CreatedAt:        time.Now(),
	}

	d.cloneMu.Lock()
	d.cloneOps[cloneID] = status
	d.cloneMu.Unlock()

	// Tag the AMI with the clone name
	_, _ = ec2Client.CreateTags(ctx, &ec2.CreateTagsInput{
		Resources: []string{amiID},
		Tags:      []ec2types.Tag{{Key: aws.String("Name"), Value: aws.String(cloneName)}},
	})

	go d.pollAMIStatus(cloneID, amiID, inst)

	return cloneID, nil
}

// pollAMIStatus polls DescribeImages until the AMI is available or fails.
func (d *Discovery) pollAMIStatus(cloneID, amiID string, inst *types.EC2Instance) {
	ctx := context.Background()

	ec2Client, err := d.ec2ClientForInstance(ctx, inst)
	if err != nil {
		d.updateCloneStatus(cloneID, "error", 0, "Failed to create EC2 client: "+err.Error())
		return
	}

	progress := 10
	consecutiveErrors := 0
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// Recreate client on consecutive errors (handles credential refresh)
			if consecutiveErrors > 0 && consecutiveErrors%3 == 0 {
				if newClient, err := d.ec2ClientForInstance(ctx, inst); err == nil {
					ec2Client = newClient
				}
			}

			out, err := ec2Client.DescribeImages(ctx, &ec2.DescribeImagesInput{
				ImageIds: []string{amiID},
			})
			if err != nil {
				consecutiveErrors++
				d.updateCloneStatus(cloneID, "creating_ami", progress,
					fmt.Sprintf("Polling AMI (retry %d): %v", consecutiveErrors, err))
				if consecutiveErrors >= 10 {
					d.updateCloneStatus(cloneID, "error", progress, "DescribeImages failed after 10 retries: "+err.Error())
					return
				}
				continue
			}
			consecutiveErrors = 0

			if len(out.Images) == 0 {
				d.updateCloneStatus(cloneID, "error", progress, "AMI not found")
				return
			}

			state := string(out.Images[0].State)
			if state == "available" {
				d.updateCloneStatus(cloneID, "ami_ready", 90, "AMI available — ready to configure")
				return
			} else if state == "failed" {
				reason := aws.ToString(out.Images[0].StateReason.Message)
				d.updateCloneStatus(cloneID, "error", progress, "AMI creation failed: "+reason)
				return
			}

			if progress < 89 {
				progress += 2
			}
			d.updateCloneStatus(cloneID, "creating_ami", progress, "AMI state: "+state)
		}
	}
}

func (d *Discovery) updateCloneStatus(cloneID, phase string, progress int, message string) {
	d.cloneMu.Lock()
	defer d.cloneMu.Unlock()
	if s, ok := d.cloneOps[cloneID]; ok {
		s.Phase = phase
		s.Progress = progress
		s.Message = message
	}
}

// GetCloneStatus returns the current status of a clone operation.
func (d *Discovery) GetCloneStatus(cloneID string) (*CloneStatus, error) {
	d.cloneMu.RLock()
	defer d.cloneMu.RUnlock()
	s, ok := d.cloneOps[cloneID]
	if !ok {
		return nil, fmt.Errorf("clone %s not found", cloneID)
	}
	return s, nil
}

// GetCloneSettings fetches pre-filled launch settings from the source instance.
func (d *Discovery) GetCloneSettings(ctx context.Context, cloneID string) (*CloneSettings, error) {
	d.cloneMu.RLock()
	cs, ok := d.cloneOps[cloneID]
	d.cloneMu.RUnlock()
	if !ok {
		return nil, fmt.Errorf("clone %s not found", cloneID)
	}
	if cs.Phase != "ami_ready" {
		return nil, fmt.Errorf("AMI not ready yet (phase: %s)", cs.Phase)
	}

	inst, err := d.findCachedInstance(cs.SourceInstanceID)
	if err != nil {
		return nil, err
	}

	ec2Client, err := d.ec2ClientForInstance(ctx, inst)
	if err != nil {
		return nil, err
	}

	// Get KeyName from DescribeInstances (not in cache)
	keyName := ""
	descOut, err := ec2Client.DescribeInstances(ctx, &ec2.DescribeInstancesInput{
		InstanceIds: []string{inst.InstanceID},
	})
	if err == nil && len(descOut.Reservations) > 0 && len(descOut.Reservations[0].Instances) > 0 {
		keyName = aws.ToString(descOut.Reservations[0].Instances[0].KeyName)
	}

	// Available subnets in VPC
	var availableSubnets []SubnetOption
	subOut, err := ec2Client.DescribeSubnets(ctx, &ec2.DescribeSubnetsInput{
		Filters: []ec2types.Filter{{Name: aws.String("vpc-id"), Values: []string{inst.VpcID}}},
	})
	if err == nil {
		for _, s := range subOut.Subnets {
			name := ""
			for _, t := range s.Tags {
				if aws.ToString(t.Key) == "Name" {
					name = aws.ToString(t.Value)
				}
			}
			availableSubnets = append(availableSubnets, SubnetOption{
				SubnetID: aws.ToString(s.SubnetId),
				AZ:       aws.ToString(s.AvailabilityZone),
				CIDR:     aws.ToString(s.CidrBlock),
				Name:     name,
			})
		}
	}

	// Available SGs in VPC
	var availableSGs []SGOption
	sgOut, err := ec2Client.DescribeSecurityGroups(ctx, &ec2.DescribeSecurityGroupsInput{
		Filters: []ec2types.Filter{{Name: aws.String("vpc-id"), Values: []string{inst.VpcID}}},
	})
	if err == nil {
		for _, sg := range sgOut.SecurityGroups {
			availableSGs = append(availableSGs, SGOption{
				GroupID:   aws.ToString(sg.GroupId),
				GroupName: aws.ToString(sg.GroupName),
			})
		}
	}

	// Copy parent tags, override Name
	tags := make(map[string]string)
	for k, v := range inst.Tags {
		tags[k] = v
	}
	tags["Name"] = cs.CloneName

	return &CloneSettings{
		AMIID:            cs.AMIID,
		InstanceType:     inst.InstanceType,
		SubnetID:         inst.SubnetID,
		SecurityGroupIDs: inst.SecurityGroups,
		KeyName:          keyName,
		IAMProfile:       inst.InstanceProfile,
		Tags:             tags,
		AvailableSubnets: availableSubnets,
		AvailableSGs:     availableSGs,
	}, nil
}

// LaunchClone creates a new instance from the clone AMI with the given settings.
func (d *Discovery) LaunchClone(ctx context.Context, cloneID string, settings CloneSettings) (string, error) {
	d.cloneMu.Lock()
	cs, ok := d.cloneOps[cloneID]
	if !ok {
		d.cloneMu.Unlock()
		return "", fmt.Errorf("clone %s not found", cloneID)
	}
	if cs.Phase != "ami_ready" {
		d.cloneMu.Unlock()
		return "", fmt.Errorf("clone not ready (phase: %s)", cs.Phase)
	}
	cs.Phase = "launching"
	cs.Progress = 95
	cs.Message = "Launching instance..."
	d.cloneMu.Unlock()

	inst, err := d.findCachedInstance(cs.SourceInstanceID)
	if err != nil {
		d.updateCloneStatus(cloneID, "error", 95, err.Error())
		return "", err
	}

	ec2Client, err := d.ec2ClientForInstance(ctx, inst)
	if err != nil {
		d.updateCloneStatus(cloneID, "error", 95, err.Error())
		return "", err
	}

	input := &ec2.RunInstancesInput{
		ImageId:          aws.String(settings.AMIID),
		InstanceType:     ec2types.InstanceType(settings.InstanceType),
		MinCount:         aws.Int32(1),
		MaxCount:         aws.Int32(1),
		SubnetId:         aws.String(settings.SubnetID),
		SecurityGroupIds: settings.SecurityGroupIDs,
	}
	if settings.KeyName != "" {
		input.KeyName = aws.String(settings.KeyName)
	}
	if settings.IAMProfile != "" {
		input.IamInstanceProfile = &ec2types.IamInstanceProfileSpecification{
			Arn: aws.String(settings.IAMProfile),
		}
	}

	runOut, err := ec2Client.RunInstances(ctx, input)
	if err != nil {
		d.updateCloneStatus(cloneID, "error", 95, "RunInstances failed: "+err.Error())
		return "", fmt.Errorf("RunInstances: %w", err)
	}

	newID := aws.ToString(runOut.Instances[0].InstanceId)

	// Tag the new instance
	var tags []ec2types.Tag
	for k, v := range settings.Tags {
		tags = append(tags, ec2types.Tag{Key: aws.String(k), Value: aws.String(v)})
	}
	if len(tags) > 0 {
		_, _ = ec2Client.CreateTags(ctx, &ec2.CreateTagsInput{
			Resources: []string{newID},
			Tags:      tags,
		})
	}

	d.cloneMu.Lock()
	cs.Phase = "complete"
	cs.Progress = 100
	cs.Message = "Instance launched: " + newID
	cs.NewInstanceID = newID
	d.cloneMu.Unlock()

	return newID, nil
}

