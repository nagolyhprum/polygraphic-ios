import SwiftUI

var global : Any? = [:]
var local : Any? = [:]

var last_update = Double(0)
func isReady() -> Bool {
    let now = Double(Date().timeIntervalSince1970)
    let diff = now - last_update
    if diff > 0.3 {
        last_update = now
        return true
    }
    return false
}



struct CheckboxField: View {
    @Binding var checked : Bool
    
    var body: some View {
        Button(action : {
            if !isReady() { return }
            checked = !checked
        }) {
            Image(systemName: checked ? "checkmark.square" : "square")
        }
    }
}

struct ContentView: View {
    var body: some View {
        ZStack {
            /*=main*/
        }
    }
}

/*=views*/

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
    }
}

let MATCH = Double(-1)
let WRAP = Double(-2)

func getMaxSize(input : Any?) -> CGFloat? {
    if let input = input as? Double {
        if input.isNaN {
            return 0
        }
        if input == WRAP {
            return nil
        } else if input == MATCH {
            return .infinity
        }
        return CGFloat(input)
    }
    return nil
}

func getMinSize(input : Any?) -> CGFloat? {
    if let input = input as? Double {
        if input.isNaN {
            return 0
        }
        if input >= 0 {
            return CGFloat(input)
        }
    }
    return 0
}

class IdentifiableMap : Identifiable {
    let map : [String : Any?]
    let id : String
    
    init(any : Any?) {
        if let map = any as? [String : Any?] {
            if let id = map["key"] as? String {
                self.map = map
                self.id = id
                return
            }
            if let id = map["id"] as? String {
                self.map = map
                self.id = id
                return
            }
        }
        map = [:]
        id = ""
    }
}

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
