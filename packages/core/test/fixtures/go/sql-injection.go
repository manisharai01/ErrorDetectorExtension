package sample

import "database/sql"

// BAD: query built by concatenating a non-literal.
func bad(db *sql.DB, id string) (*sql.Rows, error) {
	return db.Query("SELECT * FROM users WHERE id = " + id)
}

// GOOD: parameterized query.
func good(db *sql.DB, id string) (*sql.Rows, error) {
	return db.Query("SELECT * FROM users WHERE id = ?", id)
}
