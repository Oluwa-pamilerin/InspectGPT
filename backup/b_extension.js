const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const dotenv = require("dotenv");
const envFilePath = path.join(__dirname, ".env");
const result = dotenv.config({ path: envFilePath });
const limit = 10000; // Set your payload size limit here
let config = "";
let apiKey = process.env.API_KEY;
var messagesOutside = [];
let panel;
let highlightedCode;

var getResult = false;

function activate(context) {
  const DiscussServiceClient = require("@google-ai/generativelanguage");
  var GoogleAuth = require("google-auth-library");

  config = vscode.workspace.getConfiguration("InspectGPT");
  deactivate = config.get("deactivate-Popup-Window");

  // statusbar
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Right,
    100
  );
  statusBarItem.text = "$(eye) InspectGPT";
  statusBarItem.tooltip =
    "InspectGPT: Click to inspect the highlighted code segment";
  statusBarItem.show();

  // Log a message or display a notification when the status bar item is clicked
  statusBarItem.command = "extension.inspectGPTBar";
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.inspectGPTBar", () => {
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showInformationMessage("No active text editor");
        return;
      }

      const selection = editor.selection;

      if (selection.isEmpty) {
        vscode.window.showInformationMessage("No code segment is highlighted");
      } else {
        const highlightedCode = editor.document.getText(selection);
        sendHighlightedTextToBard(highlightedCode, null);
      }
    })
  );

  // Dispose the status bar item when the extension is deactivated
  context.subscriptions.push(statusBarItem);

  // menu

  let disposable = vscode.commands.registerCommand(
    "extension.inspectGPT",
    () => {
      // Get the active text editor
      const editor = vscode.window.activeTextEditor;

      if (!editor) {
        vscode.window.showInformationMessage("No code file is open.");
        return;
      }

      // Get the selected text (if any)
      const selection = editor.selection;
      const selectedText = editor.document.getText(selection);

      if (!selectedText) {
        vscode.window.showInformationMessage("No code segment is highlighted.");
      } else {
        sendHighlightedTextToBard(selectedText, null);
      }
    }
  );

  context.subscriptions.push(disposable);
  //

  config = vscode.workspace.getConfiguration("InspectGPT");
  context.subscriptions.push(
    vscode.commands.registerCommand("extension.inspectGPTAPIKey", () => {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "InspectGPT.apiKey"
      );
    })
  );
  if (!apiKey) {
    vscode.window
      .showErrorMessage(`Open AI API Key is not set`, "Set API Key")
      .then(async (selection) => {
        if (selection === "Set API Key") {
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "InspectGPT.apikey"
          );
        }
      });
    return;
  }

  config = vscode.workspace.getConfiguration("InspectGPT");
  apiKey = apiKey;

  if (!apiKey) {
    vscode.window.showErrorMessage(
      'InspectGPT API key is not set. Click "InspectGPT API KEY" to configure it.'
    );
  } else {
    // Continue with extension logic using apiKey
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("extension.inspectGPTCommand", () => {
      // Replace this with your actual extension logic using apiKey
      vscode.window.showInformationMessage(
        "InspectGPT Extension Command Executed!"
      );
    })
  );

  // Register an event listener to log folder contents when a workspace folder is ready
  vscode.workspace.onDidChangeWorkspaceFolders(() => {});

  // Extension Activation
  console.log('Congratulations, your extension "inspectgpt" is now active!');
  vscode.window.showInformationMessage(
    "InspectGPT is all set! Happy Coding 👨‍💻"
  );
  if (deactivate != "") {
    vscode.window
      .showInformationMessage(`InspectGPT Pop-up is Deactivated`, "Activate")
      .then(async (selection) => {
        if (selection === "Activate") {
          await vscode.commands.executeCommand(
            "workbench.action.openSettings",
            "InspectGPT.deactivate-Popup-Window"
          );
        }
      });
  }

  let currentSelection = null;
  let selectionTimeout = null;

  // Event listener for text selection changes in the editor
  vscode.window.onDidChangeTextEditorSelection(() => {
    const editor = vscode.window.activeTextEditor;
    if (deactivate === "") {
      if (editor) {
        const selection = editor.selection;

        if (!selection.isEmpty) {
          const selectedText = editor.document.getText(selection);

          if (selectedText !== currentSelection) {
            if (selectionTimeout) {
              clearTimeout(selectionTimeout);
            }

            selectionTimeout = setTimeout(async () => {
              currentSelection = selectedText;

              try {
                const userChoice = await vscode.window.showInformationMessage(
                  "InspectGPT",
                  {
                    modal: false, // Make the message non-modal
                  },
                  "InspectGPT",
                  {
                    title: "Don't like the pop-up?",
                    isCloseAffordance: true,
                  }
                );
                if (userChoice === "InspectGPT") {
                  // Pass the global panel variable
                  panel = sendHighlightedTextToBard(currentSelection, panel);
                } else if (
                  typeof userChoice === "object" &&
                  userChoice.title === "Don't like the pop-up?"
                ) {
                  await vscode.commands.executeCommand(
                    "workbench.action.openSettings",
                    "InspectGPT.deactivate-Popup-Window"
                  );
                }
              } catch (error) {
                console.error("Error during inspection:", error);
              }
            }, 500);
          }
        } else {
          currentSelection = null;
        }
      }
    }
  });

  // Register commands
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "inspectgpt.searchStackOverflow",
      async () => {
        // You can add custom logic for this command here if needed.
      }
    )
  );

  disposable = context.subscriptions.push(
    vscode.commands.registerCommand("inspectgpt.openWebview", () => {
      const editor = vscode.window.activeTextEditor;
      if (editor) {
        const selection = editor.selection;
        if (!selection.isEmpty) {
          if (editor.document.getText(selection).length <= limit) {
            const selectedText = editor.document.getText(selection);
            panel = sendHighlightedTextToBard(selectedText, panel); // Pass the panel variable
            // If the content is within the limit, return it as is
          } else {
            // If content exceeds the limit, return the content until the limit with "..."
            const selectedText =
              editor.document.getText(selection).slice(0, limit) +
              "... '\n The code continues...'";
            panel = sendHighlightedTextToBard(selectedText, panel); // Pass the panel variable
          }
        }
      }
    })
  );

  context.subscriptions.push(disposable);

  // Register a message handler
  vscode.workspace.onDidChangeTextDocument((e) => {
    if (panel) {
      panel.webview.postMessage({
        command: "updateText",
        text: e.document.getText(),
      });
    }
  });
}

