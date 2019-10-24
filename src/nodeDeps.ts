import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export class ElementNodeProvider implements vscode.TreeDataProvider<Element> {
  private _onDidChangeTreeData: vscode.EventEmitter<Element | undefined> = new vscode.EventEmitter<
    Element | undefined
  >();
  readonly onDidChangeTreeData: vscode.Event<Element | undefined> = this._onDidChangeTreeData.event;

  constructor() {}

  refresh(textDocument: vscode.TextDocument): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Element): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Element): Thenable<Element[]> {
    if (element) {
      return Promise.resolve([new Element("Test", "test")]);
    } else {
      return Promise.resolve([new Element("Test", "test")]);
    }
  }
}

export class Element extends vscode.TreeItem {
  constructor(public readonly label: string, private version: string) {
    super(label);
  }

  get tooltip(): string {
    return `${this.label}-${this.version}`;
  }

  get description(): string {
    return this.version;
  }

  iconPath = {
    light: path.join(__filename, "..", "..", "resources", "light", "dependency.svg"),
    dark: path.join(__filename, "..", "..", "resources", "dark", "dependency.svg")
  };

  contextValue = "dependency";
}
