import { createCanvas, loadImage } from 'canvas'
import fs from 'fs/promises'
import path from 'path'
import {
    GlobalState,
    Component,
    EventConfig,
    ProgrammingLanguage,
    compile,
    execute,
    ComponentFromConfig,
    MATCH,
    Tag,
    swiftBundle,
    swift,
    WRAP
} from "polygraphic"
import { IOSConfig } from './types';

const keys = <T>(input: T): Array<keyof T> => Object.keys(input) as Array<keyof T>;

const colorMap: Record<string, string> = {
	white: "#ffffff",
	black: "#000000",
	gray: "#808080",
	purple: "#6a0dad"
};

export const transformColor = (input: string | undefined) => {
	if(typeof input !== "string") return "";
	if(!input) return "";
	if(input[0] === "#") {
		if(input.length === 9) {
			return `#${input.slice(-2)}${input.slice(1, -2)}`;
		}
		return input;
	}
	return colorMap[input] ?? input;
};

const isDirectory = async (file : string) => {
	const stat = await fs.stat(file);
	return stat.isDirectory();
};

const getFilesInFolder = async (folder : string) : Promise<string[]> => {
	const files = await fs.readdir(folder);
	return files.reduce(async (files, file) => {
		const fullpath = path.join(folder, file);
		return [
			...await files,
			...(await isDirectory(fullpath) ? await getFilesInFolder(fullpath) : [
				fullpath
			])
		];
	}, Promise.resolve<string[]>([]));
};

const inject = ({
	files,
	name,
	template,
	content
} : {
    files : Record<string, Buffer | string>, 
    name : string, 
    template : string, 
    content : string
}) => {
	Object.keys(files).forEach((file) => {
		if(file.toLowerCase().includes(name.toLowerCase())) {
			let fileContent = files[file];
			if(fileContent instanceof Buffer) {
				fileContent = fileContent.toString("utf-8");
			}
			files[file] = fileContent.replace(
				RegExp(`/\\*=${template}\\*/`, "g"), (replaced) => `${replaced}\n${content}`
			).replace(
				RegExp(`<!--=${template}-->`, "g"), (replaced) => `${replaced}\n${content}`
			);
		}
	});
};

export const ios = <Global extends GlobalState>(
	app : ComponentFromConfig<Global, Global>
) => async (
    generateState : (config : (config : EventConfig<GlobalState, null, null>) => ProgrammingLanguage) => Global
) => {
	const files = await getFilesInFolder(path.join(__dirname, "..", "ios"));
	const baseFolder = path.join(__dirname, "..");
	const config : IOSConfig = {
        isRoot : true,
        tabs : "\t\t",
		dependencies : new Set<string>([]),
		files : await files.reduce(async (files, path) => {
			return {
				...await files,
				[path.slice(baseFolder.length + 1)] : await fs.readFile(path)
			};
		}, Promise.resolve({}))
	};
	inject({
		content: `<key>NSMicrophoneUsageDescription</key>
<string>Create tasks using your voice</string>
<key>NSSpeechRecognitionUsageDescription</key>
<string>Create tasks using your voice</string>`,
		files: config.files,
		name: "Info.plist",
		template: "manifest"
	})
	const generated = compile(generateState as unknown as (config : any) => ProgrammingLanguage, config.dependencies);
	const state = execute(generated, {}) as Global;
	state.features = ["speech.listen"];
	inject({
		files: config.files,
		name:"ContentView.swift",
		content:`var global : Any? = UserDefaults.standard.object(forKey : "State") as? [String : Any?] ?? ${toSwift([() => generated], config.dependencies, "")}`,
		template: "views"
	})
    const root = app({
        global : state,
        local : state,
        parent : {
            id: "main",
            height : MATCH,
            width : MATCH,
            name : "root",
        }
    })

    inject({
        files : config.files,
        name : "ContentView.swift",
        content : `\t\t\tmain(state : $state.onUpdate {
				save()
			}, local : state)`,
        template : "main"
    })

    inject({
        template: "views",
        files : config.files,
        name : "ContentView.swift",
        content : swiftBundle()
    })
    
    inject({
        template: "views",
        files : config.files,
        name : "ContentView.swift",
        content : await render(root, state, state, {
            ...config,
            isRoot: true
        })
    })
    
    return config.files
}

