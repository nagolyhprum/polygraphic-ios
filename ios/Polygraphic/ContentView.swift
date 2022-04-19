import SwiftUI
import Speech

struct SpeechRecognizer {
    private class SpeechAssist {
        var audioEngine: AVAudioEngine?
        var recognitionRequest: SFSpeechAudioBufferRecognitionRequest?
        var recognitionTask: SFSpeechRecognitionTask?
        let speechRecognizer = SFSpeechRecognizer()

        deinit {
            reset()
        }

        func reset() {
            recognitionTask?.cancel()
            audioEngine?.stop()
            audioEngine = nil
            recognitionRequest = nil
            recognitionTask = nil
        }
    }

    private var timer : Timer?
    private let assistant = SpeechAssist()
    private var callback: (String) -> () = { transcript in }
    private var transcript = ""

    mutating func record(callback : @escaping (String) -> ()) {
        var this = self
        this.callback = callback
        this.transcript = ""
        // print("Requesting access")
        canAccess { assistant, authorized in
            guard authorized else {
                // print("Access denied")
                return
            }
            // print("Access granted")
            assistant.audioEngine = AVAudioEngine()
            guard let audioEngine = assistant.audioEngine else {
                // print("Unable to create audio engine")
                return
            }
            assistant.recognitionRequest = SFSpeechAudioBufferRecognitionRequest()
            guard let recognitionRequest = assistant.recognitionRequest else {
                // print("Unable to create request")
                return
            }
            recognitionRequest.shouldReportPartialResults = true
            do {
                // print("Booting audio subsystem")
                let inputNode = audioEngine.inputNode
                // print("Found input node")
                let recordingFormat = inputNode.outputFormat(forBus: 0)
                inputNode.installTap(
                    onBus: 0,
                    bufferSize: 1024,
                    format: recordingFormat
                ) { buffer, when in
                    recognitionRequest.append(buffer)
                }
                // print("Preparing audio engine")
                audioEngine.prepare()
                try audioEngine.start()
                assistant.recognitionTask = assistant.speechRecognizer?.recognitionTask(with: recognitionRequest) { (result, error) in
                    if let result = result {
                        this.transcript = result.bestTranscription.formattedString
                        this.resetTimer()
                    }
                }
                this.resetTimer()
                AudioServicesPlayAlertSound(1110) // JBL_Begin
            } catch {
                // print("Error transcibing audio : \(error.localizedDescription)")
                assistant.reset()
            }
        }
    }

    mutating func resetTimer() {
        let this = self
        timer?.invalidate()
        // print("new timer")
        timer = Timer.scheduledTimer(
            withTimeInterval: 1,
            repeats: false,
            block: { (timer) in
                // print("timed out")
                this.stopRecording()
            }
        )
    }

    func stopRecording() {
        AudioServicesPlayAlertSound(1111) // JBL_End
        callback(transcript)
        assistant.reset()
    }

    private func canAccess(withHandler handler: @escaping (SpeechAssist, Bool) -> Void) {
        SFSpeechRecognizer.requestAuthorization { status in
            if status == .authorized {
                AVAudioSession.sharedInstance().requestRecordPermission { authorized in
                    handler(assistant, authorized)
                }
            } else {
                handler(assistant, false)
            }
        }
    }
}

var speechRecognizer = SpeechRecognizer()
var speech: [String : (_ any : [Any?]) -> Any?] = [:]

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

extension Date {
    var startOfHour: Date {
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents([.year, .month, .day, .hour], from: self)
        return  calendar.date(from: components)!
    }
    
    var startOfDay: Date {
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents([.year, .month, .day], from: self)
        return  calendar.date(from: components)!
    }
    
    var startOfMonth: Date {
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents([.year, .month], from: self)
        return  calendar.date(from: components)!
    }
    
    var startOfYear: Date {
        let calendar = Calendar(identifier: .gregorian)
        let components = calendar.dateComponents([.year], from: self)
        return  calendar.date(from: components)!
    }
}

func startOf(ms : Double, unit : String) -> [String : (_ any : [Any?]) -> Any?] {
    let date = Date(timeIntervalSince1970: Double(ms / 1000))
    if unit == "year" {
        return PollyMoment(ms : date.startOfYear.timeIntervalSince1970)
    }
    if unit == "month" {
        return PollyMoment(ms : date.startOfMonth.timeIntervalSince1970)
    }
    if unit == "day" {
        return PollyMoment(ms : date.startOfDay.timeIntervalSince1970)
    }
    if unit == "hour" {
        return PollyMoment(ms : date.startOfHour.timeIntervalSince1970)
    }
    return PollyMoment(ms : ms)
}

