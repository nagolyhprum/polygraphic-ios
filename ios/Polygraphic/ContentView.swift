import SwiftUI

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
    init() {
        /*=funcs*/
    }
    @State var state = global
    var body: some View {
        ZStack {
            /*=main*/
        }
    }
}

extension View {
    public func blending(color: Color) -> some View {
        modifier(ColorBlended(color: color))
    }
    
    public func position(position : Any?) -> some View {
        let position = position as? [String:Any?] ?? [:]
        let top = position["top"] as? Double ?? 0
        let trailing = position["right"] as? Double ?? 0
        let bottom = position["bottom"] as? Double ?? 0
        let leading = position["left"] as? Double ?? 0
        return padding(.top, CGFloat(top))
            .padding(.trailing, CGFloat(trailing))
            .padding(.bottom, CGFloat(bottom))
            .padding(.leading, CGFloat(leading))
    }
}

func getName(input : [String : Any?]?) -> String {
    return (input?["name"] ?? input?["title"] ?? input?["text"]) as? String ?? ""
}

func getIdentifier(input : [String : Any?]?) -> String {
    return (input?["key"] ?? input?["id"]) as? String ?? ""
}

struct Picker: View {
    
    let title: String
    let component : [String : Any?]
    let callback: ([String : Any?]) -> ()
    let color: Color
    @State var popup = false
    
    init(
        title: String, 
        component : [String : Any?], 
        callback : @escaping ([String : Any?]) -> (),
        color: Color
    ) {
        self.title = title
        self.component = component
        self.callback = callback
        self.color = color
    }
    
    @ViewBuilder
    var body: some View {
        if let data = component["data"] as? [Any?] {
            let identifiables = data.map {
                return IdentifiableMap(any : $0)
            }
            let idmap = Array(identifiables).first(where: { item in
                let a = getIdentifier(input : component)
                let b = getIdentifier(input : item.map)
                return a == b
            })
            Button(action : {
                if !isReady() { return }
                popup = true
            }) {
                HStack {
                    Text(getName(input : idmap?.map))
                    .frame(maxWidth : .infinity, alignment: .leading)
                    Image("drop_down_arrow")
                    .blending(color : color)
                    .frame(maxWidth: 24, maxHeight: 24)
                }
            }.sheet(isPresented: self.$popup) {
                VStack {
                    Text(title)
                    .foregroundColor(Color("polly_black"))
                    .font(.system(size : 20, weight : .bold))
                    .padding()
                    ScrollView {
                        VStack {
                            ForEach(identifiables) { inner_idmap in
                                Button(action : {
                                    if !isReady() { return }
                                    callback([
                                        "value" : getIdentifier(input : inner_idmap.map)
                                    ])
                                    popup = false
                                }) {
                                    let a = getIdentifier(input : inner_idmap.map)
                                    let b = getIdentifier(input : idmap?.map)
                                    let weight = a == b ? Font.Weight.bold : Font.Weight.regular
                                    let color = a == b ? Color("polly_black") : Color.gray
                                    Text(getName(input : inner_idmap.map))
                                    .foregroundColor(color)
                                    .font(.system(size : 16, weight : weight))
                                    .padding()
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

public struct ColorBlended: ViewModifier {
    fileprivate var color: Color

    public func body(content: Content) -> some View {
        VStack {
            ZStack {
                content
                color.blendMode(.sourceAtop)
            }
            .drawingGroup(opaque: false)
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
            let id = getIdentifier(input : map)
            self.map = map
            self.id = id
            return
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