const isParent = ["ZStack"]

const stdTag = (name : string) => ({
    content,
    props,
    tabs
}) => {
    return `${tabs}${name}${content || isParent.includes(name) ? ` {
${content} 
${tabs}}` : ""}${props}`
}


const getTag = (
    name : Tag, 
    config : {
        id : string
        content : string
        props : string
        tabs : string
        dependencies : Set<string>
        component : Component<any, any>
    }
) : string => {
    const { component } = config
    switch(name) {
        case "button": return stdTag(`Button(action : {
${toSwift(component.onClick, config.dependencies, `${config.tabs}\t`)}
${config.tabs}\twithAnimation { state = global }
${config.tabs}}, label : {
${config.content}
${config.tabs}})`)({
            ...config,
            content: ""
        })
        case "checkbox": return stdTag(`CheckboxField(checked : value)`)(config)
        case "column": return stdTag(`VStack(alignment: .${getCrossAxisAlignment(component)}, spacing: 0)`)(config)
        case "date": 
			return `${config.tabs}PollyDatePicker(
${config.tabs}\ttitle : "${component.placeholder || ""}",
${config.tabs}\tcomponent : component,
${config.tabs}\tcallback : { event in 
${toSwift(component.onChange, config.dependencies, `${config.tabs}\t\t`)}
${config.tabs}\t\twithAnimation { state = global }
${config.tabs}\t})${config.props}`;
		
        case "image": {
			const {src} = component;
			const observedSrc = config.dependencies.has("event.src") ? "getSource(input : component[\"src\"]) ?? " : "";
			const observedAlt = config.dependencies.has("event.alt") ? "component[\"alt\"] as? String ?? " : "";
			const name = src.slice(src.lastIndexOf(path.sep) + 1, src.indexOf("."))
			return `${config.tabs}Image(${observedSrc}"${name}", label : Text(${observedAlt}"${component.alt ?? ""}"))
${config.tabs}.resizable()
${config.tabs}.scaledToFit()`;
		}
        case "input": return stdTag(`TextField(\"${component.placeholder || ""}\", text : value${
	component.onEnter ? `, onEditingChanged : { _ in }, onCommit : {
${toSwift(component.onEnter, config.dependencies, `${config.tabs}\t`)}
${config.tabs}\twithAnimation { state = global }
${config.tabs}})` : ")"}`)(config)
        case "root": return stdTag("ZStack")(config)
        case "row": return stdTag(`HStack(alignment: .${getCrossAxisAlignment(component)}, spacing: 0)`)(config)
        case "scrollable": return stdTag("ScrollView")(config)
        case "select": 
			return `${config.tabs}Picker(
${config.tabs}\ttitle : "${component.placeholder || ""}",
${config.tabs}\tcomponent : component,
${config.tabs}\tcallback : { event in 
${toSwift(component.onChange, config.dependencies, `${config.tabs}\t\t`)}
${config.tabs}\t\twithAnimation { state = global }
${config.tabs}\t},
${config.tabs}\tcolor : Color(hex : "${transformColor(component.color)}")
${config.tabs})${config.props}`;
        case "stack": return stdTag("ZStack")(config)
        case "option": 
        case "text": return stdTag(`Text(${
			config.dependencies.has("event.text") ? 
			"component[\"text\"] as? String ?? \"\"" : 
			config.dependencies.has("event.markdown") ? 
			"component[\"markdown\"] as? String ?? \"\"" : 
			`"${component.text}"`
		})`)(config)
    }
}

