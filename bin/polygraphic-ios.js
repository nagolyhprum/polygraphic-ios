#!/usr/bin/env node

// node bin/polygraphic-web.js pwa app/index.ts -o pwa

const yargs = require("yargs");
const {Parcel, createWorkerFarm} = require("@parcel/core");
const {MemoryFS} = require("@parcel/fs");
const fs = require("fs");
const path = require("path");
const { ios } = require("../dist/index.js");
const { mkdir, writeFile } = require("fs/promises");

const workerFarm = createWorkerFarm();
const outputFS = new MemoryFS(workerFarm);

yargs.scriptName("polygraphic-ios")
	.usage("$0 <cmd> [args]").command("build [path]", "build a polygraphic ios app", yargs => {
		yargs.positional("path", {
			type: "string",
			describe: "path to the root file"
		});
		yargs.alias("o", "outDir");
	}, async (argv) => {
		try {
			try {
				await mkdir(argv.o, {
					recursive: true
				});
			} catch(e){}
			const bundler = new Parcel({
				entries: argv.path,
				defaultConfig: "@parcel/config-default",
				mode: "production",
				workerFarm,
				outputFS
			});
			const {bundleGraph} = await bundler.run();
			for (let bundle of bundleGraph.getBundles()) {        
				await writeFile(path.join(argv.o, path.basename(bundle.filePath)), await outputFS.readFile(bundle.filePath, "utf8"));
			}
			await workerFarm.end();
			const dep = path.join(process.cwd(), argv.o, "index.js");
			const {
				default : {
					App, 
					state
				}
			} = require(dep);
			const output = await ios(App)(state);
			await Object.keys(output).reduce(async (promise, key) => {
				await promise;
				try {
					await mkdir(path.dirname(path.join(argv.o, key)), {
						recursive: true
					});
				} catch(e) {}
				try {
					const data = output[key];
					if(data) {
						await writeFile(path.join(argv.o, key), data);
					}
				} catch(e) {
					console.log("failed for", key);
				}
			}, Promise.resolve());
		} catch(e) {
			console.log("ERROR", e, JSON.stringify(e, null, "\t"));
		}
	})
	.help()
	.argv;
