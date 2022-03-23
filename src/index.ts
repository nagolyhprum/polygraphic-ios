import fs from 'fs/promises'
import path from 'path'
import {
    GlobalState,
    Component,
    EventConfig,
    ProgrammingLanguage,
    compile,
    execute
} from "polygraphic"
import { IOSConfig } from './types';

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

export const ios = <Global extends GlobalState>(
    app : Component<Global, Global>
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
		dependencies : new Set<string>([]),
		files : await files.reduce(async (files, path) => {
			return {
				...await files,
				[path.slice(baseFolder.length + 1)] : await fs.readFile(path)
			};
		}, Promise.resolve({}))
	};

    return config.files
}