const handleImage = async (src: string, config: IOSConfig) : Promise<void> => {
	const name = src.slice(src.lastIndexOf("/") + 1, src.indexOf("."));
	const dir = path.join("ios", "Polygraphic", "Assets.xcassets", `${name}.imageset`);
	const file = await fs.readFile(src.slice(src.indexOf(":") + 1), "utf-8");

	config.files[path.join(dir, "Contents.json")] = JSON.stringify(generateContentsFiles(name), null, "\t");

	[1, 2, 3].forEach((number) => {
		config.files[path.join(dir, `${name}-${number}.svg`)] = file
	});
};

const generateContentsFiles = (name : string) => ({
	"images" : [
		{
			"filename" : `${name}-1.svg`,
			"idiom" : "universal",
			"scale" : "1x"
		},
		{
			"filename" : `${name}-2.svg`,
			"idiom" : "universal",
			"scale" : "2x"
		},
		{
			"filename" : `${name}-3.svg`,
			"idiom" : "universal",
			"scale" : "3x"
		}
	],
	"info" : {
		"author" : "xcode",
		"version" : 1
	}
});

const toSwift = (
    code : Array<(event : any) => void>,
    dependencies : Set<string>,
    tabs : string
) : string => {
    return (code || []).map(item => {
        const generated = compile(item as () => any, dependencies)
        return swift(generated, tabs)
    }).join("\n")
}

const getTransition = (component : Component<any, any>) => {
	if(component.id === "screen") {
		return ".move(edge : .trailing)"
	}
	if(component.id === "modal") {
		return ".opacity"
	}
	return `getTransition(animation : idmap.map[\"animation\"] as? [String:Any?] ?? [:])`
}

