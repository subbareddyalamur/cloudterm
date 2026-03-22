package suggest

import "testing"

func TestErrorKBDetectPatterns(t *testing.T) {
	kb := NewErrorKB()
	insights := kb.DetectErrors("bash: kubectl: command not found")
	if len(insights) == 0 {
		t.Fatal("expected at least one insight")
	}
	if insights[0].ErrorSummary != "Command not found" {
		t.Errorf("expected 'Command not found', got %q", insights[0].ErrorSummary)
	}
	if insights[0].Confidence != 0.8 {
		t.Errorf("expected confidence 0.8, got %f", insights[0].Confidence)
	}
}

func TestErrorKBDetectMultiple(t *testing.T) {
	kb := NewErrorKB()
	insights := kb.DetectErrors("permission denied\nconnection refused")
	if len(insights) != 2 {
		t.Fatalf("expected 2 insights, got %d", len(insights))
	}
}

func TestErrorKBNoMatch(t *testing.T) {
	kb := NewErrorKB()
	insights := kb.DetectErrors("total 32\ndrwxr-xr-x 4 user user 4096 Jan 1 00:00 .")
	if len(insights) != 0 {
		t.Errorf("expected 0 insights for normal output, got %d", len(insights))
	}
}

func TestErrorKBRecordResolution(t *testing.T) {
	kb := NewErrorKB()
	kb.RecordResolution("unable to connect to database", "sudo systemctl restart postgresql")
	if kb.LearnedCount() != 1 {
		t.Fatalf("expected 1 learned pattern, got %d", kb.LearnedCount())
	}

	insights := kb.DetectErrors("error: unable to connect to database on port 5432")
	found := false
	for _, i := range insights {
		if i.SuggestedFix == "sudo systemctl restart postgresql" {
			found = true
		}
	}
	if !found {
		t.Error("expected learned resolution in results")
	}
}

func TestErrorKBSuggestFix(t *testing.T) {
	kb := NewErrorKB()
	kb.RecordResolution("connection refused port 5432 postgresql", "sudo systemctl restart postgresql")
	kb.RecordResolution("disk space full /var/log", "sudo rm -rf /var/log/old*")

	fix := kb.SuggestFix("error: connection refused to postgres database on port 5432")
	if fix == nil {
		t.Fatal("expected a fix suggestion")
	}
	if fix.SuggestedFix != "sudo systemctl restart postgresql" {
		t.Errorf("expected postgresql fix, got %q", fix.SuggestedFix)
	}
	if fix.Confidence < 0.3 {
		t.Errorf("expected confidence >= 0.3, got %f", fix.Confidence)
	}
}

func TestErrorKBSuggestFixNoMatch(t *testing.T) {
	kb := NewErrorKB()
	kb.RecordResolution("very specific error xyz123", "fix xyz")
	fix := kb.SuggestFix("completely unrelated output abc")
	if fix != nil {
		t.Errorf("expected nil for unrelated error, got %v", fix)
	}
}

func TestErrorKBNoDuplicateInsights(t *testing.T) {
	kb := NewErrorKB()
	insights := kb.DetectErrors("permission denied\npermission denied again")
	count := 0
	for _, i := range insights {
		if i.ErrorSummary == "Permission denied" {
			count++
		}
	}
	if count > 1 {
		t.Errorf("expected 1 permission denied insight, got %d", count)
	}
}
