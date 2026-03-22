package suggest

import (
	"encoding/json"
	"math"
	"sync"
)

const (
	mlpHiddenSize  = 3
	mlpFeatureSize = 10
)

// Features represents the input features for the MLP scorer.
type Features struct {
	Age            float64 // 0=new, 1=old (normalized)
	Length         float64 // command length / max_length
	ExitCode       float64 // 0=success, 1=failure
	Frequency      float64 // occurrences / max_occurrences
	DirMatch       float64 // fraction of runs in current dir
	ContextOverlap float64 // overlap with recent command context
	SelectedCount  float64 // times explicitly selected / max
	EnvMatch       float64 // fraction of runs in current env
	RecentFailure  float64 // failed in last 2 minutes? 0 or 1
	Occurrences    float64 // raw occurrence count / max
}

func (f *Features) toSlice() [mlpFeatureSize]float64 {
	return [mlpFeatureSize]float64{
		f.Age, f.Length, f.ExitCode, f.Frequency, f.DirMatch,
		f.ContextOverlap, f.SelectedCount, f.EnvMatch, f.RecentFailure, f.Occurrences,
	}
}

type mlpNode struct {
	Weights [mlpFeatureSize]float64 `json:"w"`
	Bias    float64                 `json:"b"`
}

// MLP is a 47-parameter, 3-node single-hidden-layer perceptron for ranking commands.
type MLP struct {
	mu            sync.RWMutex
	Hidden        [mlpHiddenSize]mlpNode `json:"hidden"`
	OutputWeights [mlpHiddenSize]float64 `json:"ow"`
	OutputBias    float64                `json:"ob"`
}

// NewMLP creates an MLP with default weights trained on common shell patterns.
func NewMLP() *MLP {
	return &MLP{
		Hidden: [mlpHiddenSize]mlpNode{
			{Weights: [mlpFeatureSize]float64{-0.5, 0.1, -0.8, 0.9, 0.6, 0.4, 0.7, 0.5, -0.3, 0.8}, Bias: 0.1},
			{Weights: [mlpFeatureSize]float64{-0.3, 0.05, -0.6, 0.7, 0.4, 0.6, 0.5, 0.3, -0.5, 0.6}, Bias: 0.05},
			{Weights: [mlpFeatureSize]float64{-0.4, 0.08, -0.7, 0.8, 0.5, 0.3, 0.6, 0.4, -0.4, 0.7}, Bias: 0.08},
		},
		OutputWeights: [mlpHiddenSize]float64{0.6, 0.3, 0.4},
		OutputBias:    0.05,
	}
}

// Forward computes the MLP output for given features. Returns a score in (0, 1).
func (m *MLP) Forward(features Features) float64 {
	m.mu.RLock()
	defer m.mu.RUnlock()
	input := features.toSlice()
	var hiddenOut [mlpHiddenSize]float64
	for i := 0; i < mlpHiddenSize; i++ {
		sum := m.Hidden[i].Bias
		for j := 0; j < mlpFeatureSize; j++ {
			sum += m.Hidden[i].Weights[j] * input[j]
		}
		hiddenOut[i] = math.Tanh(sum)
	}
	outputSum := m.OutputBias
	for i := 0; i < mlpHiddenSize; i++ {
		outputSum += m.OutputWeights[i] * hiddenOut[i]
	}
	return (math.Tanh(outputSum) + 1.0) / 2.0 // map from (-1,1) to (0,1)
}

// TrainingSample pairs features with a target (1.0 = correct, 0.0 = incorrect).
type TrainingSample struct {
	Features Features
	Target   float64
}

// Train updates weights using batch stochastic gradient descent.
func (m *MLP) Train(samples []TrainingSample, lr float64, epochs int) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if lr <= 0 {
		lr = 0.000005
	}
	if epochs <= 0 {
		epochs = 100
	}
	for epoch := 0; epoch < epochs; epoch++ {
		for _, s := range samples {
			input := s.Features.toSlice()
			var hiddenOut [mlpHiddenSize]float64
			for i := 0; i < mlpHiddenSize; i++ {
				sum := m.Hidden[i].Bias
				for j := 0; j < mlpFeatureSize; j++ {
					sum += m.Hidden[i].Weights[j] * input[j]
				}
				hiddenOut[i] = math.Tanh(sum)
			}
			outputSum := m.OutputBias
			for i := 0; i < mlpHiddenSize; i++ {
				outputSum += m.OutputWeights[i] * hiddenOut[i]
			}
			predicted := (math.Tanh(outputSum) + 1.0) / 2.0
			outputError := s.Target - predicted

			// output gradient: d/dx [(tanh(x)+1)/2] = (1 - tanh²(x))/2
			tanhOut := math.Tanh(outputSum)
			outputGrad := outputError * (1.0 - tanhOut*tanhOut) / 2.0

			for i := 0; i < mlpHiddenSize; i++ {
				hiddenError := outputGrad * m.OutputWeights[i]
				hiddenGrad := hiddenError * (1.0 - hiddenOut[i]*hiddenOut[i])
				m.OutputWeights[i] += lr * outputGrad * hiddenOut[i]
				for j := 0; j < mlpFeatureSize; j++ {
					m.Hidden[i].Weights[j] += lr * hiddenGrad * input[j]
				}
				m.Hidden[i].Bias += lr * hiddenGrad
			}
			m.OutputBias += lr * outputGrad
		}
	}
}

// MarshalJSON serializes MLP weights.
func (m *MLP) MarshalJSON() ([]byte, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	type mlpData struct {
		Hidden        [mlpHiddenSize]mlpNode `json:"hidden"`
		OutputWeights [mlpHiddenSize]float64 `json:"ow"`
		OutputBias    float64                `json:"ob"`
	}
	return json.Marshal(mlpData{Hidden: m.Hidden, OutputWeights: m.OutputWeights, OutputBias: m.OutputBias})
}

// UnmarshalJSON deserializes MLP weights.
func (m *MLP) UnmarshalJSON(data []byte) error {
	type mlpData struct {
		Hidden        [mlpHiddenSize]mlpNode `json:"hidden"`
		OutputWeights [mlpHiddenSize]float64 `json:"ow"`
		OutputBias    float64                `json:"ob"`
	}
	var d mlpData
	if err := json.Unmarshal(data, &d); err != nil {
		return err
	}
	m.mu.Lock()
	defer m.mu.Unlock()
	m.Hidden = d.Hidden
	m.OutputWeights = d.OutputWeights
	m.OutputBias = d.OutputBias
	return nil
}