const render = async <Global extends GlobalState>(
    component : Component<Global, Global>, 
    global : any,
    local : any,
    config : IOSConfig
) : Promise<string> => {
	if(component.src) {
		await handleImage(component.src, config)
	}
    const dependencies = new Set<string>([])
    const children = (await Promise.all((component.children || []).map(async child => {
        if(child.id && !["screen", "modal"].includes(child.id)) {
            inject({
                template: "views",
                files : config.files,
                name : "ContentView.swift",
                content : await render(child, global, local, {
                    ...config,
                    tabs : "\t\t",
                    isRoot : true
                })
            })
            return `${config.tabs}\t\t${child.id}(state : $state, local : local)`
        } else {
            return render(child, global, local, {
                ...config,
                tabs : config.tabs + "\t",
                isRoot : false
            })
        }
    }))).join(`\n`)
    const adapters = component.adapters ? `${config.tabs}\t\tif let data = component["data"] as? [Any?] {
${config.tabs}\t\t\tlet identifiables = data.map {
${config.tabs}\t\t\t\treturn IdentifiableMap(any : $0)
${config.tabs}\t\t\t}
${config.tabs}\t\t\tForEach(identifiables) { idmap in
${config.tabs}\t\t\t\tlet index = Double(identifiables.firstIndex(where : { item in
${config.tabs}\t\t\t\t\treturn idmap.id == item.id
${config.tabs}\t\t\t\t}) ?? -1)
${config.tabs}\t\t\t\tlet adapter = idmap.map["adapter"] as? String ?? "adapter"
${config.tabs}\t\t\t\t${(await Promise.all(Object.keys(component.adapters).map(async key => {
        const instance = component.adapters[key]({
            global,
            local,
            parent: {
                id: `${component.id}_${key}`,
                height : MATCH,
                width : MATCH,
                name : "root"
            }
        })
		const child = (instance.children ?? [])[0]
        inject({
            template: "views",
            files : config.files,
            name : "ContentView.swift",
            content : await render({
				...child,
				id: instance.id
			}, global, local, {
                ...config,
                tabs : "\t\t",
                isRoot: true
            })
        })
        return `if adapter == ${JSON.stringify(key)} { ${instance.id}(state : $state, local : idmap.map).transition(${getTransition(child)}).zIndex(index) }`
    }))).join(`\n\t\t\t\t${config.tabs}`)}
${config.tabs}\t\t\t}
${config.tabs}\t\t}` : ""
    const content = [
        children,
        adapters
    ].filter(_ => _).join(`\n`)
	if(component.onBack) {
		inject({
			files : config.files,
			name : "ContentView.swift",
			template : "onBack",
			content : toSwift(component.onBack, dependencies, "\t\t\t")
		})
	}
    const observe = toSwift(component.observe, dependencies, "\t\t")
    const props = (await Promise.all(keys(component).map(key => getComponentProp(
        component,
        key,
        dependencies,
        {
            ...config,
            tabs : config.tabs + "\t"
        }
    )))).filter(_ => _).join(`\n\t${config.tabs}`) + handleBoxProps(component, dependencies, config) + handleDependencies(dependencies, config);
    dependencies.forEach(dependency => {
        config.dependencies.add(dependency)
    })
    const tag = getTag(component.name, {
        id : component.id,
        content,
        props,
        tabs : config.tabs + "\t",
        dependencies,
        component
    }) + ".border(Color.red)"
    if(component.name === "root" || config.isRoot) {
        return `
struct ${component.id}: View {
	@Binding var state : Any?
	var local : Any?${
component.observe ? `
    func observe() -> [String : Any?] {
		let global = state
        var event : Any? = [:]
${observe}
        return event as! [String : Any?]
    }` : ""
}
    var body: some View {${
    component.observe ? "\n\t\tlet component : [String : Any?] = observe()" : ""
}${
    component.name === "checkbox" ? `\n\t\tlet value = Binding<Bool>(get : {
			return component["value"] as? Bool ?? false
		}, set : { event in
${toSwift(component.onChange, config.dependencies, "\t\t\t")}
			withAnimation { state = global }
		})` : ""
}${
    ["input", "select"].includes(component.name) ? `\n\t\tlet value = Binding<String>(get : {
			return component["value"] as? String ?? ""
		}, set : { event in
${toSwift(component.onChange, config.dependencies, "\t\t\t")}
			withAnimation { state = global }
		})` : ""
}
${handlePosition(component, tag, dependencies, config)}
    }
}`
    }
    return tag
}

const handlePosition = (component: Component<any, any>, child: string, dependencies : Set<string>, config: IOSConfig): string => {
	if(component.position) {
		const position = component.position;
		const observedAlignment = dependencies.has("event.position") ? "getAlignment(position : component[\"position\"]) ?? " : "";
		const observedPosition = dependencies.has("event.position") ? "component[\"position\"] ?? " : "";
		const coord = keys(position);
		const v = coord.includes("top") ? "top" : coord.includes("bottom") ? "bottom" : "top";
		const h = coord.includes("left") ? "leading" : coord.includes("right") ? "trailing" : "leading";
		const alignment = `${v}${h[0].toUpperCase()}${h.slice(1)}`;
		const padding = `\n${config.tabs}.position(position : ${observedPosition}[
${config.tabs}\t"top" : Double(${position.top ?? 0}),
${config.tabs}\t"right" : Double(${position.right ?? 0}),
${config.tabs}\t"bottom" : Double(${position.bottom ?? 0}),
${config.tabs}\t"left" : Double(${position.left ?? 0}),
${config.tabs}])`;
		return `ZStack(alignment : ${observedAlignment}.${alignment}) {
${child}${padding}
}.frame(
	maxWidth: .infinity,
	maxHeight: .infinity,
	alignment: ${observedAlignment}.${alignment}
)`;
	}
	return `ZStack {
${child}
}`;
};

