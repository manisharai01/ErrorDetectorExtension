package sample

import "os"

// BAD: error discarded with blank identifier.
func bad() {
	f, _ := os.Open("config.txt")
	_ = f
	os.Remove("tmp")
}

// GOOD: error handled.
func good() error {
	f, err := os.Open("config.txt")
	if err != nil {
		return err
	}
	defer f.Close()
	return nil
}
