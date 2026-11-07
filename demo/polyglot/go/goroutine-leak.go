package sample

import "context"

// BAD: goroutine loops forever on a channel with no exit path.
func bad(ch chan int) {
	go func() {
		for {
			<-ch
		}
	}()
}

// GOOD: select with a ctx.Done() exit.
func good(ctx context.Context, ch chan int) {
	go func() {
		for {
			select {
			case <-ch:
			case <-ctx.Done():
				return
			}
		}
	}()
}