const handleDependencies = (
	dependencies : Set<string>,
	config: IOSConfig
): string => {
	return Array.from(dependencies).map(dependency => {
		switch(dependency) {
		case "event.animation":
			return ".transition(getTransition(animation : component[\"animation\"] as? [String:Any?] ?? [:]))";
		case "event.disabled":
			return ".disabled(hasValue(input : component[\"disabled\"]))";
		case "event.visible":
			return ".isVisible(hasValue(input : component[\"visible\"]))";
		case "event.color":
			return ".foregroundColor(Color(hex : component[\"color\"] as? String ?? \"#000\"))";
		}
		return "";
	}).filter(_ => _).join(`\n${config.tabs}`);
};


const getComponentProp = async (
	component: Component<any, any>,
	key: string,
    dependencies : Set<string>,
	config: IOSConfig
): Promise<string> => {
	switch(key) {
	case "manifest": {
		const manifest = component[key]
		const contents = {
			"images" : [
				{
					"idiom" : "iphone",
					"scale" : "2x",
					"size" : "20x20"
				},
				{
					"idiom" : "iphone",
					"scale" : "3x",
					"size" : "20x20"
				},
				{
					"idiom" : "iphone",
					"scale" : "2x",
					"size" : "29x29"
				},
				{
					"idiom" : "iphone",
					"scale" : "3x",
					"size" : "29x29"
				},
				{
					"idiom" : "iphone",
					"scale" : "2x",
					"size" : "40x40"
				},
				{
					"idiom" : "iphone",
					"scale" : "3x",
					"size" : "40x40"
				},
				{
					"idiom" : "iphone",
					"scale" : "2x",
					"size" : "60x60"
				},
				{
					"idiom" : "iphone",
					"scale" : "3x",
					"size" : "60x60"
				},
				{
					"idiom" : "ipad",
					"scale" : "1x",
					"size" : "20x20"
				},
				{
					"idiom" : "ipad",
					"scale" : "2x",
					"size" : "20x20"
				},
				{
					"idiom" : "ipad",
					"scale" : "1x",
					"size" : "29x29"
				},
				{
					"idiom" : "ipad",
					"scale" : "2x",
					"size" : "29x29"
				},
				{
					"idiom" : "ipad",
					"scale" : "1x",
					"size" : "40x40"
				},
				{
					"idiom" : "ipad",
					"scale" : "2x",
					"size" : "40x40"
				},
				{
					"idiom" : "ipad",
					"scale" : "1x",
					"size" : "76x76"
				},
				{
					"idiom" : "ipad",
					"scale" : "2x",
					"size" : "76x76"
				},
				{
					"idiom" : "ipad",
					"scale" : "2x",
					"size" : "83.5x83.5"
				},
				{
					"idiom" : "ios-marketing",
					"scale" : "1x",
					"size" : "1024x1024"
				}
			],
			"info" : {
				"author" : "xcode",
				"version" : 1
			}
		}
		config.files[path.join("ios", "Polygraphic", "Assets.xcassets", "AppIcon.appiconset", "Contents.json")] = JSON.stringify({
			...contents,
			images: contents.images.map(info => {
				const size = parseFloat(info.size);
				const scale = parseFloat(info.scale);
				return {
					...info,
					filename: `icon-${size}-${scale}.png`, 
				};
			})
		})
		const percent = manifest.icons.percent
		await Promise.all(contents.images.map(async (info) => {			
			const size = parseFloat(info.size);
			const scale = parseFloat(info.scale);
			const calculated = size * scale
			const name = `icon-${size}-${scale}.png`;
			const icon = manifest.icons.src.slice(7);
			const background = manifest.theme_color;
			await handleImage(icon, config)
			const canvas = createCanvas(calculated, calculated)
			const context = canvas.getContext("2d")
			const image = await loadImage(icon)
			image.width = calculated * percent
			image.height = calculated * percent
			context.fillStyle = background
			context.fillRect(0, 0, calculated, calculated)
			context.drawImage(
				image, 
				calculated / 2 - calculated * percent / 2, 
				calculated / 2 - calculated * percent / 2, 
				calculated * percent, 
				calculated * percent
			)
			config.files[path.join("ios", "Polygraphic", "Assets.xcassets", "AppIcon.appiconset", name)] = canvas.toBuffer("image/png")
		}))

		const project = config.files["ios/Polygraphic.xcodeproj/project.pbxproj"].toString("utf-8")
		config.files["ios/Polygraphic.xcodeproj/project.pbxproj"] = project.replace(/PRODUCT_BUNDLE_IDENTIFIER = com\.polygraphic\.Polygraphic;/g, `PRODUCT_BUNDLE_IDENTIFIER = ${manifest.package.ios};`)

		inject({
			files: config.files,
			name: "Info.plist",
			template: "manifest",
			content: `<key>CFBundleDisplayName</key>
<string>${manifest.short_name}</string>
<key>CFBundleShortVersionString</key>
<string>${manifest.version.name}</string>
<key>CFBundleVersion</key>
<string>${manifest.version.code}</string>
<key>CFBundleIdentifier</key>
<string>${manifest.package.ios}</string>`
		})
		return ""
	}
	case "width":
	case "height":
	case "grow":
		if(key === "width") {
			const observedMaxWidth = dependencies.has("event.width") ? "getMaxSize(input : component[\"width\"]) ?? " : "";
			const observedMaxHeight = dependencies.has("event.height") ? "getMaxSize(input : component[\"height\"]) ?? " : "";
			const observedMinWidth = dependencies.has("event.width") ? "getMinSize(input : component[\"width\"]) ?? " : "";
			const observedMinHeight = dependencies.has("event.height") ? "getMinSize(input : component[\"height\"]) ?? " : "";
			return `.frame(
${config.tabs}	minWidth : ${observedMinWidth}${getMinSize(component, "width")},
${config.tabs}	maxWidth : ${observedMaxWidth}${getMaxSize(component, "width")}, 
${config.tabs}	minHeight : ${observedMinHeight}${getMinSize(component, "height")},
${config.tabs}	maxHeight : ${observedMaxHeight}${getMaxSize(component, "height")},
${config.tabs}	alignment : .${getAlignment(component)}
${config.tabs})`;
		}
		return "";
	case "weight":
	case "size":
		// bold medium regular
		if(key === "size") {
			const weight = {
				400: "regular",
				500: "medium",
				700: "bold"
			}[component["weight"] ?? 400] ?? "regular";
			return `.font(.system(size : ${component[key]}, weight : .${weight}))`;
		}
		return "";
	case "align": {
		if(component.name === "text") {
			const alignment = {
				"start" : "leading",
				"center": "center",
				"end": "trailing"
			}[component[key] ?? "start"];
			return `.multilineTextAlignment(.${alignment})`;
		}
		return "";
	}
	case "opacity": {
		const observedBackground = dependencies.has("event.opacity") ? "component[\"opacity\"] as? Double ?? " : "";
		return `.opacity(${observedBackground}${component[key]})`;
	}
	case "color": {
		return `.foregroundColor(Color(hex : "${transformColor(component.color)}"))`;
	}
	case "onInit": {
		return `.onAppear {
${toSwift(component[key], dependencies, config.tabs + "\t")}
${config.tabs}\twithAnimation { state = global }
${config.tabs}}`;
	}
	case "funcs": {
		inject({
			files : config.files,
			name : "ContentView.swift",
			content : toSwift(component.funcs.map(it => () => it), dependencies, config.tabs),
			template : "funcs"
		})
		return ""
	}
	}
	return "";
};



