import UIKit

class ViewController: UIViewController {
    let label = UILabel()

    func reload() {
        DispatchQueue.global().async {
            let text = self.compute()
            self.label.text = text
        }
    }

    func compute() -> String { return "" }
}
