import * as vscode from 'vscode';
import * as path from 'path';
import { Octokit } from "@octokit/rest";
/**
 * 変更内容を自動でCommitする関数
 * @param {vscode.Uri} uri commitするmizarファイルのURI
 * @param {string} documentText ユーザが開いているドキュメントの内容
 */

interface Tree {
    path?: string | undefined;
    mode?: "100644" | "100755" | "040000" | "160000" | "120000" | undefined;
    type?: "commit" | "blob" | "tree" | undefined;
    sha?: string | null | undefined;
    content?: string | undefined;
}

function base64ToArrayBuffer(base64: string) {
    const binaryString = atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

export async function commitActiveFile(
    uri:vscode.Uri,
    documentText:string,
)
{
    const OAthToken = vscode.workspace.getConfiguration('Mizar').OAthToken;
    const octokit = new Octokit({ 
        auth: OAthToken,
        request: {
            cache: 'no-store',
        },
    });

    const repositoryUrl = vscode.workspace.getConfiguration('Mizar').repositoryUrl;
    const repositoryInfo = repositoryUrl.replace("https://github.com/", "").split('/', 2);
    const owner = repositoryInfo[0];
    const repo = repositoryInfo[1];    
    const baseBranch = "master";
    const branch = 'verifier';

    const activeFilePath = uri.path;
    const repositoryNameIndex = activeFilePath.indexOf(`${repo}/`);
    const repoFilePath = activeFilePath.substring(repositoryNameIndex).replace(`${repo}/`,''); 

    try {
        const commitMessage = "Commit with GitHub API";
    
        const existingBranches  = (await octokit.repos.listBranches({
            owner,
            repo,
        })).data;
        const branchExists = existingBranches.some((branches) => branches.name === branch);
        if (!branchExists) {
            const baseBranchRef = await octokit.git.getRef({
                owner, 
                repo, 
                ref: `heads/${baseBranch}`, 
            });
            await octokit.git.createRef({
                owner,
                repo,
                ref: `refs/heads/${branch}`,
                sha: baseBranchRef.data.object.sha, 
            });
        }

        const latestCommit = (await octokit.rest.repos.getBranch({ owner, repo, branch })).data.commit;
    
        const existingFile = await octokit.rest.repos.getContent({ owner, repo, path: repoFilePath, ref: branch });
        let content = "";
        if (Array.isArray(existingFile.data)) {
            const file = existingFile.data.find((f) => f.type === "file");
            if (file) {
                content = new TextDecoder("utf-8").decode(base64ToArrayBuffer(file.content || ""));
            }
        } else {
            if (existingFile.data.type === "file") {
                content = new TextDecoder("utf-8").decode(base64ToArrayBuffer(existingFile.data.content || ""));
            }
        }
        if(content === documentText){
            return;
        }
        const createdBlob = (await octokit.rest.git.createBlob({
            owner,
            repo,
            content: documentText,
        })).data;
        const createdTree = (await octokit.rest.git.createTree({
            owner,
            repo,
            tree: [{
                type: "blob",
                path: repoFilePath,
                mode: "100644",
                sha: createdBlob.sha
            }],
            base_tree: latestCommit.sha,
        })).data;
        const createdCommit = (await octokit.rest.git.createCommit({
            owner,
            repo,
            message: commitMessage,
            tree: createdTree.sha,
            parents: [latestCommit.sha],
        })).data;
        await octokit.rest.git.updateRef({
            owner,
            repo,
            ref: `heads/${branch}`,
            sha: createdCommit.sha,
        });
    } catch (error) {
        console.log(error);
        vscode.window.showErrorMessage(String(error));
    }
    return;
}


export async function commitChanges(
    globalState:vscode.Memento & {
        setKeysForSync(keys: readonly string[]): void 
    },
    documentUri:vscode.Uri
)
{
    const OAthToken = vscode.workspace.getConfiguration('Mizar').OAthToken;
    const octokit = new Octokit({ 
        auth: OAthToken,
        request: {
            cache: 'no-store',
        },
    });

    const repositoryUrl = vscode.workspace.getConfiguration('Mizar').repositoryUrl;
    const repositoryInfo = repositoryUrl.replace("https://github.com/", "").split('/', 2);
    const owner = repositoryInfo[0];
    const repo = repositoryInfo[1];    
    const baseBranch = "master";
    const branch = 'verifier';
    const changedFilePaths = globalState.get<string[]>("changedFilePaths") || [];

    try {
        if (changedFilePaths.length > 0) {
            let treeList:Tree[] = [];
            const commitMessage = "Commit with GitHub API";
        
            const existingBranches  = (await octokit.repos.listBranches({
                owner,
                repo,
            })).data;
            const branchExists = existingBranches.some((branches) => branches.name === branch);
            if (!branchExists) {
                const baseBranchRef = await octokit.git.getRef({
                    owner, 
                    repo, 
                    ref: `heads/${baseBranch}`, 
                });
                await octokit.git.createRef({
                    owner,
                    repo,
                    ref: `refs/heads/${branch}`,
                    sha: baseBranchRef.data.object.sha, 
                });
            }

            const latestCommit = (await octokit.rest.repos.getBranch({ owner, repo, branch })).data.commit;
        
            for (const changedFilePath of changedFilePaths) {
                if (changedFilePath.includes(repo)) {
                    const repositoryNameIndex = changedFilePath.indexOf(`${repo}/`);
                    const repoFilePath = changedFilePath.substring(repositoryNameIndex).replace(`${repo}/`, '');

                    const documentPath = documentUri.path;
                    const relativePath = path.relative(documentPath, changedFilePath);
                    const resourceUri = vscode.Uri.joinPath(documentUri, relativePath);

                    const document = await vscode.workspace.openTextDocument(resourceUri);
                    const documentText = document.getText();
                    try{
                        const existingFile = await octokit.rest.repos.getContent({ owner, repo, path: repoFilePath, ref: branch });
                        let content = "";
                        if (Array.isArray(existingFile.data)) {
                            const file = existingFile.data.find((f) => f.type === "file");
                            if (file) {
                                content = new TextDecoder("utf-8").decode(base64ToArrayBuffer(file.content || ""));
                            }
                        } else {
                            if (existingFile.data.type === "file") {
                                content = new TextDecoder("utf-8").decode(base64ToArrayBuffer(existingFile.data.content || ""));
                            }
                        }
                        if (content !== documentText) {
                            const createdBlob = (await octokit.rest.git.createBlob({ owner, repo, content: documentText })).data;
                            treeList.push({
                                type: "blob",
                                path: repoFilePath,
                                mode: "100644",
                                sha: createdBlob.sha
                            });
                        }
                    } catch (error: any) {
                        if (error.status === 404) {
                            const createdBlob = (await octokit.rest.git.createBlob({ owner, repo, content: documentText })).data;
                            treeList.push({
                                type: "blob",
                                path: repoFilePath,
                                mode: "100644",
                                sha: createdBlob.sha
                            });
                        } else{
                            console.log(error);
                            vscode.window.showErrorMessage(String(error));
                            return;
                        }
                        
                    }
                }
            };
        
            if (treeList.length > 0) {
                const createdTree = (await octokit.rest.git.createTree({
                    owner,
                    repo,
                    tree: treeList,
                    base_tree: latestCommit.sha,
                })).data;
                const createdCommit = (await octokit.rest.git.createCommit({
                    owner,
                    repo,
                    message: commitMessage,
                    tree: createdTree.sha,
                    parents: [latestCommit.sha],
                })).data;
                await octokit.rest.git.updateRef({
                    owner,
                    repo,
                    ref: `heads/${branch}`,
                    sha: createdCommit.sha,
                });
                globalState.update("changedFilePaths", []);
                vscode.window.showInformationMessage("Committed modified files.");
            } else {
                vscode.window.showInformationMessage("No changes to commit.");
            }
        }
    } catch (error) {
        console.log(error);
        vscode.window.showErrorMessage(String(error));
    }
    return;
}
