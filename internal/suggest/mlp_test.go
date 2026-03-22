package suggest

import (
	"encoding/json"
	"math"
	"sync"
	"testing"
)

func TestMLPForward(t *testing.T) {
	m := NewMLP()
	f := Features{
		Age: 0.1, Length: 0.3, ExitCode: 0, Frequency: 0.8,
		DirMatch: 0.9, ContextOverlap: 0.5, SelectedCount: 0.6,
		EnvMatch: 0.7, RecentFailure: 0, Occurrences: 0.8,
	}
	score := m.Forward(f)
	if score <= 0 || score >= 1 {
		t.Errorf("expected score in (0,1), got %f", score)
	}

	score2 := m.Forward(f)
	if score != score2 {
		t.Errorf("forward pass not deterministic: %f vs %f", score, score2)
	}
}

func TestMLPHighVsLowFeatures(t *testing.T) {
	m := NewMLP()
	good := Features{Frequency: 0.9, DirMatch: 0.9, ContextOverlap: 0.8, Occurrences: 0.9}
	bad := Features{Age: 0.9, ExitCode: 1.0, RecentFailure: 1.0}

	goodScore := m.Forward(good)
	badScore := m.Forward(bad)
	if goodScore <= badScore {
		t.Errorf("high-quality features should score higher: good=%f bad=%f", goodScore, badScore)
	}
}

func TestMLPTrain(t *testing.T) {
	m := NewMLP()
	samples := []TrainingSample{
		{Features: Features{Frequency: 0.9, DirMatch: 0.8, Occurrences: 0.9}, Target: 1.0},
		{Features: Features{Age: 0.9, ExitCode: 1.0, RecentFailure: 1.0}, Target: 0.0},
	}

	var initialLoss float64
	for _, s := range samples {
		diff := s.Target - m.Forward(s.Features)
		initialLoss += diff * diff
	}

	m.Train(samples, 0.001, 500)

	var finalLoss float64
	for _, s := range samples {
		diff := s.Target - m.Forward(s.Features)
		finalLoss += diff * diff
	}

	if finalLoss >= initialLoss {
		t.Errorf("training should reduce loss: initial=%f final=%f", initialLoss, finalLoss)
	}
}

func TestMLPSerialize(t *testing.T) {
	m := NewMLP()
	m.Train([]TrainingSample{
		{Features: Features{Frequency: 0.9}, Target: 1.0},
	}, 0.001, 100)

	data, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	m2 := &MLP{}
	if err := json.Unmarshal(data, m2); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	f := Features{Frequency: 0.5, DirMatch: 0.3}
	s1 := m.Forward(f)
	s2 := m2.Forward(f)
	if math.Abs(s1-s2) > 1e-10 {
		t.Errorf("scores diverge after roundtrip: %f vs %f", s1, s2)
	}
}

func TestMLPConcurrency(t *testing.T) {
	m := NewMLP()
	var wg sync.WaitGroup
	for i := 0; i < 50; i++ {
		wg.Add(2)
		go func() {
			defer wg.Done()
			m.Forward(Features{Frequency: 0.5})
		}()
		go func() {
			defer wg.Done()
			m.Train([]TrainingSample{
				{Features: Features{Frequency: 0.9}, Target: 1.0},
			}, 0.0001, 1)
		}()
	}
	wg.Wait()
}
