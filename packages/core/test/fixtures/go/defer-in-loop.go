package sample

import "os"

// BAD: defer inside a loop accumulates until the function returns.
func bad(paths []string) {
	for _, p := range paths {
		f, _ := os.Open(p)
		defer f.Close()
		_ = f
	}
}

// GOOD: defer at function scope (one resource).
func good(path string) error {
	f, err := os.Open(path)
	if err != nil {
		return err
	}
	defer f.Close()
	return nil
}
