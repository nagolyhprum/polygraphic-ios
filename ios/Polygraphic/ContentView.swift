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
    let component : [String : Any?]
    let callback: (Bool) -> ()
    
    init(
        component : [String : Any?],
        callback: @escaping (Bool) -> ()
    ) {
        self.component = component
        self.callback = callback
    }
    
    var body: some View {
        let value = component["value"] as? Bool ?? false
        Button(action : {
            if !isReady() { return }
            self.callback(!value)
        }) {
            Image(systemName: value ? "checkmark.square" : "square")
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