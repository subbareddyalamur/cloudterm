package auth

import (
	"context"
	"database/sql"
	"fmt"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const schemaSQL = `
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'lab',
  status TEXT NOT NULL DEFAULT 'active'
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id),
  email TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  password_hash TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'local',
  subject TEXT NOT NULL DEFAULT '',
  disabled BOOLEAN NOT NULL DEFAULT false,
  UNIQUE (tenant_id, email)
);
ALTER TABLE users ADD COLUMN IF NOT EXISTS provider TEXT NOT NULL DEFAULT 'local';
ALTER TABLE users ADD COLUMN IF NOT EXISTS subject TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS disabled BOOLEAN NOT NULL DEFAULT false;
INSERT INTO tenants (id, name) VALUES ('local', 'Local') ON CONFLICT (id) DO NOTHING;
`

// OpenPostgres stores users in Postgres when DATABASE_URL is set.
// The file store remains the path when no database is attached.
func OpenPostgres(ctx context.Context, dsn string, secret []byte, opt Options) (*Service, error) {
	if len(secret) < 32 {
		return nil, fmt.Errorf("auth secret must be at least 32 bytes")
	}
	db, err := sql.Open("pgx", dsn)
	if err != nil {
		return nil, err
	}
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	if _, err := db.ExecContext(ctx, schemaSQL); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("auth schema: %w", err)
	}
	s := newService(secret, opt)
	s.db = db
	rows, err := db.QueryContext(ctx, `SELECT id, email, name, role, tenant_id, password_hash, provider, subject, disabled FROM users`)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var u User
		if err := rows.Scan(&u.ID, &u.Email, &u.Name, &u.Role, &u.TenantID, &u.PasswordHash, &u.Provider, &u.Subject, &u.Disabled); err != nil {
			_ = db.Close()
			return nil, err
		}
		s.users = append(s.users, u)
	}
	if err := rows.Err(); err != nil {
		_ = db.Close()
		return nil, err
	}
	changed, err := s.prepareUsers()
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	if changed {
		if err := s.save(); err != nil {
			_ = db.Close()
			return nil, err
		}
	}
	return s, nil
}

func (s *Service) saveDB() error {
	tx, err := s.db.Begin()
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	for _, u := range s.users {
		if u.TenantID == "" {
			u.TenantID = "local"
		}
		if _, err := tx.Exec(`INSERT INTO tenants (id, name) VALUES ($1, $1) ON CONFLICT (id) DO NOTHING`, u.TenantID); err != nil {
			return err
		}
		if _, err := tx.Exec(`
			INSERT INTO users (id, tenant_id, email, name, role, password_hash, provider, subject, disabled)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			ON CONFLICT (id) DO UPDATE SET
			  email = EXCLUDED.email,
			  name = EXCLUDED.name,
			  role = EXCLUDED.role,
			  tenant_id = EXCLUDED.tenant_id,
			  password_hash = EXCLUDED.password_hash,
			  provider = EXCLUDED.provider,
			  subject = EXCLUDED.subject,
			  disabled = EXCLUDED.disabled`,
			u.ID, u.TenantID, u.Email, u.Name, string(u.Role), u.PasswordHash, u.Provider, u.Subject, u.Disabled); err != nil {
			return err
		}
	}
	return tx.Commit()
}
