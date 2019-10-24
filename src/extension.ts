// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from "vscode";

interface IGlobalContext {
	flcmPackageVersion?: string;
	flcmPackageLockVersion?: string;
}

export const GlobalContext: IGlobalContext = {
}

export async function activate(context: vscode.ExtensionContext) {
  //   try {
  let _packageJsonFiles = await vscode.workspace.findFiles("package.json");
  let _packageJsonFile = await vscode.workspace.openTextDocument(_packageJsonFiles[0].path);
  let packageJson = JSON.parse(_packageJsonFile.getText());

  let _packageLockJsonFiles = await vscode.workspace.findFiles("package-lock.json");
  let _packageLockJsonFile = await vscode.workspace.openTextDocument(_packageLockJsonFiles[0].path);
  let packageLockJson = JSON.parse(_packageLockJsonFile.getText());

  let flmcVersion = packageJson["dependencies"]["flmc-lite-renderer"];
  let flmcLockVersion = packageLockJson["dependencies"]["flmc-lite-renderer"]["version"];

  if (flmcVersion != null) {
    vscode.window.showInformationMessage(
      `FLMC detected`,
      `package.json:${flmcVersion}`,
      `package-lock.json:${flmcLockVersion}`
	);
	GlobalContext.flcmPackageLockVersion = flmcVersion;
	GlobalContext.flcmPackageLockVersion = flmcLockVersion;
    activeInsideFlmcPackage(context);
    // we can be sure this is a flmc package
  }
  //   } catch (e) {
  // 	  /* TODO: ignore errors */
  // 	  throw e
  //    }
}

async function activeInsideFlmcPackage(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand("extension.helloWorld", () => {
    vscode.window.showInformationMessage("Hello World!");
  });

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}
