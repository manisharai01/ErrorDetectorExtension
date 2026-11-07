import Foundation

class Controller {
    var onUpdate: (() -> Void)?

    func bind(_ manager: Manager) {
        manager.observe {
            self.refresh()
        }
    }

    func refresh() {}
}