func PollyMoment(ms : Double) -> [String : (_ any : [Any?]) -> Any?] {
    return [
        "startOf" : { any in
            if let unit = any[0] as? String {
                return startOf(ms : ms, unit : unit)
            }
            return PollyMoment(ms : ms)
        },
        "isSame" : { any in
            if let input = any[0] as? Double, let unit = any[1] as? String {
                let a = startOf(ms: ms, unit: "day")
                let b = startOf(ms: ms, unit: "day")
                return invoke(
                    target : a,
                    name : "valueOf",
                    args : []
                ) as? Double == invoke(
                    target : b,
                    name : "valueOf",
                    args : []
                ) as? Double
            }
            return PollyMoment(ms : ms)
        },
        "valueOf" : { any in
            return ms
        },
        "format" : { any in
            if let format = any[0] as? String {
                let reformat = format.replacingOccurrences(of: "ddd", with: "EEE")
                    .replacingOccurrences(of: "D", with: "d")
                    .replacingOccurrences(of: "Y", with: "y")
                let dateFormatterPrint = DateFormatter()
                dateFormatterPrint.dateFormat = reformat
                let date = Date(timeIntervalSince1970: ms / Double(1000))
                return dateFormatterPrint.string(from: date)
            }
            return ""
        }
    ]
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
    func save() {
        UserDefaults.standard.set(global, forKey : "State")
    }
    @State var state = global
    var body: some View {
        ZStack {
            /*=main*/
        }.onAppear {
            ProgrammingGlobal["onBack"] = { list in
                /*=onBack*/
                return false
            }
            ProgrammingGlobal["setTimeout"] = { list in
                if let callback = list[1] as? (Any?) -> Any?, let ms = list[2] as? Double {
                    DispatchQueue.main.asyncAfter(deadline: .now() + (ms / 1000.0)) {
                        callback(nil)
                        withAnimation {
                            state = global 
                            save()
                        }
                    }
                }
                return nil
            }   
            ProgrammingGlobal["moment"] = { any in
                if let ms = any[1] as? Double {
                    return PollyMoment(ms : ms)
                }
                return nil
            }
            speech["listen"] = { any in
                if let config = any[0] as? [String : Any?] {
                    if let onResult = config["onResult"] as? (Any?) -> Any? {
                        speechRecognizer.record { transcript in
                            onResult([
                                "results" : [[[
                                    "isFinal" : true,
                                    "transcript" : transcript,
                                    "confidence" : -1
                                ]]]
                            ])
                            withAnimation {
                                state = global
                                save()
                            }
                        }
                    }
                }
                return nil
            }
            global = set(root: global, path : ["os"], value: "ios")
            withAnimation {
                state = global
                save()
            }
        }
    }
}

func getTransition(animation : [String:Any?]) -> AnyTransition {
    if let name = animation["name"] as? String {
        if name == "right" {
            return .move(edge: .trailing)
        }
        if name == "left" {
            return .move(edge: .leading)
        }
    }
    return .identity
}

extension View {
    @ViewBuilder func isVisible(_ visible: Bool) -> some View {
        if visible {
            self
        }
    }

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
    return (input?["key"] ?? input?["id"] ?? input?["value"]) as? String ?? ""
}

func getDateString(component : [String:Any?]) -> String {
    if let value = component["value"] as? Double {
        if value == -1 {
            return ""
        }
        let date = Date(timeIntervalSince1970: value / 1000)
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "MM-dd-YYYY"
        return dateFormatter.string(from: date)
    }
    return ""
}

func getDate(component : [String:Any?]) -> Date {
    if let value = component["value"] as? Double {
        if value == -1 {
            return Date()
        } else {
            return Date(timeIntervalSince1970: value / 1000)
        }
    }
    return Date()
}

struct PollyDatePicker: View {
    
    let title: String
    let component : [String : Any?]
    let callback: (Double) -> ()
    @State var popup = false
    
    init(
        title: String,
        component : [String : Any?],
        callback : @escaping (Double) -> ()
    ) {
        self.title = title
        self.component = component
        self.callback = callback
    }
    
    var body: some View {
        var _datePickerValue = getDate(component: component)
        var datePickerValue = Binding<Date>(get: {
            return _datePickerValue
        }, set: { date in
            _datePickerValue = date
        })
        Button(action : {
            if !isReady() { return }
            popup = true
        }) {
            HStack {
                Text(getDateString(component : component))
                .frame(maxWidth : .infinity, alignment: .leading)
            }
        }.sheet(isPresented: self.$popup) {
            VStack {
                DatePicker(title, selection: datePickerValue, displayedComponents: .date)
                    .datePickerStyle(GraphicalDatePickerStyle())
                HStack {
                    Button(action : {
                        callback(Double(-1))
                        popup = false
                    }) {
                        Text("CLEAR")
                    }
                    Spacer().frame(
                        maxWidth : .infinity
                    )
                    Button(action : {
                        popup = false
                    }) {
                        Text("CANCEL")
                    }
                    Button(action : {
                        callback(Double(_datePickerValue.timeIntervalSince1970 * 1000))
                        popup = false
                    }) {
                        Text("OK")
                    }.padding(.leading)
                }
            }
            .padding(.all)
            .padding(.all)
            .frame(
                maxWidth : .infinity,
                maxHeight: .infinity
            )
        }
    }
}

struct Picker: View {
    
    let title: String
    let component : [String : Any?]
    let callback: (String) -> ()
    let color: Color
    @State var popup = false
    
    init(
        title: String, 
        component : [String : Any?], 
        callback : @escaping (String) -> (),
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
                    .foregroundColor(Color.black)
                    .font(.system(size : 20, weight : .bold))
                    .padding()
                    ScrollView {
                        VStack {
                            ForEach(identifiables) { inner_idmap in
                                Button(action : {
                                    if !isReady() { return }
                                    callback(getIdentifier(input : inner_idmap.map))
                                    popup = false
                                }) {
                                    let a = getIdentifier(input : inner_idmap.map)
                                    let b = getIdentifier(input : idmap?.map)
                                    let weight = a == b ? Font.Weight.bold : Font.Weight.regular
                                    let color = a == b ? Color.black : Color.gray
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

extension Binding {
    func onUpdate(_ closure: @escaping () -> Void) -> Binding<Value> {
        Binding(get: {
            wrappedValue
        }, set: { newValue in
            wrappedValue = newValue
            closure()
        })
    }
}
