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
    swiftBundle
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


const getTag = (name : Tag) : (config : {
    id : string
    content : string
    props : string
    tabs : string
}) => string => {
    switch(name) {
        case "button": return stdTag("Button")
        case "checkbox": return stdTag("CheckboxField")
        case "column": return stdTag("VStack")
        case "date": return stdTag("ZStack")
        case "image": return stdTag("Image(\"\")")
        case "input": return stdTag("TextField")
        case "option": return stdTag("Text")
        case "root": return stdTag("ZStack")
        case "row": return stdTag("HStack")
        case "scrollable": return stdTag("ScrollView")
        case "select": return stdTag("Picker")
        case "stack": return stdTag("ZStack")
        case "text": return stdTag("Text(\"\")")
    }
}


const render = <Global extends GlobalState>(
    component : Component<Global, Global>, 
    global : any,
    local : any,
    config : IOSConfig
) => {
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
            return `${config.tabs}\t${child.id}()`
        } else {
            return render(child, global, local, {
                ...config,
                tabs : config.tabs + "\t",
                isRoot : false
            })
        }
    }).join(`\n`)
    const adapters = component.adapters ? `${config.tabs}\tif let data = component["data"] as? [Any?] {
${config.tabs}\t\tlet identifiables = data.map {
${config.tabs}\t\t\treturn IdentifiableMap(any : $0)
${config.tabs}\t\t}
${config.tabs}\t\tForEach(identifiables) { idmap in
${config.tabs}\t\t\tlet index = Double(identifiables.firstIndex(where : { item in
${config.tabs}\t\t\t\treturn idmap.id == item.id
${config.tabs}\t\t\t}) ?? -1)
${config.tabs}\t\t\tlet adapter = idmap.map["adapter"] as? String ?? "adapter"
${config.tabs}\t\t\t${Object.keys(component.adapters).map(key => {
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
${config.tabs}\t\t}
${config.tabs}\t}` : ""

    const content = [
        children,
        adapters
    ].filter(_ => _).join(`\n`)
    if(component.name === "root" || config.isRoot) {
        return `
struct ${component.id}: View {
    var body: some View {
        let component : [String : Any?] = [:]
        ZStack {
${content}
        }
    }
}`
    }
    const tag = getTag(component.name)

    return tag({
        id : component.id,
        content,
        props : "",
        tabs : config.tabs
    })
}
