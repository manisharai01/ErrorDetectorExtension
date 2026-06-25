package sample

// BAD: append-to-self inside a loop without preallocation.
func bad(src []int) []int {
	var out []int
	for _, v := range src {
		out = append(out, v*2)
	}
	return out
}

// GOOD: indexed write into a preallocated slice (no append-to-self in loop).
func good(src []int) []int {
	out := make([]int, len(src))
	for i, v := range src {
		out[i] = v * 2
	}
	return out
}
