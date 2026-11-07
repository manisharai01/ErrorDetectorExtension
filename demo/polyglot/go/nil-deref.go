package sample

type User struct {
	Name string
}

// BAD: dereference before nil check.
func bad(u *User) string {
	name := u.Name
	if u != nil {
		return name
	}
	return ""
}

// GOOD: nil check before use.
func good(u *User) string {
	if u != nil {
		return u.Name
	}
	return ""
}
