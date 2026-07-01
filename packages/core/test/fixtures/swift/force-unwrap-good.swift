import Foundation

func greet(_ name: String?) -> Int {
    guard let unwrapped = name else { return 0 }
    return unwrapped.count
}

func length(_ dict: [String: String]) -> Int {
    return (dict["key"] ?? "").count
}

func load() throws {
    let data = try fetch()
    process(data)
}