exports.activate = activate;

function getActiveFileLanguage() {
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    const document = editor.document;
    const languageId = document.languageId;
    return languageId;
  } else {
    vscode.window.showInformationMessage("No active text editor found.");
    return null; // Return null or an appropriate value if there's no active text editor.
  }
}

function getActiveFileContent() {
  const editor = vscode.window.activeTextEditor;

  if (editor) {
    const document = editor.document;
    const text = document.getText();
    const limit = 10000; // Set your payload size limit here

    if (text.length <= limit) {
      return text; // If the content is within the limit, return it as is
    } else {
      // If content exceeds the limit, return the content until the limit with "..."
      const truncatedContent =
        text.slice(0, limit) + '... "The code continues..."';
      return truncatedContent;
    }
  } else {
    vscode.window.showInformationMessage("No active text editor found.");
    return null; // Return null or an appropriate value if there's no active text editor.
  }
}

function sendHighlightedTextToBard(highlightedText, existingPanel) {
  messagesOutside = [];
  if (existingPanel) {
    existingPanel.dispose(); // Dispose the existing panel
  }
  getResult = false;
  if (!apiKey) {
    if (!apiKey) {
      vscode.window
        .showErrorMessage(`Open AI API Key is not set`, "Set API Key")
        .then(async (selection) => {
          if (selection === "Set API Key") {
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "InspectGPT.apikey"
            );
          }
        });
      return;
    }
    return existingPanel;
  }

  var { DiscussServiceClient } = require("@google-ai/generativelanguage");
  var { GoogleAuth } = require("google-auth-library");

  if (existingPanel) {
    existingPanel.dispose(); // Dispose the existing panel
  }

  // Create a new panel
  var panel = vscode.window.createWebviewPanel(
    "highlightedTextPanel",
    highlightedText, // Truncate to 50 characters,
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
    }
  );

  console.log("D");
  console.log(DiscussServiceClient);
  console.log("G");
  console.log(GoogleAuth);

  panel.webview.postMessage({
    command: "initialize",
    data: {
      DiscussServiceClient: DiscussServiceClient,
      GoogleAuth: GoogleAuth,
    },
  });

  // Show "Waiting for Bard" while waiting for the response
  getResult = false;
  const html = `
  <style>
  .chat:hover .chat-content:not(:has(.typing-animation), :has(.error)) span {
    visibility: visible;
}
.chat .typing-animation {
  padding-left: 25px;
  display: inline-flex;
}

.typing-animation .typing-dot {
  height: 7px;
  width: 7px;
  border-radius: 50%;
  margin: 0 3px;
  opacity: 0.7;
  background: var(--text-color);
  animation: animateDots 1.5s var(--delay) ease-in-out infinite;
}

.typing-animation .typing-dot:first-child {
  margin-left: 0;
}
.typing-container {
  position: fixed;
  bottom: 0;
  width: 100%;
  display: flex;
  padding: 20px 10px;
  justify-content: center;
  background: var(--outgoing-chat-bg);
  border-top: 1px solid var(--incoming-chat-border);
}

.typing-container .typing-content {
  display: flex;
  max-width: 950px;
  width: 100%;
  align-items: flex-end;
}

.typing-container .typing-textarea {
  width: 100%;
  display: flex;
  position: relative;
}

.typing-textarea textarea {
  resize: none;
  height: 55px;
  width: 100%;
  border: none;
  padding: 15px 45px 15px 20px;
  color: var(--text-color);
  font-size: 1rem;
  border-radius: 4px;
  max-height: 250px;
  overflow-y: auto;
  background: var(--incoming-chat-bg);
  outline: 1px solid var(--incoming-chat-border);
}

.typing-textarea textarea::placeholder {
  color: var(--placeholder-color);
}

.typing-content span {
  width: 55px;
  height: 55px;
  display: flex;
  border-radius: 4px;
  font-size: 1.35rem;
  align-items: center;
  justify-content: center;
  color: var(--icon-color);
}

.typing-textarea span {
  position: absolute;
  right: 0;
  bottom: 0;
  visibility: hidden;
}

.typing-textarea textarea:valid~span {
  visibility: visible;
}

.typing-controls {
  display: flex;
}

.typing-controls span {
  margin-left: 7px;
  font-size: 1.4rem;
  background: var(--incoming-chat-bg);
  outline: 1px solid var(--incoming-chat-border);
}

.typing-controls span:hover {
  background: var(--icon-hover-bg);
}

/* Reponsive Media Query */
@media screen and (max-width: 600px) {
  .default-text h1 {
      font-size: 2.3rem;
  }

  :where(.default-text p, textarea, .chat p) {
      font-size: 0.95rem !important;
  }

  .chat-container .chat {
      padding: 20px 10px;
  }

  .chat-container .chat img {
      height: 32px;
      width: 32px;
  }

  .chat-container .chat p {
      padding: 0 20px;
  }

  .chat .chat-content:not(:has(.typing-animation), :has(.error)) span {
      visibility: visible;
  }

  .typing-container {
      padding: 15px 10px;
  }

  .typing-textarea textarea {
      height: 45px;
      padding: 10px 40px 10px 10px;
  }

  .typing-content span {
      height: 45px;
      width: 45px;
      margin-left: 5px;
  }

  </style>
      <div class="typing-animation">
          <div class="typing-dot" style="--delay: 0.2s"></div>
          <div class="typing-dot" style="--delay: 0.3s"></div>
          <div class="typing-dot" style="--delay: 0.4s"></div>
</div>`;
  panel.webview.html = getWebviewContent(highlightedText, html);

  panel.onDidDispose(() => {
    panel = undefined;
  });

  // Handle messages from the webview

  panel.webview.onDidReceiveMessage((message) => {
    handleMessage(message);
  }, undefined);

  // Handle messages from the webview
  // panel.webview.onDidReceiveMessage(message => {
  //     console.log(message.text);
  //     // vscode.window.showInformationMessage(`Received: ${message.text}`);
  // });

  // Send the highlighted text to Bard via an HTTP request
  const language = getActiveFileLanguage();
  const fileContent = getActiveFileContent();
  const MODEL_NAME = "models/chat-bison-001";
  var { DiscussServiceClient } = require("@google-ai/generativelanguage");
  var { GoogleAuth } = require("google-auth-library");
  const API_KEY = apiKey;
  const messages = [];

  const content =
    "Deligently check out this extract below and explain what this code is all about in specific context to the other codes in the project. Make sure you refer to other parts of the code file. If there are any error, point them out." +
    "\n" +
    highlightedText +
    "\n" +
    "If necessary, send the corrected version of the code. If your response includes code, enclose it in a '<pre>' tag.";
  // const content = "Rewrite the corrected version of this code: " + "\n" + highlightedText + "\n";

  messages.push({
    content: content,
  });
  var { GoogleAuth, JWT, OAuth2Client } = require("google-auth-library");

  const client = new DiscussServiceClient({
    authClient: new GoogleAuth().fromAPIKey(API_KEY),
  });

  const context =
    "Reply like a seasoned senior developer and code coach giving detailed explanation to the extracted code line. The file currently being worked on is written in \n '" +
    language +
    "' programming language. This is the full content of the file: \n '" +
    fileContent +
    "'. \n Make sure to refer to it in your explanation";
  const examples = [
    {
      input: {
        content:
          "Simply Check this text and say something:axios.post(apiUrl, requestData, { headers }).then(response => {// console.log('Response Status Code:', response.status);console.log('Response Data:', response.data.candidates[0].output.toString());}).catch(error => { console.error('Error:', error);});If it is meaningless, let me know",
      },
      output: {
        content:
          "The provided text appears to be JavaScript code snippet that utilizes the Axios library to perform an HTTP POST request. It sends the request to an API endpoint specified by apiUrl with the request data stored in requestData and custom headers defined in the headers object.Upon successful completion of the request, the then() block is executed, which logs the response status code and the first candidate's output string to the console. If an error occurs during the request, the catch() block is triggered, logging the error details to the console.The code snippet seems meaningful in the context of making HTTP POST requests and handling responses using the Axios library. It demonstrates the basic structure of sending data to an API endpoint and processing the received response",
      },
    },
  ];

  client
    .generateMessage({
      model: MODEL_NAME,
      temperature: 1,
      candidateCount: 8,
      top_k: 40,
      top_p: 0.95,
      prompt: {
        context: context,
        examples: examples,
        messages: messages,
      },
    })
    .then((result) => {
      if (
        result &&
        result[0] &&
        result[0].candidates &&
        result[0].candidates.length > 0
      ) {
        result[0].candidates.forEach((obj) => {
          panel.webview.html = getWebviewContent(highlightedText, obj.content);
          messages.push({ content: obj.content });
          getResult = true;
        });
      } else {
        console.log(
          "Didn't catch that. Please Re-Inspect a more concise code segment."
        );
        getResult = true;
        panel.webview.html = getWebviewContent(
          highlightedText,
          "Didn't catch that. Please Re-Inspect a more concise code segment."
        );
      }
    })
    .catch((error) => {
      if (error.code === "ECONNABORTED") {
        getResult = true;
        panel.webview.html = getWebviewContent(
          highlightedText,
          "No Internet Connection"
        );
      } else {
        console.error("Error sending text to Bard:", error);
        getResult = true;
        panel.webview.html = getWebviewContent(
          highlightedText,
          "Error sending text to Bard"
        );
      }
    });

  return panel; // Return the new panel
}