const getMaxSize = (component : Component<any, any>, dimension : "width" | "height"): string => {
	const value = component[dimension];
	if(typeof value === "number" && isNaN(value)) {
		return "0";
	}
	if(
		(value === 0 && component.grow) ||
		value === MATCH
	) {
		return ".infinity";
	}
	if(value === undefined || value === null || value === WRAP) {
		return "nil";
	}
	return `${value / 2}`;
};

const getMinSize = (component : Component<any, any>, dimension : "width" | "height"): string => {
	const value = component[dimension];
	if(typeof value === "number") {
		if(isNaN(value)) {
			return "0";
		}
		if(value >= 0) {
			return `${value / 2}`;
		}
	}
	return "0";
};

const getCrossAxisAlignment = (component : Component<any, any>) : string => {
	return {
		row : {
			start: "top",
			center: "center",
			end: "bottom"
		},
		column : {
			start: "leading",
			center: "center",
			end: "trailing"
		}
	}[
		["column", "row"].includes(component.name) ? component.name : "column"
	][
		component.crossAxisAlignment || "start"
	]
}

const getAlignment = (component : Component<any, any>) : string => {
	const alignment : Record<"row" | "column", {
		start : {
			start : string
			center : string
			end : string
		}
		center : {
			start : string
			center : string
			end : string
		}
		end : {
			start : string
			center : string
			end : string
		}
	}> = {
		row : {
			// left to right
			start: {
				// top to bottom
				start : "topLeading",
				center : "leading",
				end : "bottomLeading"
			},
			center: {
				start : "top",
				center : "center",
				end : "bottom"
			},
			end: {
				start : "topTrailing",
				center : "trailing",
				end : "bottomTrailing"
			}
		},
		column : {
			// top to bottom
			start: {
				// left to right
				start : "topLeading",
				center : "top",
				end : "topTrailing"
			},
			center: {
				start : "leading",
				center : "center",
				end : "trailing"
			},
			end: {
				start : "bottomLeading",
				center : "bottom",
				end : "bottomTrailing"
			}
		}
	} as const
	const name = component.name
	const direction = alignment[["column", "row"].includes(name) ? name : "column"]
	const main = direction[component.mainAxisAlignment ?? "start"]
	const cross = main[component.crossAxisAlignment ?? "start"]
	return cross
};

