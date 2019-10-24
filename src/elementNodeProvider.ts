import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as ts from "@typescript-eslint/parser";
import { AST_NODE_TYPES, ParserServices, TSESTree } from "@typescript-eslint/typescript-estree";

interface ParseForESLintResult {
  ast: TSESTree.Program & {
    range?: [number, number];
    tokens?: TSESTree.Token[];
    comments?: TSESTree.Comment[];
  };
}

export class ElementNodeProvider implements vscode.TreeDataProvider<Element> {
  private _onDidChangeTreeData: vscode.EventEmitter<Element | undefined> = new vscode.EventEmitter<
    Element | undefined
  >();
  readonly onDidChangeTreeData: vscode.Event<Element | undefined> = this._onDidChangeTreeData.event;

  lastParsed: ParseForESLintResult["ast"] | null = null;

  constructor() {}

  refresh(textDocument: vscode.TextDocument): void {
    this.lastParsed = ts.parse(textDocument.getText(), {
      comment: true,
      ecmaFeatures: {
        jsx: true
      },
      ecmaVersion: 2019,
      sourceType: "module"
    });
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: Element): vscode.TreeItem {
    return element;
  }

  getChildren(element?: Element): Thenable<Element[]> {
    if (element) return Promise.resolve(element.children);
    if (this.lastParsed == null) {
      return Promise.resolve([]);
    }
    let body = this.lastParsed;
    // for (const dec of this.lastParsed.declarations) {
    //   if (dec instanceof ts.ClassDeclaration) {
    //     let elementProp = dec.properties.find(x => x.name === "elements");
    //     if (dec.name.endsWith("Form") && elementProp != null) {
    //       console.log("test");
    //     }
    //   }
    // }

    // let elemetns: Element[] = this.lastParsed.imports.map(v => new Element(v.libraryName, "lib"));

    return Promise.resolve(sourceToTreeViewElements(body));
  }
}

export class Element extends vscode.TreeItem {
  constructor(public readonly label: string, private version: string, public children: Element[]) {
    super(
      label,
      children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None
    );
  }

  get tooltip(): string {
    return `${this.label}-${this.version}`;
  }

  get description(): string {
    return this.version;
  }

  contextValue = "element";
}

function findForm(body: ParseForESLintResult["ast"]): TSESTree.ClassDeclaration | null {
  let _exportedClasses = body.body
    .filter(
      x =>
        (x.type == AST_NODE_TYPES.ExportNamedDeclaration || x.type == AST_NODE_TYPES.ExportDefaultDeclaration) &&
        (x as any).declaration &&
        (x as any).declaration.type == AST_NODE_TYPES.ClassDeclaration
    )
    .map(x => (x as any).declaration) as TSESTree.ClassDeclaration[];

  return _exportedClasses.find(
    x => x.id.name.endsWith("Form") && (x.superClass as any).name.endsWith("FormController")
  );
}

function findElementsPropery(form: TSESTree.ClassDeclaration): TSESTree.ClassProperty | null {
  return form.body.body.find(x => {
    return x.type == AST_NODE_TYPES.ClassProperty && (x as any).key.name === "elements";
  }) as any;
}

function convertElementsToTreeViewElements(element: TSESTree.ArrayExpression): Element[] {
  return element.elements.map(v => {
    let elementDef = callExpressionToElementDefinition(v as TSESTree.CallExpression);
    let children: Element[] = [];
    let description = "Description";
    if (elementDef.name == "Container" || elementDef.name == "PaddedContainer") {
      children = convertElementsToTreeViewElements(elementDef.rootCallExpression.arguments[0] as any);
    }
    return new Element(elementDef.name, description, children);
  });
}

function callExpressionToElementDefinition(call: TSESTree.CallExpression): ElementDefinition {
  let attributes: ElementDefinitionAttribute[] = [];

  let _currentCallExp: any = call;
  loop: while (true) {
    if (_currentCallExp.callee.property == null) break loop;
    attributes.push({
      name: _currentCallExp.callee.property.name,
      value: _currentCallExp.arguments
    });
    if (_currentCallExp.callee.object) {
      _currentCallExp = _currentCallExp.callee.object;
      if (_currentCallExp.callee.property == null || _currentCallExp.property == null) {
        break loop;
      }
    } else break loop;
  }

  _currentCallExp = _currentCallExp.callee.object == null ? _currentCallExp : _currentCallExp.callee.object;

  let name = _currentCallExp.callee == null ? "Unknown" : _currentCallExp.callee.name;
  let args = _currentCallExp.arguments;
  return {
    name: name == null ? "Unknown" : name,
    attributes: args,
    rootCallExpression: _currentCallExp
  };
}

function sourceToTreeViewElements(body: ParseForESLintResult["ast"]): Element[] {
  let _class = findForm(body);
  if (_class == null) return [];
  let _elementProp = findElementsPropery(_class);
  if (_elementProp == null) return [];
  return convertElementsToTreeViewElements(_elementProp.value as any);
}

interface ElementDefinitionAttribute {
  name: string;
  value: any;
}

interface ElementDefinition {
  name: string;
  attributes: ElementDefinitionAttribute[];
  rootCallExpression: TSESTree.CallExpression;
}
