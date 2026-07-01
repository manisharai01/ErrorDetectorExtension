import Foundation

class Controller {
    func bind(_ manager: Manager) {
        manager.observe { [weak self] in
            self?.refresh()
        }
    }

    func transform(_ values: [Int]) -> [Int] {
        return values.map { value in
            value * 2
        }
    }

    func refresh() {}
}