const handleBoxProps = (component : Component<any, any>, dependencies : Set<string>, config : IOSConfig) => {
	return ["padding", "background", "margin"].map(key => {
		if(!component[key]) {
			return "";
		}
		switch(key) {
			case "padding": {
				const padding = component[key];
				if(padding) {
					return keys(padding).map(key => {
						const remap = {
							top: "top",
							bottom: "bottom",
							left: "leading",
							right: "trailing"
						}[key];
						return `.padding(.${remap}, ${padding[key]})`;
					}).join(`\n${config.tabs}`);
				}
				return "";
			}
			case "margin": {
				const margin = component[key];
				if(margin) {
					return keys(margin).map(key => {
						const remap = {
							top: "top",
							bottom: "bottom",
							left: "leading",
							right: "trailing"
						}[key];
						return `.padding(.${remap}, ${margin[key]})`;
					}).join(`\n${config.tabs}`);
				}
				return "";
			}
			case "background": {
				const width = component.width ?? 0;
				const height = component.height ?? 0;
				const round = component.round;
				const radius = round ? (
					round === width / 2 && round === height / 2 ? 
						".clipShape(Circle())" :
						`.cornerRadius(${round})`
				) : "";
				const shadow = component.shadow ? ".shadow(color : Color(hex : \"4d000000\"), radius: 4, x: 4, y: 4)" : "";
				const observedBackground = dependencies.has("event.background") ? "component[\"background\"] as? String ?? " : "";
				return `.background(Color(hex : ${observedBackground}"${transformColor(component.background)}"))${
					radius ? `\n${config.tabs}${radius}` : ""
				}${
					shadow ? `\n${config.tabs}${shadow}` : ""
				}`;
			}
		}
	}).filter(_ => _).join(`\n\t${config.tabs}`)
}