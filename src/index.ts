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
    swift
} from "polygraphic"
import { IOSConfig } from './types';


const swiftUI = `

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
        }
        map = [:]
        id = ""
    }
}

`

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
	const dependencies = new Set<string>([]);
	const generated = compile(generateState as unknown as (config : any) => ProgrammingLanguage, dependencies);
	const state = execute(generated, {}) as Global;
	state.features = [];
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
${config.tabs}}, label : {
${config.content}
${config.tabs}})`)({
            ...config,
            content: ""
        })
        case "checkbox": return stdTag("CheckboxField(component : component, callback : { value in })")(config)
        case "column": return stdTag("VStack")(config)
        case "date": return stdTag("ZStack")(config)
        case "image": return stdTag("Image(\"\")")(config)
        case "input": return stdTag("TextField(\"\", text : $text)")(config)
        case "root": return stdTag("ZStack")(config)
        case "row": return stdTag("HStack")(config)
        case "scrollable": return stdTag("ScrollView")(config)
        case "select": return stdTag("Picker(\"\", selection : $selection)")(config)
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
    }).join(`\n\t\t\t${config.tabs}`)}
${config.tabs}\t\t\t}
${config.tabs}\t\t}` : ""
    const content = [
        children,
        adapters
    ].filter(_ => _).join(`\n`)
    const observe = toSwift(component.observe, dependencies, "\t\t")
    dependencies.forEach(dependency => {
        config.dependencies.add(dependency)
    })
    const tag = getTag(component.name, {
        id : component.id,
        content,
        props : "",
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
}${
    component.name === "input" ? "\n\t@State private var text : String = \"\"" : ""
}${
    component.name === "select" ? "\n\t@State private var selection : String = \"\"" : ""
}
    var body: some View {${
    component.observe ? "\n\t\tlet component : [String : Any?] = [:]" : ""
}
        ZStack {
${tag}
        }
    }
}`
    }
    return tag
}
