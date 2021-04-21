'use strict';

import * as vscode from 'vscode';
import * as HTMLparser from 'node-html-parser';

const sum = require('hash-sum');
const fs = require('fs');
const path = require("path");

export function activate(context: vscode.ExtensionContext) {
	const disposable = vscode.commands.registerCommand('extension.genLess', function () {
		// Get the active text editor
		const editor = vscode.window.activeTextEditor;

		if (editor) {
			const document = editor.document;

			// Recup le contenu de l'editeur

			const text = document.getText();

			// Check si c'est du HTML

			const isValid = HTMLparser.valid(text);

			console.log(isValid);

			if (isValid) {
				const root = HTMLparser.parse(text);

				/* #region  Processing the DOM */

				const processElement = (el: HTMLparser.HTMLElement, level: number, output: Array<SelectorObj>) => {

					level++;

					let hash = sum(el);

					if (el.childNodes && el.childNodes.length > 0) {

						el.childNodes.forEach((child) => {

							if (child instanceof HTMLparser.TextNode) {

								// Si c'est un textNode, on fait rien

							} else {
								let selectorString = ""
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
								let exist = output.some(e => e.selector === selectorString && e.level === level);

								if (!exist) {
									output.push(selectorObj);
								}



								processElement(child, level, output);
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

				let selectorsArray: Array<SelectorObj> = [];

				// Peuple selectorsArray
				// On process root, qui a son tour va process tout ces enfants recursivement
				processElement(root, 0, selectorsArray);

				/* #endregion */


				/* #region  Building the less string */

				// A partir du selectorsArray, crée un fichier less
				let lessString = "";

				let sortedSelectors = selectorsArray.sort((a, b) => {
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

					let childrens = source.filter(child => child.parentHash === topElement.elementHash);
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
				let highestLevelElement = sortedSelectors[0];

				lessString = buildLessString(highestLevelElement, sortedSelectors);

				console.log(lessString);

				/* #endregion */

				/* #region  From less string, create a .less file */

				let currentlyOpenTabfilePath = path.dirname(document.fileName);



				fs.writeFile(currentlyOpenTabfilePath + "/truc.less", lessString, function (err: any) {
					if (err) {
						return console.log(err);
					}
					console.log("The file was saved!");
				});



				/* #endregion */
			}
		}
	});

	context.subscriptions.push(disposable);
}