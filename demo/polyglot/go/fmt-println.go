package sample

import (
	"fmt"
	"log/slog"
)

// BAD: fmt.Print* left in code.
func bad(user string) {
	fmt.Println("user:", user)
	fmt.Printf("user=%s\n", user)
}

// GOOD: structured logger.
func good(user string) {
	slog.Info("login", "user", user)
}
