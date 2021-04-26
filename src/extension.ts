'use strict';

import * as vscode from 'vscode';
import * as HTMLparser from 'node-html-parser';
import fs = require('fs');
import path = require("path");

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sum = require('hash-sum');


export function activate(context: vscode.ExtensionContext) {

	const formatDocument = async (docUri: vscode.Uri): Promise<void> => {
		await vscode.window.showTextDocument(docUri);
		const textEdits = (await vscode.commands.executeCommand(
			'vscode.executeFormatDocumentProvider',
			docUri,
		)) as vscode.TextEdit[];
		const edit = new vscode.WorkspaceEdit();
		for (const textEdit of textEdits) {
			edit.replace(docUri, textEdit.range, textEdit.newText);
		}
		await vscode.workspace.applyEdit(edit);
		await vscode.window.activeTextEditor?.document.save();
	};

	const disposable = vscode.commands.registerCommand('extension.genLess', function () {

		// Get the active text editor
		const editor = vscode.window.activeTextEditor;

		let fileStylePath = "";

		if (editor) {
			const document = editor.document;

			// Recup le contenu de l'editeur

			const text = document.getText();

			// Recup le chemin vers la feuille de style

			// Check si c'est du HTML

			const isValid = HTMLparser.valid(text);

			console.log(isValid);

			if (isValid) {
				const root = HTMLparser.parse(text, { comment: true });

				const lessGenComment = root.childNodes.find(n => n.rawText.match(/lessgen@/));
				if (lessGenComment) {
					const match = lessGenComment.rawText.match(/lessgen@(.*)/);
					if (match) {
						// 0 : source
						// 1 : matching group
						fileStylePath = match[1];
					}
				}

				/* #region  Processing the DOM */

				const processElement = (el: HTMLparser.HTMLElement, level: number, output: Array<SelectorObj>) => {

					level++;

					const hash = sum(el);

					if (el.childNodes && el.childNodes.length > 0) {

						el.childNodes.forEach((child) => {

							if (child instanceof HTMLparser.TextNode) {

								// Si c'est un textNode, on fait rien

							} else {
								if (child instanceof HTMLparser.HTMLElement) {
									let selectorString = "";

									if (child.id) {

										selectorString += "#" + child.id;
									}

									if (child.classList && child.classList.length > 0) {

										selectorString += "." + child.classList.value.join(".");
									}

									const selectorObj = {
										selector: selectorString,
										elementHash: sum(child),
										parentHash: hash,
										level
									};

									// On check si ce level a deja ce selecteur
									const exist = output.some(e => e.selector === selectorString && e.level === level);

									if (!exist) {
										output.push(selectorObj);
									}


									processElement(child, level, output);
								}
							}
						});
					}
				};

				type SelectorObj = {
					selector: string,
					level: number,
					elementHash: string,
					parentHash: string,
				};

				const selectorsArray: Array<SelectorObj> = [];

				// Peuple selectorsArray
				// On process root, qui a son tour va process tout ces enfants recursivement
				processElement(root, 0, selectorsArray);

				/* #endregion */


				/* #region  Building the less string */

				// A partir du selectorsArray, crée un fichier less
				let lessString = "";

				const sortedSelectors = selectorsArray.sort((a, b) => {
					return a.level - b.level;
				});

				console.log(sortedSelectors);

				const buildLessString = (topElement: SelectorObj, source: Array<SelectorObj>) => {

					let output = "";

					if (topElement.selector) {
						// Selectorless element
						output += topElement.selector;
						output += "{";
					}

					const childrens = source.filter(child => child.parentHash === topElement.elementHash);
					if (childrens && childrens.length > 0) {
						childrens.forEach((c) => {
							output += buildLessString(c, source);
						});
					}

					if (topElement.selector) {
						// Selectorless element
						output += "}";
					}

					return output;
				};

				// Vu que le tableau est trié par level, le premier element est le plus haut
				const highestLevelElement = sortedSelectors[0];

				lessString = buildLessString(highestLevelElement, sortedSelectors);

				console.log(lessString);

				/* #endregion */

				/* #region  From less string, create a .less file */


				let baseSavePath = "";

				const workspace = vscode.workspace.getWorkspaceFolder(document.uri);

				if (workspace) {
					baseSavePath += workspace?.uri.fsPath + path.sep;
				}

				const currentlyOpenTabfilePath = path.dirname(document.fileName);
				const currentlyOpenTabfileName = path.basename(document.fileName, ".html");


				if (fileStylePath) {
					baseSavePath += fileStylePath;
				} else {
					baseSavePath += currentlyOpenTabfilePath + path.sep +`${currentlyOpenTabfileName}.less`;
				}

				baseSavePath = baseSavePath.trim();


				let savePath = baseSavePath;
				// On n'ecrase JAMAIS un fichier existant
				while (fs.existsSync(savePath)) {
					let i = 1;
					const pathObj = path.parse(baseSavePath);
					pathObj.name += `(${i})`;
					savePath = pathObj.dir + path.sep + pathObj.name + pathObj.ext;
					i++;
				}				


				fs.writeFile(savePath, lessString, (err: any) => {
					if (err) {
						return console.log(err);
					}

					console.log("The file was saved!");

					formatDocument(vscode.Uri.file(savePath)).then(() => {
						console.log("File beautified !");
					}, (err) => {
						console.error("Failed to beautify file : ", err);
					});

				});


				/* #endregion */
			}
		}
	});

	context.subscriptions.push(disposable);
}