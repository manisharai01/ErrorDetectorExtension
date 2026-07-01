import Foundation

func handle(_ user: User) {
    print("entering handle")
    debugPrint(user.token)
    process(user)
}
