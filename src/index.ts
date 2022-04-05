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
	gray: "#808080"
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
	const generated = compile(generateState as unknown as (config : any) => ProgrammingLanguage, config.dependencies);
	const state = execute(generated, {}) as Global;
	state.features = [];
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
        content : "\t\t\tmain()",
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
        content : render(root, global, global, {
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
${config.tabs}}, label : {
${config.content}
${config.tabs}})`)({
            ...config,
            content: ""
        })
        case "checkbox": return stdTag(`CheckboxField(checked : value)`)(config)
        case "column": return stdTag("VStack")(config)
        case "date": return stdTag("ZStack")(config)
        case "image": return stdTag("Image(\"\")")(config)
        case "input": return stdTag(`TextField(\"${component.placeholder || ""}\", text : value${
	component.onEnter ? `, onEditingChanged : { _ in }, onCommit : {
${toSwift(component.onEnter, config.dependencies, `${config.tabs}\t`)}
${config.tabs}})` : ")"}`)(config)
        case "root": return stdTag("ZStack")(config)
        case "row": return stdTag("HStack")(config)
        case "scrollable": return stdTag("ScrollView")(config)
        case "select": return stdTag("Picker(\"\", selection : value)")(config)
        case "stack": return stdTag("ZStack")(config)
        case "option": 
        case "text": return stdTag(`Text(${config.dependencies.has("event.text") ? "component[\"text\"] as? String ?? \"\"" : `"${component.text}"`})`)(config)
    }
}

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

const render = <Global extends GlobalState>(
    component : Component<Global, Global>, 
    global : any,
    local : any,
    config : IOSConfig
) : string => {
    const dependencies = new Set<string>([])
    const children = (component.children || []).map(child => {
        if(child.id) {
            inject({
                template: "views",
                files : config.files,
                name : "ContentView.swift",
                content : render(child, global, local, {
                    ...config,
                    tabs : "\t\t",
                    isRoot : true
                })
            })            
            return `${config.tabs}\t\t${child.id}()`
        } else {
            return render(child, global, local, {
                ...config,
                tabs : config.tabs + "\t",
                isRoot : false
            })
        }
    }).join(`\n`)
    const adapters = component.adapters ? `${config.tabs}\t\tif let data = component["data"] as? [Any?] {
${config.tabs}\t\t\tlet identifiables = data.map {
${config.tabs}\t\t\t\treturn IdentifiableMap(any : $0)
${config.tabs}\t\t\t}
${config.tabs}\t\t\tForEach(identifiables) { idmap in
${config.tabs}\t\t\t\tlet index = Double(identifiables.firstIndex(where : { item in
${config.tabs}\t\t\t\t\treturn idmap.id == item.id
${config.tabs}\t\t\t\t}) ?? -1)
${config.tabs}\t\t\t\tlet adapter = idmap.map["adapter"] as? String ?? "adapter"
${config.tabs}\t\t\t\t${Object.keys(component.adapters).map(key => {
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
        inject({
            template: "views",
            files : config.files,
            name : "ContentView.swift",
            content : render(instance, global, local, {
                ...config,
                tabs : "\t\t",
                isRoot: true
            })
        })
        return `if adapter == ${JSON.stringify(key)} { ${instance.id}() }`
    }).join(`\n\t\t\t\t${config.tabs}`)}
${config.tabs}\t\t\t}
${config.tabs}\t\t}` : ""
    const content = [
        children,
        adapters
    ].filter(_ => _).join(`\n`)
    const props = keys(component).map(key => getComponentProp(
        component,
        key,
        dependencies,
        {
            ...config,
            tabs : config.tabs + "\t"
        }
    )).filter(_ => _).join(`\n\t${config.tabs}`)
    const observe = toSwift(component.observe, dependencies, "\t\t")
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
    })
    if(component.name === "root" || config.isRoot) {
        return `
struct ${component.id}: View {${
component.observe ? `
    func observe() -> [String : Any?] {
        var event : Any? = [:]
${observe}
        return event as! [String : Any?]
    }` : ""
}
    var body: some View {${
    component.observe ? "\n\t\tlet component : [String : Any?] = [:]" : ""
}${
    component.name === "checkbox" ? `\n\t\tlet value = Binding<Bool>(get : {
			return component["value"] as? Bool ?? false
		}, set : { event in
${toSwift(component.onChange, config.dependencies, "\t\t\t")}
		})` : ""
}${
    ["input", "select"].includes(component.name) ? `\n\t\tlet value = Binding<String>(get : {
			return component["value"] as? String ?? ""
		}, set : { event in
${toSwift(component.onChange, config.dependencies, "\t\t\t")}
		})` : ""
}
        ZStack {
${tag}
        }
    }
}`
    }
    return tag
}

const handleDependencies = (
	dependencies : Set<string>,
	config: IOSConfig
): string => {
	return Array.from(dependencies).map(dependency => {
		switch(dependency) {
		case "component.disabled":
			return ".disabled(hasValue(input : component[\"disabled\"]))";
		case "component.visible":
			return ".isVisible(hasValue(input : component[\"visible\"]))";
		case "component.color":
			return ".foregroundColor(Color(hex : component[\"color\"] as? String ?? \"#000\"))";
		}
		return "";
	}).filter(_ => _).join(`\n${config.tabs}`);
};


const getComponentProp = (
	component: Component<any, any>,
	key: string,
    dependencies : Set<string>,
	config: IOSConfig
): string => {
	switch(key) {
	case "dependencies":
		return handleDependencies(dependencies, config);
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
	case "shadow":
	case "round":
	case "background": {
		if(key !== "background") return "";
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
		}`; // .border(Color.green)
	}
	case "color": {
		return `.foregroundColor(Color(hex : "${transformColor(component.color)}"))`;
	}
	case "onInit": {
		return `.onAppear {
${toSwift(component[key], dependencies, config.tabs + "\t")}
${config.tabs}}`;
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
	return `${value}`;
};

const getMinSize = (component : Component<any, any>, dimension : "width" | "height"): string => {
	const value = component[dimension];
	if(typeof value === "number") {
		if(isNaN(value)) {
			return "0";
		}
		if(value >= 0) {
			return `${value}`;
		}
	}
	return "0";
};


const getAlignment = (component : Component<any, any>) : string => {
	return {
		row : {
			start: "topLeading",
			center: "leading",
			end: "bottomLeading"
		},
		column : {
			start: "topLeading",
			center: "top",
			end: "topTrailing"
		}
	}[
		["column", "row"].includes(component.name) ? component.name : "column"
	][
		component.mainAxisAlignment ?? "start" // perpendicular
	];
};