function sendHighlightedTextToBardFromRetry(highlightedText, existingPanel) {
  messagesOutside = [];
  getResult = false;
  if (!apiKey) {
    if (!apiKey) {
      vscode.window
        .showErrorMessage(`Open AI API Key is not set`, "Set API Key")
        .then(async (selection) => {
          if (selection === "Set API Key") {
            await vscode.commands.executeCommand(
              "workbench.action.openSettings",
              "InspectGPT.apikey"
            );
          }
        });
      return;
    }
    return existingPanel;
  }

  if (existingPanel) {
    existingPanel.dispose(); // Dispose the existing panel
  }

  // Create a new panel
  var panel = vscode.window.createWebviewPanel(
    "highlightedTextPanel",
    highlightedText, // Truncate to 50 characters,
    vscode.ViewColumn.Two,
    {
      enableScripts: true,
    }
  );

  // Show "Waiting for Bard" while waiting for the response
  getResult = false;
  panel.webview.html = getWebviewContent(highlightedText, "Thinking ...");

  panel.onDidDispose(() => {
    panel = undefined;
  });

  // Handle messages from the webview
  panel.webview.onDidReceiveMessage((message) => {
    handleMessage(message);
  }, undefined);

  // Handle messages from the webview
  // panel.webview.onDidReceiveMessage(message => {
  //     console.log(message.text);
  //     // vscode.window.showInformationMessage(`Received: ${message.text}`);
  // });

  // Send the highlighted text to Bard via an HTTP request
  const language = getActiveFileLanguage();
  const fileContent = getActiveFileContent();
  const MODEL_NAME = "models/chat-bison-001";
  const API_KEY = apiKey;
  const messages = [];

  const content =
    "Deligently check out this extract below and explain what this code is all about in specific context to the other codes in the project. If there are any error, point them out." +
    "\n" +
    highlightedText +
    "\n" +
    "If necessary, send the corrected version of the code. If your response includes code, enclose it in a '<pre>' tag.";
  // const content = "Rewrite the corrected version of this code: " + "\n" + highlightedText + "\n";

  messages.push({
    content: content,
  });
  const client = new DiscussServiceClient({
    authClient: new GoogleAuth().fromAPIKey(API_KEY),
  });

  const context =
    "Reply like a seasoned senior developer and code coach giving detailed explanation to the extracted code line. The file currently being worked on is written in \n '" +
    language +
    "' programming language. This is the full content of the file: \n '" +
    fileContent +
    "'. \n Make sure to refer to it in your explanation";
  const examples = [
    {
      input: {
        content:
          "Simply Check this text and say something:axios.post(apiUrl, requestData, { headers }).then(response => {// console.log('Response Status Code:', response.status);console.log('Response Data:', response.data.candidates[0].output.toString());}).catch(error => { console.error('Error:', error);});If it is meaningless, let me know",
      },
      output: {
        content:
          "The provided text appears to be JavaScript code snippet that utilizes the Axios library to perform an HTTP POST request. It sends the request to an API endpoint specified by apiUrl with the request data stored in requestData and custom headers defined in the headers object.Upon successful completion of the request, the then() block is executed, which logs the response status code and the first candidate's output string to the console. If an error occurs during the request, the catch() block is triggered, logging the error details to the console.The code snippet seems meaningful in the context of making HTTP POST requests and handling responses using the Axios library. It demonstrates the basic structure of sending data to an API endpoint and processing the received response",
      },
    },
  ];

  client
    .generateMessage({
      model: MODEL_NAME,
      temperature: 1,
      candidateCount: 8,
      top_k: 40,
      top_p: 0.95,
      prompt: {
        context: context,
        examples: examples,
        messages: messages,
      },
    })
    .then((result) => {
      if (
        result &&
        result[0] &&
        result[0].candidates &&
        result[0].candidates.length > 0
      ) {
        result[0].candidates.forEach((obj) => {
          panel.webview.html = getWebviewContent(highlightedText, obj.content);
          messages.push({ content: obj.content });
          getResult = true;
        });
      } else {
        console.log(
          "Didn't catch that. Please Re-Inspect a more concise code segment."
        );
        getResult = true;
        panel.webview.html = getWebviewContent(
          highlightedText,
          "Didn't catch that. Please Re-Inspect a more concise code segment."
        );
      }
    })
    .catch((error) => {
      if (error.code === "ECONNABORTED") {
        getResult = true;
        panel.webview.html = getWebviewContent(
          highlightedText,
          "No Internet Connection"
        );
      } else {
        console.error("Error sending text to Bard:", error);
        getResult = true;
        panel.webview.html = getWebviewContent(
          highlightedText,
          "Error sending text to Bard"
        );
      }
    });

  return panel; // Return the new panel
}

