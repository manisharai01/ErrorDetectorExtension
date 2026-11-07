import Foundation

func greet(_ name: String?) -> Int {
    let unwrapped = name!
    return unwrapped.count
}

func length(_ dict: [String: String]) -> Int {
    return dict["key"]!.count
}
