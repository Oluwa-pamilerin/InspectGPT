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
// Now you can access the file contents from outside the function using the 'fileContents' array.

// ... (Previous code)

// Function to send highlighted text to Bard and handle the response.

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
  var {GoogleAuth, JWT, OAuth2Client} = require('google-auth-library');

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

var messagess = [1];
function handleFollowUpFunc(logable) {
  console.log("Goin well");
  return messagess;
}

function sayHello() {
  return "sayHello Called";
}

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
      "<pre style='padding: 10px; padding-right: 10px; border-radius:5px; background-color: black; white-space: no-wrap; overflow-x: auto;'><pre><code style = 'color: white;'><xmp>" +
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
    .replace("{{DiscussServiceClient}}", require("@google-ai/generativelanguage"))
    .replace("{{GoogleAuth}}", require("google-auth-library"));

  return finalContent;
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
            "<pre style='padding: 10px; padding-right: 10px; border-radius:5px; background-color: black; white-space: no-wrap; overflow-x: auto;'><pre><code style = 'color: white;'><xmp>" +
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