function binaryToString(binaryString) {
  const binaryArray = binaryString.split(" ");
  return binaryArray
    .map((binary) => String.fromCharCode(parseInt(binary, 2)))
    .join("");
}

// ... (Rest of the code)

function stringToBinary(inputString) {
  return Array.from(inputString, (char) => char.charCodeAt(0).toString(2)).join(
    " "
  );
}

var messagess = [];
function handleFollowUpFunc(logable) {
  console.log("Goin well");
  return messagess;
}

var string = "hello";

const sayHello = ()=> {
  return string;
}
console.log("Outside");
var foo = sayHello()

function getWebviewContent(selectedText, bardResponse) {
  // Read the content of the webview.html file
  const webviewPath = path.join(__dirname, "webview.html");
  const webviewContent = fs.readFileSync(webviewPath, "utf-8");

  messagesOutside = [];
  messagesOutside.push({
    content: selectedText,
  });
  messagesOutside.push({
    content: bardResponse,
  });
  var rawSelectedText = stringToBinary(selectedText);
  const formattedResponse = bardResponse
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((paragraph) => `<p>${paragraph}</p>`)
    .join("")
    .toString();
  const codeRegex = /```([\s\S]*?)```/g;
  function replaceParagraphTagsWithNewlines(match) {
    const replacedMatch = match.replace(/<\/p><p>/g, "\n").replace(/```/g, "");
    return (
      "<pre style='padding: 0px; padding-right: 10px; padding-left: 10px; border-radius:5px; background-color: black; white-space: no-wrap; overflow-x: auto;'><pre><code style = 'color: white;'><xmp>" +
      replacedMatch +
      "</xmp></code></pre></pre>"
    );
  }
  const searchedResponse = formattedResponse.replace(
    codeRegex,
    replaceParagraphTagsWithNewlines
  );

  selectedText = JSON.stringify(selectedText).replace(/'/g, '"');

  // Replace placeholders in the HTML template with actual content
  const finalContent = webviewContent
    .replace("{{selectedText}}", selectedText)
    .replace("{{searchedResponse}}", searchedResponse)
    .replace("{{apiKey}}", apiKey)
    .replace(
      "{{DiscussServiceClient}}",
      require("@google-ai/generativelanguage")
    )
    .replace("{{GoogleAuth}}", require("google-auth-library"));



    const finalContentHtml = 
    `
    <!DOCTYPE html>
    <html>
    
    <head>
        <link rel="stylesheet"
            href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
    
        <style>
            /* Import Google font - Poppins */
            @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600&display=swap');
    
            * {
                margin: 0;
                padding: 0;
                box-sizing: border-box;
                font-family: "Poppins", sans-serif;
            }
    
            :root {
                --text-color: #FFFFFF;
                --icon-color: #ACACBE;
                --icon-hover-bg: #5b5e71;
                --placeholder-color: #dcdcdc;
                --outgoing-chat-bg: #444654;
                --incoming-chat-bg: #343541;
                --outgoing-chat-border: #444654;
                --incoming-chat-border: #343541;
            }
    
            .light-mode {
                --text-color: #343541;
                --icon-color: #a9a9bc;
                --icon-hover-bg: #f1f1f3;
                --placeholder-color: #6c6c6c;
                --outgoing-chat-bg: #FFFFFF;
                --incoming-chat-bg: #F7F7F8;
                --outgoing-chat-border: #FFFFFF;
                --incoming-chat-border: #D9D9E3;
            }
    
            body {
                background: var(--outgoing-chat-bg);
            }
    
            /* Chats container styling */
            .chat-container {
                overflow-y: auto;
                max-height: 100vh;
                padding-bottom: 150px;
            }
    
            :where(.chat-container, textarea)::-webkit-scrollbar {
                width: 6px;
            }
    
            :where(.chat-container, textarea)::-webkit-scrollbar-track {
                background: var(--incoming-chat-bg);
                border-radius: 25px;
            }
    
            :where(.chat-container, textarea)::-webkit-scrollbar-thumb {
                background: var(--icon-color);
                border-radius: 25px;
            }
    
            .default-text {
                display: flex;
                align-items: center;
                justify-content: center;
                flex-direction: column;
                height: 70vh;
                padding: 0 10px;
                text-align: center;
                color: var(--text-color);
            }
    
            .default-text h1 {
                font-size: 3.3rem;
            }
    
            .default-text p {
                margin-top: 10px;
                font-size: 1.1rem;
            }
    
            .chat-container .chat {
                padding: 25px 10px;
                display: flex;
                justify-content: center;
                color: var(--text-color);
            }
    
            .chat-container .chat.outgoing {
                background: var(--outgoing-chat-bg);
                border: 1px solid var(--outgoing-chat-border);
            }
    
            .chat-container .chat.incoming {
                background: var(--incoming-chat-bg);
                border: 1px solid var(--incoming-chat-border);
            }
    
            .chat .chat-content {
                display: flex;
                max-width: 1200px;
                width: 100%;
                align-items: flex-start;
                justify-content: space-between;
            }
    
            span.material-symbols-rounded {
                user-select: none;
                cursor: pointer;
            }
    
            .chat .chat-content span {
                cursor: pointer;
                font-size: 1.3rem;
                color: var(--icon-color);
                visibility: hidden;
            }
    
            .chat:hover .chat-content:not(:has(.typing-animation), :has(.error)) span {
                visibility: visible;
            }
    
            .chat .chat-details {
                display: flex;
                align-items: center;
            }
    
            .chat .chat-details img {
                width: 35px;
                height: 35px;
                align-self: flex-start;
                object-fit: cover;
                border-radius: 2px;
                flex:1;
            }
    
            .chat .chat-details p {
                white-space: pre-wrap;
                font-size: 1.05rem;
                padding: 0 50px 0 25px;
                color: var(--text-color);
                word-break: break-word;
            }
    
            .chat .chat-details p.error {
                color: #e55865;
            }
    
            .chat .typing-animation {
                padding-left: 25px;
                display: inline-flex;
            }
    
            .typing-animation .typing-dot {
                height: 7px;
                width: 7px;
                border-radius: 50%;
                margin: 0 3px;
                opacity: 0.7;
                background: var(--text-color);
                animation: animateDots 1.5s var(--delay) ease-in-out infinite;
            }
    
            .typing-animation .typing-dot:first-child {
                margin-left: 0;
            }
    
            @keyframes animateDots {
    
                0%,
                44% {
                    transform: translateY(0px);
                }
    
                28% {
                    opacity: 0.4;
                    transform: translateY(-6px);
                }
    
                44% {
                    opacity: 0.2;
                }
            }
    
            /* Typing container styling */
            .typing-container {
                position: fixed;
                bottom: 0;
                width: 100%;
                display: flex;
                padding: 20px 10px;
                justify-content: center;
                background: var(--outgoing-chat-bg);
                border-top: 1px solid var(--incoming-chat-border);
            }
    
            .typing-container .typing-content {
                display: flex;
                max-width: 950px;
                width: 100%;
                align-items: flex-end;
            }
    
            .typing-container .typing-textarea {
                width: 100%;
                display: flex;
                position: relative;
            }
    
            .typing-textarea textarea {
                resize: none;
                height: 55px;
                width: 100%;
                border: none;
                padding: 15px 45px 15px 20px;
                color: var(--text-color);
                font-size: 1rem;
                border-radius: 4px;
                max-height: 250px;
                overflow-y: auto;
                background: var(--incoming-chat-bg);
                outline: 1px solid var(--incoming-chat-border);
            }
    
            .typing-textarea textarea::placeholder {
                color: var(--placeholder-color);
            }
    
            .typing-content span {
                width: 55px;
                height: 55px;
                display: flex;
                border-radius: 4px;
                font-size: 1.35rem;
                align-items: center;
                justify-content: center;
                color: var(--icon-color);
            }
    
            .typing-textarea span {
                position: absolute;
                right: 0;
                bottom: 0;
                visibility: hidden;
            }
    
            .typing-textarea textarea:valid~span {
                visibility: visible;
            }
    
            .typing-controls {
                display: flex;
            }
    
            .typing-controls span {
                margin-left: 7px;
                font-size: 1.4rem;
                background: var(--incoming-chat-bg);
                outline: 1px solid var(--incoming-chat-border);
            }
    
            .typing-controls span:hover {
                background: var(--icon-hover-bg);
            }
    
            /* Reponsive Media Query */
            @media screen and (max-width: 600px) {
                .default-text h1 {
                    font-size: 2.3rem;
                }
    
                :where(.default-text p, textarea, .chat p) {
                    font-size: 0.95rem !important;
                }
    
                .chat-container .chat {
                    padding: 20px 10px;
                }
    
                .chat-container .chat img {
                    height: 32px;
                    width: 32px;
                }
    
                .chat-container .chat p {
                    padding: 0 20px;
                }
    
                .chat .chat-content:not(:has(.typing-animation), :has(.error)) span {
                    visibility: visible;
                }
    
                .typing-container {
                    padding: 15px 10px;
                }
    
                .typing-textarea textarea {
                    height: 45px;
                    padding: 10px 40px 10px 10px;
                }
    
                .typing-content span {
                    height: 45px;
                    width: 45px;
                    margin-left: 5px;
                }
    
                span.material-symbols-rounded {
                    font-size: 1.25rem !important;
                }
            }
    
            body {
                font-family: Arial, sans-serif;
                background-color: #343541;
                margin: 0;
                padding: 0;
            }
    
            header {
                background-color: #444654;
                color: white;
                text-align: center;
                padding: 30px;
            }
    
            #selectedText {
                visibility: hidden;
            }
    
            .chat-container {
                width: 100%;
                margin: 20px auto;
                border-radius: 5px;
                height: 100%;
                padding-bottom: 100px;
            }
    
            .chat {
                padding: 20px;
            }
    
            .user-message,
            .bot-message {
                padding: 10px;
                margin: 5px 0;
                border-radius: 5px;
            }
    
            .user-message {
                background-color: #343541;
            }
    
            .bot-message {
                color: white;
                margin-bottom: 0;
            }
    
            .message-input {
                width: 80%;
                padding: 10px;
                border: none;
                border-top: 1px solid #0078d4;
                margin: 10px 10px;
                border-radius: 5px;
                max-height: 50px;
                resize: none;
                overflow: hidden;
            }
    
            .send-button {
                background-color: #6b6c7b;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
            }
    
            .input {
                text-align: center;
                position: fixed;
                bottom: 0;
                left: 0;
                width: 100%;
                padding: 10px;
                border-radius: 5px;
                background-color: #444654;
            }
    
            .chat-container {
                width: 100%;
                margin: 20px auto;
                border-radius: 5px;
                height: 100%;
                padding-bottom: 100px;
            }
    
            .chat {
                padding: 20px;
            }
    
            .message-input {
                width: 80%;
                padding: 10px;
                border: none;
                border-top: 1px solid #0078d4;
                margin: 10px 10px;
                border-radius: 5px;
                max-height: 50px;
                resize: none;
                overflow: hidden;
            }
    
            .send-button {
                background-color: #6b6c7b;
                color: white;
                border: none;
                padding: 10px 20px;
                border-radius: 5px;
                cursor: pointer;
            }
    
            .invisible {
                visibility: hidden;
            }
    
            .retry-button {
                background-color: white;
                color: #343541;
                border: none;
                padding: 5px 10px;
                border-radius: 5px;
                cursor: pointer;
            }
    
            #bot-message {
                text-align: left;
            }
    
            .top-img {
                border-radius: 100%;
                width: 100px;
                height: 100px;
            }

            .other-content{
              flex:4;
              white-space: pre-line;
            }

            .bot-response{
              padding: 0;
            }
        </style>
    
    
    </head>
    
    <body>
        <header>
            <img src="https://pbs.twimg.com/media/GA6D0t9WAAAcWXL?format=png&name=small" alt="chatbot-img" class="top-img">
            <h1>InspectGPT</h1>
        </header>
        <div class="chat-container">
            <div class="chat">
                <div id="bot-message" class="bot-message">${searchedResponse}</div>
            </div>
            <div class="chat-container">
                <!-- Chat messages will go here -->
            </div>
            <div class="typing-container">
                <div class="typing-content">
                    <div class="typing-textarea">
                        <textarea id="chat-input" spellcheck="false"
                            style="background-color: #444654; border-color: #444654;" placeholder="Ask Follow-up Questions"
                            required></textarea>
                        <span id="send-btn" class="material-symbols-rounded">send</span>
                    </div>
                    <div class="typing-controls">
                        <!-- <span id="theme-btn" class="material-symbols-rounded">light_mode</span>
                        <span id="delete-btn" class="material-symbols-rounded">delete</span> -->
                    </div>
                </div>
    
            </div>
            <script type="module">
    
                document.addEventListener('DOMContentLoaded', () => {
                    const textareaEle = document.getElementById('chat-input');
                    textareaEle.addEventListener('input', () => {
                        textareaEle.style.height = 'auto';
                        textareaEle.style.height = document.getElementById('chat-input').scrollHeight + "px";
                    })
                });
    
                const chatInput = document.querySelector("#chat-input");
                const sendButton = document.querySelector("#send-btn");
                const initialInputHeight = chatInput.scrollHeight;
                const chatContainer = document.querySelector(".chat-container");
                const apiKey = ('{{apiKey}}');
    
                const vscode = acquireVsCodeApi();
                let DiscussServiceClient;
                let GoogleAuth;
    
                window.addEventListener('message', event => {
                    const message = event.data;
    
                    if (message.command === 'initialize') {
                        console.log("Message");
                        console.log(message.data);
                        DiscussServiceClient = message.data.DiscussServiceClient;
                        GoogleAuth = message.data.GoogleAuth;
    
                        // Now you have access to DiscussServiceClient and GoogleAuth
                        // Use them as needed
                    } else if (message.command === 'updateText') {
                        // Handle the updateText command
                        const newText = message.text;
                        // Update the webview with the new text
                        // (Add your logic to handle the updated text)
                    }
                });
                console.log("Discuss");
                console.log(DiscussServiceClient);
                console.log("GoogleAuth");
                console.log(GoogleAuth);
    
    
                const getChatResponse = async (incomingChatDiv, botReply) => {
                    const API_URL = "https://api.openai.com/v1/completions";
                    const pElement = document.createElement("p");
                    const chatInput = document.querySelector("#chat-input");
                    const humanInput = chatInput.value;
                    const userText = chatInput.value.trim(); // Get chatInput value and remove extra spaces
    
    
    
    
                    // logic for open ai
                    // Define the properties and data for the API request
    
    
    
    
    
    
    
    
    
    
    
    
                    // Send POST request to API, get response and set the reponse as paragraph element text
                    try {
                        chatInput.value = '';
                        const elements = document.querySelectorAll('#typing-ani');
                        const botIcon = "https://pbs.twimg.com/media/GA6D0t9WAAAcWXL?format=png&name=small";

                        // Check if there are any elements with the specified class
                        if (elements.length > 0) {
                            // Get the last element with class 'myTarget'
                            const lastElement = elements[elements.length - 1];
    
                            // Now you can manipulate the last element as needed
                            // lastElement.classList.remove('chat-content');
                            lastElement.classList.add('bot-response');
                            lastElement.innerHTML = "<div class='chat-details'><div style=' flex:1; max-width: 5%;'><img src='" + botIcon + "' alt='chatbot-img' style='border-radius:100%; width: 30px; height: 30px; display: flex;z align-items: flex-start;'></div><div class='other-content'>"+ botReply +"</div></div>";

                            // Add more operations or modifications as required
                        } else {
                            console.log('No element with class "myTarget" found.');
                        }
                    } catch (error) { // Add error class to the paragraph element and set error text
                        pElement.classList.add("error");
                        pElement.textContent = "Oops! Something went wrong while retrieving the response. Please try again. Here is what yoy typed: " + inputText;
                    }
    
    
    
                    // Remove the typing animation, append the paragraph element and save the chats to local storage
                    // incomingChatDiv.querySelector(".typing-animation").remove();
                    // incomingChatDiv.querySelector(".chat-details").appendChild(pElement);
                    localStorage.setItem("all-chats", chatContainer.innerHTML);
                    chatContainer.scrollTo(0, chatContainer.scrollHeight);
                }
    
    
                const handleOutgoingChat = (botReply) => {
    
                    setTimeout(function () {
                        // Display the typing animation and call the getChatResponse function
                        const html = "<div class='chat-content'><div class='chat-details'><img src='https://pbs.twimg.com/media/GA6D0t9WAAAcWXL?format=png&name=small' alt='chatbot-img' style='border-radius:100%; width: 30px; height: 30px;'><div class='typing-animation other-content'><div class='typing-dot' style='--delay: 0.2s'></div><div class='typing-dot' style='--delay: 0.3s'></div><div class='typing-dot' style='--delay: 0.4s'></div></div></div><span onclick='copyResponse(this)' class='material-symbols-rounded'>content_copy</span></div>"
                        // Create an incoming chat div with typing animation and append it to chat container
                        const incomingChatDiv = createChatElement('', "incoming");
                        chatContainer.appendChild(incomingChatDiv);
                        chatContainer.scrollTo(0, chatContainer.scrollHeight);
                        getChatResponse(incomingChatDiv, botReply);
                    }
                        , 500);
                }
    
                function handleInput(text, callback, content = "") {
                    vscode.postMessage({
                        command: "handleInput",
                        text: text,
                        content: content,
                    });
                    chatInput.value = '';
                    chatInput.style.height = initialInputHeight + 'px';
                }
    
                // Set up a listener to handle the result
                window.addEventListener("message", function (event) {
                    if (event.data.command === "handleInputResult") {
                        handleOutgoingChat(event.data.result);
                    }
                });
    
                function handleFollowup(selectedText, input) {
                    vscode.postMessage({
                        command: "followup",
                        selectedText: selectedText,
                        input: input,
                    });
                }
    
                function retry(selectedText) {
                    vscode.postMessage({
                        command: "retry",
                        selectedText: selectedText,
                    });
                }
                function appendMessage(sender, message) {
                    const chat = document.querySelector(".chat");
                    const messageElement = document.createElement("div");
                    messageElement.className =
                        sender === "user" ? "user-message" : "bot-message";
                    const icon = document.createElement("span");
                    icon.className = sender === "user" ? "user-icon" : "bot-icon";
                    icon.innerHTML = sender === "user" ? "👤  " : "🤖  "; // Add icons for the user and bot
                    messageElement.appendChild(icon);
                    messageElement.innerHTML += message;
                    chat.appendChild(messageElement);
                }
    
                // Add an event listener to the "Read More" link.
                const readMoreLinks = document.querySelectorAll(".read-more");
                readMoreLinks.forEach((link) => {
                    link.addEventListener("click", (event) => {
                        // Prevent the default link behavior.
                        event.preventDefault();
    
                        // Get the parent element of the "Read More" link.
                        const parentElement = link.closest(".truncated-text");
    
                        // Remove the "Read More" link from the parent element.
                        link.remove();
    
                        // Display the remaining lines of text.
                        parentElement.classList.remove("truncated");
                    });
                });
    
    
                if (${ getResult } == true) {
                    chatInput.addEventListener("keydown", (e) => {
                        // If the Enter key is pressed without Shift and the window width is larger 
                        // than 800 pixels, handle the outgoing chat
                        if (e.key === "Enter" && !e.shiftKey && window.innerWidth > 800) {
                            e.preventDefault();
                            console.log('Submitted')
                        }
                    });
    
    
                    // function makeChatDiv(){
                    //   const userText = chatInput.value.trim(); // Get chatInput value and remove extra spaces
                    //   if (!userText) return; // If chatInput is empty return from here
                    //   chatInput.style.height = initialInputHeight + 'px';
    
                    //   var html = "<div class='chat-content'><div class='chat-details'><img src='https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Visual_Studio_Code_1.35_icon.svg/512px-Visual_Studio_Code_1.35_icon.svg.png' alt='user-img' style='border-radius:100%; width: 30px; height: 30px;'><p>"+ userText +"</p></div></div>";
    
    
    
                    //   // Create an outgoing chat div with user's message and append it to chat container
                    //   const outgoingChatDiv = createChatElement(html, "outgoing");
                    //   chatContainer.querySelector(".default-text")?.remove();
                    //   chatContainer.appendChild(outgoingChatDiv);
                    //   chatContainer.scrollTo(0, chatContainer.scrollHeight);
    
                    //   // Display the typing animation and call the getChatResponse function
                    //   var htmlIn = "<div class='chat-content' ><div class='chat-details '><img src='https://pbs.twimg.com/media/GA6D0t9WAAAcWXL?format=png&name=small' alt='chatbot-img' style='border-radius:100%; width: 30px; height: 30px;'><div class='typing-animation' id='typing-ani'><div class='typing-dot' style='--delay: 0.2s'></div><div class='typing-dot' style='--delay: 0.3s'></div><div class='typing-dot' style='--delay: 0.4s'></div></div></div></div>"
                    //   // Create an incoming chat div with typing animation and append it to chat container
                    //   const incomingChatDiv = createChatElement(htmlIn, "incoming");
                    //   chatContainer.appendChild(incomingChatDiv);
                    //   chatContainer.scrollTo(0, chatContainer.scrollHeight);
                    // }
    
    
    
                    function makeChatDiv() {
                        const userText = chatInput.value.trim(); // Get chatInput value and remove extra spaces
                        if (!userText) return; // If chatInput is empty, return from here
    
                        const userIcon = "https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Visual_Studio_Code_1.35_icon.svg/512px-Visual_Studio_Code_1.35_icon.svg.png";
                        const botIcon = "https://pbs.twimg.com/media/GA6D0t9WAAAcWXL?format=png&name=small";
    
                        // Create an outgoing chat div with user's message and append it to chat container
                        const userMessageHTML = "<div class='chat-content'><div class='chat-details'><img src='" + userIcon + "' alt='user-img' style='border-radius:100%; width: 30px; height: 30px;'><p>" + userText + "</p></div></div>";
                        const outgoingChatDiv = createChatElement(userMessageHTML, "outgoing");
                        chatContainer.querySelector(".default-text")?.remove();
                        chatContainer.appendChild(outgoingChatDiv);
                        chatContainer.scrollTo(0, chatContainer.scrollHeight);
    
                        // Display the typing animation and call the getChatResponse function
                        const botMessageHTML = "<div class='chat-content' id='typing-ani'><div class='chat-details'><img src='" + botIcon + "' alt='chatbot-img' style='border-radius:100%; width: 30px; height: 30px;'><div class='typing-animation' ><div class='typing-dot' style='--delay: 0.2s'></div><div class='typing-dot' style='--delay: 0.3s'></div><div class='typing-dot' style='--delay: 0.4s'></div></div></div></div>";
                        // Create an incoming chat div with typing animation and append it to chat container
                        const incomingChatDiv = createChatElement(botMessageHTML, "incoming");
                        chatContainer.appendChild(incomingChatDiv);
                        chatContainer.scrollTo(0, chatContainer.scrollHeight);
                    }
    
    
    
                    document.getElementById("send-btn").addEventListener("click", () => {
    
                        const userText = chatInput.value.trim(); // Get chatInput value and remove extra spaces
                        if (!userText) return; // If chatInput is empty return from here
                        makeChatDiv();
                        // Clear the input field and reset its height
                        handleInput('', function (result) {
                        }, chatInput.value);
                    });
                    chatInput.addEventListener("keyup", (event) => {
                        if (event.key === "Enter") {
                            console.log('Submitted')
                        }
                    }
                    );
                }
    
    
    
                const createChatElement = (content, className) => {
                    // Create new div and apply chat, specified class and set html content of div
                    const chatDiv = document.createElement("div");
                    chatDiv.classList.add("chat", className);
                    // chatDiv.innerHTML ="<div class='chat'><div id='bot-message' class='bot-message'>" + content + "</div></div>";
                    chatDiv.innerHTML = content;
                    return chatDiv; // Return the created chat div
                }
    
                const showTypingAnimation = () => {
                    // Display the typing animation and call the getChatResponse function
                    const html = "<div class='chat-content'><div class='chat-details'><img src='https://pbs.twimg.com/media/GA6D0t9WAAAcWXL?format=png&name=small' alt='chatbot-img' style='border-radius:100%; width: 30px; height: 30px;'><div class='typing-animation'><div class='typing-dot' style='--delay: 0.2s'></div><div class='typing-dot' style='--delay: 0.3s'></div><div class='typing-dot' style='--delay: 0.4s'></div></div></div><span onclick='copyResponse(this)' class='material-symbols-rounded'>content_copy</span></div>"
                    // Create an incoming chat div with typing animation and append it to chat container
                    const incomingChatDiv = createChatElement(html, "incoming");
                    chatContainer.appendChild(incomingChatDiv);
                    chatContainer.scrollTo(0, chatContainer.scrollHeight);
                    getChatResponse(incomingChatDiv);
    
                }
            </script>
    </body>
    
    </html>    `





  return finalContentHtml;
}
function handleMessage(message) {
  if (message.command === "retry") {
    if (panel) {
      panel.dispose();
    }
    sendHighlightedTextToBardFromRetry(
      binaryToString(message.selectedText),
      panel
    );
  }
  if (message.command === "handleInput") {
    // content
    // messages
    async function handleFollowUpFunc() {
      const { DiscussServiceClient } = require("@google-ai/generativelanguage");
      const { GoogleAuth } = require("google-auth-library");
      const MODEL_NAME = "models/chat-bison-001";
      const API_KEY = apiKey;
      // const content = "Write a funny poem titled 'The Coder Boy'";
      const content = message.content;
      messagesOutside.push({
        content: content,
      });
      const messages = messagesOutside;
      console.log("Messages Before: ");
      for (let i = 0; i < messages.length; i++) {
        console.log(`Position ${i + 1}: ${messages[i].content}`);
      }
      const client = new DiscussServiceClient({
        authClient: new GoogleAuth().fromAPIKey(API_KEY),
      });

      const context =
        "Reply like a seasoned senior developer and code coach giving detailed explanation to the extracted code line. The file currently being worked on is written in \n '" +
        "Javascript" +
        "' programming language.";
      const examples = [
        {
          input: {
            content:
              "Simply Check this text and say something:axios.post(apiUrl, requestData, { headers }).then(response => {// console.log('Response Status Code:', response.status);console.log('Response Data:', response.data.candidates[0].output.toString());}).catch(error => { console.error('Error:', error);});If it is meaningless, let me know",
          },
          output: {
            content:
              "The provided text appears to be JavaScript code snippet that utilizes the Axios library to perform an HTTP POST request. It sends the request to an API endpoint specified by apiUrl with the request data stored in requestData and custom headers defined in the headers object.Upon successful completion of the request, the then() block is executed, which logs the response status code and the first candidate's output string to the console. If an error occurs during the request, the catch() block is triggered, logging the error details to the console.The code snippet seems meaningful in the context of making HTTP POST requests and handling responses using the Axios library. It demonstrates the basic structure of sending data to an API endpoint and processing the received response",
          },
        },
      ];

      try {
        // Use async/await to wait for the result
        const result = await client.generateMessage({
          model: MODEL_NAME,
          temperature: 0.5,
          candidateCount: 1,
          top_k: 40,
          top_p: 0.95,
          prompt: {
            context: context,
            examples: examples,
            messages: messages,
          },
        });

        if (
          result &&
          result[0] &&
          result[0].candidates &&
          result[0].candidates.length > 0
        ) {
          result[0].candidates.forEach((obj) => {
            messages.push({ content: obj.content });
          });
        } else {
          console.log(
            "Didn't catch that. Please Re-Inspect a more concise code segment."
          );
        }

        // Return the content from the last candidate
        return messages[messages.length - 1].content;
      } catch (error) {
        if (error.code === "ECONNABORTED") {
          // Handle ECONNABORTED error if needed
        } else {
          console.error("Error sending text to Bard:", error);
        }
      }
    }

    async function logResult() {
      const result = await handleFollowUpFunc();
      return result;
    }

    // Asynchronous function, so use then() to log the result
    logResult().then((resultFromFollowUp) => {
      if (resultFromFollowUp) {
        const formattedResponse = resultFromFollowUp
          .split("\n")
          .filter((line) => line.trim() !== "")
          .map((paragraph) => `<p>${paragraph}</p>`)
          .join("")
          .toString();
        const codeRegex = /```([\s\S]*?)```/g;
        function replaceParagraphTagsWithNewlines(match) {
          const replacedMatch = match
            .replace(/<\/p><p>/g, "\n")
            .replace(/```/g, "");
          return (
            "<pre style='padding: 10px; padding-right: 10px; border-radius:5px; background-color: black; white-space: no-wrap; overflow-x: auto; max-width: 60%; margin-left: 30px;'><pre><code style = 'color: white;'><xmp>" +
            replacedMatch +
            "</xmp></code></pre></pre>"
          );
        }
        const searchedResult = formattedResponse.replace(
          codeRegex,
          replaceParagraphTagsWithNewlines
        );

        // Send the result back to the webview
        panel.webview.postMessage({
          command: "handleInputResult",
          result: searchedResult,
        });
      } else {
        panel.webview.postMessage({
          command: "handleInputResult",
          result: "An Error Occured. Please Retry",
        });
      }
      console.log("Messages After: ");
      for (let i = 0; i < messagesOutside.length; i++) {
        console.log(`Position ${i + 1}: ${messagesOutside[i].content}`);
      }
    });
  }
}

function deactivate() {
  if (panel) {
    panel.dispose();
  }
}

module.exports = {
  activate,
  deactivate,
};
