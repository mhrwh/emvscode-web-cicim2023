import * as vscode from 'vscode';

interface ErrorDictionary {
    errorLine: number;
    errorColumn: number;
    errorNumber: number;
    errorMessage: string;
}

/**
 * Problemsにクリックできるエラーメッセージを追加する関数
 * @param {ErrorDictionary[]} errorList
 * @param {vscode.Uri} uri verifierを実行したmizarファイルのURI
 * @param {vscode.DiagnosticCollection} diagnosticCollection
 * diagnosticsをセットするための引数
 */
export function setDiagnostics(
    errorList: ErrorDictionary[],
    uri:vscode.Uri, 
    diagnosticCollection:vscode.DiagnosticCollection) {
    const diagnostics:vscode.Diagnostic[] = [];

    errorList.forEach((errorInfo: ErrorDictionary) => {
        const errorPosition = 
            new vscode.Position(errorInfo['errorLine'] - 1, errorInfo['errorColumn'] - 1);
        const errorRange = new vscode.Range(errorPosition, errorPosition);
        const diagnostic = 
            new vscode.Diagnostic(errorRange, errorInfo['errorMessage']);
        diagnostics.push(diagnostic);
    });
    
    diagnosticCollection.set(uri, diagnostics);
}
