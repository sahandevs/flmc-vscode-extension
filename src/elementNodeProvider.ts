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

  lastElements: Element[] = [];

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
    let elements: Element[];
    // try {
    elements = sourceToTreeViewElements(body);
    //   this.lastElements = elements;
    // } catch (e) {
    //   elements = this.lastElements;
    // }

    return Promise.resolve(elements);
  }
}

export class Element extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    private version: string,
    public children: Element[],
    private lineNumber: number
  ) {
    super(label, children.length > 0 ? vscode.TreeItemCollapsibleState.Expanded : vscode.TreeItemCollapsibleState.None);
  }

  command = {
    title: "goto element",
    command: "extension.flmc.goto-element-line",
    arguments: [this.lineNumber]
  };

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
  if (element.elements == null)
    // handles contaienr with observable
    return [];
  return element.elements
    .map(v => callExpressionToElementDefinition(v as TSESTree.CallExpression))
    .filter(
      v =>
        !vscode.workspace
          .getConfiguration()
          .get<string>("flmc.ignoredElementsInInspector")
          .includes(v.name)
    )
    .map(elementDef => {
      let children: Element[] = [];
      let description = "";
      let name = elementDef.name;
      if (elementDef.name == "Container" || elementDef.name == "PaddedContainer") {
        children = convertElementsToTreeViewElements(elementDef.rootCallExpression.arguments[0] as any);
        let direction = elementDef.attributes.find(x => x.name === "direction");
        if (direction) {
          name = direction.value[0].property.name;
        } else {
          name = "Column";
        }
        name = name === "Column" || name === "Row" ? name : "Container";
        name = elementDef.name === "PaddedContainer" ? `Padded${name}` : name;
        description = "";
      } else if (elementDef.name == "TextInput" || elementDef.name == "SelectBox") {
        let label = elementDef.attributes.find(x => x.name === "label");
        if (label) {
          description = label.value[0].value;
          if (!description) {
            description = label.value[0].property.name;
          }
        }
      } else if (elementDef.name == "Button" || elementDef.name == "Label") {
        let label = elementDef.rootCallExpression.arguments[0] as any;
        if (label) {
          description = typeof label.value == "string" ? label.value : "";
        }
      } else if (elementDef.name == "Tab") {
        let tabElements = elementDef.attributes.find(x => x.name === "tabElements").value[0];
        if (tabElements) {
          children = convertElementsToTreeViewElements(tabElements as any);
        }
      } else if (elementDef.name == "TextInputPlus") {
        let label = (elementDef.rootCallExpression.arguments[0] as any).properties.find(x => x.key.name == "label")
          .value.property.name;
        description = label;
      }
      return new Element(
        elementDef.meta.displayName || description,
        name,
        children,
        elementDef.rootCallExpression.loc.start.line
      );
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
      if (_currentCallExp.callee.property == null) {
        break loop;
      }
    } else break loop;
  }

  _currentCallExp = _currentCallExp.callee.object == null ? _currentCallExp : _currentCallExp.callee.object;

  let name = _currentCallExp.callee == null ? "Unknown" : _currentCallExp.callee.name;

  let metaElement = attributes.find(x => x.name === "meta");
  let elementMeta: ElementMeta = {};
  if (metaElement) {
    elementMeta = convertObjectExpressionToMeta(metaElement.value[0]);
  }

  return {
    name: name == null ? "Unknown" : name,
    attributes: attributes,
    rootCallExpression: _currentCallExp,
    meta: elementMeta
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
  meta: ElementMeta;
}

type ElementMeta = {
  displayName?: string;
};

function convertObjectExpressionToMeta(expr: TSESTree.ObjectExpression): ElementMeta {
  let _result: any = {};
  for (let _prop of expr.properties) {
    let prop = _prop as any;
    _result[prop.key.name] = prop.value.value;
  }
  return _result;
}
