import * as vscode from 'vscode';
import * as path from 'path';
import { DefinitionProvider} from './goToDefinition';
import { HoverProvider } from './hover';
import { interval_id, mizarVerify } from './mizarFunctions';
import { formatMizar } from './formatter';
import { commitChanges } from './commitChanges';

/**
 * コマンドを実行する関数を返す関数
 * @param {vscode.OutputChannel} channel
 * 結果を出力するチャンネル
 * @param {vscode.DiagnosticCollection} diagnosticCollection
 * diagnosticsをセットするための引数、セットにより問題パネルへ表示される
 * @param {string} command 実行するコマンドの名前
 * @return {function} コマンドを実行する処理の関数
 */
function returnExecutingFunction(
    channel:vscode.OutputChannel, 
    diagnosticCollection:vscode.DiagnosticCollection, 
    globalState:vscode.Memento & {
        setKeysForSync(keys: readonly string[]): void;
    },
    command:string,
)
{
    return async () => {
        // アクティブなエディタがなければエラーを示して終了
        if (vscode.window.activeTextEditor === undefined) {
            vscode.window.showErrorMessage('Not currently in .miz file!!');
            return;
        }
        // アクティブなファイルのパスを取得
        const uri = vscode.window.activeTextEditor.document.uri;
        // 拡張子を確認し、mizarファイルでなければエラーを示して終了
        if (path.extname(uri.fsPath) !== '.miz') {
            vscode.window.showErrorMessage('Not currently in .miz file!!');
            return;
        }
        channel.clear();
        channel.show(true);
        diagnosticCollection.clear();
        // コマンド実行前にファイルを保存
        await vscode.window.activeTextEditor.document.save();

        await commitChanges(globalState, uri);
        
        // makeenvとverifierの実行
        await mizarVerify(channel, command, uri, diagnosticCollection);
    };
}

interface StrStrDictionary {
    [key: string]: string;
}

const MIZAR_COMMANDS:StrStrDictionary = {
    "mizar-verify":"verifier",
    'mizar-irrths': 'irrths',
    'mizar-relinfer': 'relinfer',
    'mizar-trivdemo': 'trivdemo',
    'mizar-reliters': 'reliters',
    'mizar-relprem': 'relprem',
    'mizar-irrvoc': 'irrvoc',
    'mizar-inacc': 'inacc',
    'mizar-chklab': 'chklab',
};

/**
 * 拡張機能が有効になった際に実行される始まりの関数
 * @param {vscode.ExtensionContext} context
 * 拡張機能専用のユーティリティーを集めたオブジェクト
 */
export function activate(context: vscode.ExtensionContext) {
    // verifierの実行結果を出力するチャンネル
    const channel = vscode.window.createOutputChannel('Mizar output');
    //let runningCmd: {process: cp.ChildProcess | null} = {process: null};
    const diagnosticCollection = 
        vscode.languages.createDiagnosticCollection('mizar');
    channel.show(true);
    const globalState = context.globalState;

    // Mizarコマンドの登録
    for (const cmd in MIZAR_COMMANDS) {
        context.subscriptions.push(
            vscode.commands.registerCommand(
                cmd,
                returnExecutingFunction(
                    channel, diagnosticCollection, globalState, MIZAR_COMMANDS[cmd],
                ),
            ),
        );
    }

    const hover = new HoverProvider();
    context.subscriptions.push(
        vscode.languages.registerHoverProvider(
            'Mizar', hover,
        )
    );

    const definition = new DefinitionProvider();
    context.subscriptions.push(
        vscode.languages.registerDefinitionProvider(
            'Mizar', definition,
        )
    );

    const stopCommand = vscode.commands.registerCommand(
        'stop-command',
        () => {
            if (interval_id) {
                clearInterval(interval_id);
                vscode.window.showInformationMessage('Command stopped!');
            }
        },
    );
    context.subscriptions.push(stopCommand);

    const formatter = vscode.commands.registerCommand(
        'format-mizar',
        formatMizar,
    );
    context.subscriptions.push(formatter);

    context.subscriptions.push(
        vscode.workspace.onDidChangeTextDocument((event) => {
            const changedFilePath = event.document.uri.path;
            let changedFilePaths = context.globalState.get<string[]>("changedFilePaths") || [];
            // 変更があったファイル名を保存（重複を避ける）
            if (!changedFilePaths.includes(changedFilePath)) {
                changedFilePaths.push(changedFilePath);
                context.globalState.update("changedFilePaths", changedFilePaths);
            }
        })      
    );

}

// this method is called when your extension is deactivated
export function deactivate() {}
