// Content of webviewScript.js
const vscode = acquireVsCodeApi();

vscode.postMessage({ command: 'webviewScriptReady' });

function logGenerativeLanguageFunction() {
    console.log('Generative Language Function Clicked');
    // Perform any actions related to the webview
    // ...
}
