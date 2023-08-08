import * as vscode from 'vscode';
import * as path from 'path';
import { calculateProgressDiff, MAX_OUTPUT } from './calculateProgress';
import { setDiagnostics } from './displayErrors';
// eslint-disable-next-line prefer-const, @typescript-eslint/naming-convention
export let interval_id: NodeJS.Timer | null  = null;
export const ABSTR = 'abstr/';


/**
 * 項目を横並びにするために文字列の後にスペースを追加する関数
 * 指定文字数までスペースを追加する
 * @param {string} str スペースを追加する文字列
 * @param {number} num 何文字までスペースを追加するかを指定する数
 * @return {string} num文字までスペースを追加した文字列
 */
function padSpace(str:string, num = 9) {
    const padding = ' ';
    return str + padding.repeat(num - str.length);
}

/**
 * @fn
 * プログレスバーの足りない「#」を追加する関数
 * エラーがあれば，その数もプログレスバーの横にappendされる
 * @param {vscode.OutputChannel} channel 出力先のチャンネル
 * @param {number} numberOfProgress プログレス数（「#」の数）
 * @param {number} numberOfErrors エラー数，プログレス横に出力される
 */
function addMissingHashTags(
    channel:vscode.OutputChannel,
    numberOfProgress:number,
    numberOfErrors:number) {
    if (MAX_OUTPUT < numberOfProgress) {
        return;
    }
    const appendChunk = '#'.repeat(MAX_OUTPUT - numberOfProgress);
    channel.append(appendChunk);
    // エラーがあれば、その数を出力
    if (numberOfErrors) {
        channel.append(' *' + numberOfErrors);
    }
    channel.appendLine('');
}

/**
 * fileNameで与えられたファイルに対して，makeenvとcommandを実行する関数
 * @param {vscode.OutputChannel} channel 結果を出力するチャンネル
 * @param {string} fileName makeenv,commandが実行する対象のファイル名
 * @param {string} command 実行するコマンド、デフォルトでは"verifier"となっている
 * @param {vscode.Uri} uri
 * @param {vscode.DiagnosticCollection} diagnosticCollection
 * @return {Promise<string>}
 * コマンドの実行結果を,"success","makeenv error", "command error"で返す
 */
export async function mizarVerify(
    channel:vscode.OutputChannel, 
    command:string="verifier",
    uri:vscode.Uri,
    diagnosticCollection:vscode.DiagnosticCollection,
)
{
    // 出力している「#」の数を保存する変数
    let numberOfProgress = 0;
    // Parser,MSM,Analyzer等のコマンドから取得した項目をpushするリスト
    // 出力から得た項目(Parser,MSM等)が「コマンドを実行してから初めて得た項目なのか」を判定するために利用する
    const trackedPhases:string[] = [];

	let runningCommand = 'makeenv';
    
    const URL = "http://localhost:3000/api/v0.1/verifier";
    const fileName = path.basename(String(uri));
    const repositoryUrl = vscode.workspace.getConfiguration('Mizar').repositoryUrl;
    const body = {fileName, repositoryUrl, command};
    const options = {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Content-Type': 'application/json; charset=utf-8' },
    };
    
    fetch(URL, options)
        .then(res => res.json())
        .then(json => {
            interval_id = setInterval(() => {
                fetch(URL + "/" + json.ID)
                    .then(res => res.json())
                    .then(json => {
                        if (json.isMakeenvFinish && runningCommand === 'makeenv') {
                            if (json.isMakeenvSuccess) {
                                channel.appendLine(json.makeenvText);
                                channel.appendLine("Running " + command
                                            + " on " + uri.fsPath + '\n');
                                channel.appendLine("   Start |------------------------------------------------->| End");
                                runningCommand = 'verifier';
                            }
                            else {
                                setDiagnostics(json.errorList, uri, diagnosticCollection);
                                if (interval_id) {
                                    clearInterval(interval_id);
                                }
                                interval_id = null;
                                console.log('makeenv error');
                                return;
                            }
                        }
                        if (runningCommand === 'verifier') {
                            let errorMsg = "\n**** Some errors detected.";
                            const progressPhases = json.progressPhases;

                            if (trackedPhases[trackedPhases.length - 1] === progressPhases[progressPhases.length - 1]) {
                                const progressDiff = calculateProgressDiff(json.progressPercent, numberOfProgress);
                                const appendChunk = "#".repeat(progressDiff);
                                channel.append(appendChunk);
                                numberOfProgress += progressDiff;
                            } else {
                                if (trackedPhases.length !== 0) {
                                    // 直前の項目の#がMAX_OUTPUT未満であれば，足りない分の「#」を追加
                                    addMissingHashTags(channel, numberOfProgress, json.numOfErrors);
                                }
                                // 新しい項目なので，プログレスを初期化する
                                numberOfProgress = 0;
                                progressPhases.forEach((phase:string,i: number) => {
                                    if (phase === trackedPhases[i]){
                                        return;
                                    } else if (i === progressPhases.length -1){
                                        // 出力の項目を横並びにするために，スペースを補完する
                                        channel.append(padSpace(phase) +':');
                                        // OutputChannelに追加した項目として，phasesにpush
                                        trackedPhases.push(phase);
                                        const progressDiff = calculateProgressDiff(json.progressPercent, numberOfProgress);
                                        const appendChunk = "#".repeat(progressDiff);
                                        channel.append(appendChunk);
                                        numberOfProgress += progressDiff;
                                    } else {
                                        // 出力の項目を横並びにするために，スペースを補完する
                                        channel.append(padSpace(phase) +':');
                                        // OutputChannelに追加した項目として，phasesにpush
                                        trackedPhases.push(phase);
                                        const appendChunk = "#".repeat(MAX_OUTPUT);
                                        channel.appendLine(appendChunk);
                                    }
                                });
                            }

                            if(json.isVerifierFinish) {
                                addMissingHashTags(channel, numberOfProgress, json.numOfErrors);
                                if(json.isVerifierSuccess){
                                    // エラーがないことが確定するため，errorMsgを空にする
                                    errorMsg = "";
                                }
                                else {
                                    console.log('command error');
                                }
                                channel.appendLine("\nEnd.");
                                channel.appendLine(errorMsg);
                                setDiagnostics(json.errorList, uri, diagnosticCollection);
                                if (interval_id) {
                                    clearInterval(interval_id);
                                }
                                interval_id = null;
                            }
                        }
                    })
                    .catch(error => channel.appendLine(error));
            }, 1000); 
        })
        .catch(error => channel.appendLine(error));
    return;
}
