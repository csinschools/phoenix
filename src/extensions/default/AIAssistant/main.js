/*
 * GNU AGPL-3.0 License
 *
 * Copyright (c) 2021 - present core.ai . All rights reserved.
 *
 * This program is free software: you can redistribute it and/or modify it
 * under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT
 * ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or
 * FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License
 * for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see https://opensource.org/licenses/AGPL-3.0.
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

/*jslint vars: true, plusplus: true, devel: true, nomen: true, regexp: true, indent: 4, maxerr: 50 */
/*global define, brackets */
//jshint-ignore:no-start

define(function (require, exports, module) {


    var CommandManager     = brackets.getModule("command/CommandManager"),
        ExtensionUtils     = brackets.getModule("utils/ExtensionUtils"),
        FeatureGate        = brackets.getModule("utils/FeatureGate"),
        WorkspaceManager   = brackets.getModule("view/WorkspaceManager"),
        AppInit            = brackets.getModule("utils/AppInit");

    const FEATURE_AI_ASSISTANT = 'AIAssistant';

    FeatureGate.registerFeatureGate(FEATURE_AI_ASSISTANT, true);

    // Templates
    var panelHTML       = require("text!panel.html");

    // jQuery objects
    var $icon,
        $iframe,
        $panel;

    // Other vars
    var panel,
        toggleCmd;

    function _setPanelVisibility(isVisible) {
        if (isVisible) {
            $icon.toggleClass("active");

            panel.show();

        } else {
            $icon.toggleClass("active");
            panel.hide();
        }
    }

    function _toggleVisibility() {
        let visible = !panel.isVisible();
        _setPanelVisibility(visible);

        toggleCmd.setChecked(visible);
    }

    ExtensionUtils.loadStyleSheet(module, "AIAssistant.css");
    // todo: replace with extension manager dialogue command
    toggleCmd = CommandManager.register("AI Assistant Panel", "toggleAIAssistantPanel", _toggleVisibility);

    function _createExtensionPanel() {
        $icon = $("#toolbar-chat");
        $icon.removeClass("hidden-element");
        $icon.click(_toggleVisibility);
        $panel = $(panelHTML);
        /*
        $iframe = $panel.find("#AIAssistant-frame");
        $iframe[0].onload = function () {
            $iframe.attr('srcdoc', null);
        };
        $iframe.attr('src', brackets.config.extension_store_url);
        */
        let minSize = window.innerWidth/3;

        panel = WorkspaceManager.createPluginPanel("AIAssistant-panel", $panel, minSize, $icon);

        WorkspaceManager.recomputeLayout(false);
    }

    AppInit.appReady(function () {
        if(!FeatureGate.isFeatureEnabled(FEATURE_AI_ASSISTANT)){
            return;
        }
        _createExtensionPanel();
        _createAssistant(null, 'chat-container', 'AIAssistant');
    });

    function _createAssistant(file, containerId, containerPrefix = 'editorContainer') {
        // Find the parent container using the containerPrefix
        const parentContainer = document.getElementById(containerPrefix);
        if (!parentContainer) {
            console.error(`Parent container with id '${containerPrefix}' not found.`);
            return;
        }
        parentContainer.classList.add('assistant-container');
        // Check for an existing chat interface and remove it
        const existingChat = parentContainer.querySelector(`#${containerId}`);
        if (existingChat) {
            existingChat.remove();
        }

        // Create the chat container div
        const chatContainer = document.createElement('div');
        chatContainer.id = containerId;
        chatContainer.classList.add('chat-container');

        // Create the chat messages div
        const chatMessagesDiv = document.createElement('div');
        chatMessagesDiv.id = 'chat';
        chatContainer.appendChild(chatMessagesDiv);

        // Create the user input div
        const userInputDiv = document.createElement('div');
        userInputDiv.id = 'user-input';

        // Create the textarea for input
        const textarea = document.createElement('textarea');
        textarea.classList.add('user-input');
        textarea.id = 'input-box';
        textarea.placeholder = 'Send a message...';

        // Event listener for textarea
        textarea.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault(); // Prevent default behavior (new line)
                const message = this.value.trim();
                if (message) {
                    this.value = '';
                    displayUserMessage(message);
                    callOpenAI(message);
                    document.getElementById('input-box').style.height = '74px'; // Reset before adjusting to get accurate scrollHeight
                    document.getElementById('chat').style.minHeight = `calc(100% - 168px`;
                    document.getElementById('chat').style.maxHeight = `calc(100% - 168px`;
                }
            }
        });

        userInputDiv.appendChild(textarea);

        // Create the send button
        const sendButton = document.createElement('button');
        sendButton.id = 'send-button';
        sendButton.innerHTML = '<i class="fa-solid fa-paper-plane"></i>';
        sendButton.addEventListener('click', function () {
            const inputBox = document.getElementById('input-box');
            const message = inputBox.value.trim(); // remove leading and trailing whitespace

            if (!inputBox.disabled && message.length > 0) { // Only send the message if the input box is not disabled and the message is not empty
                inputBox.value = '';
                displayUserMessage(message);
                callOpenAI(message);
                document.getElementById('input-box').style.height = '74px'; // Reset before adjusting to get accurate scrollHeight
                document.getElementById('chat').style.minHeight = `calc(100% - 168px`;
                document.getElementById('chat').style.maxHeight = `calc(100% - 168px`;
            }
        });
        userInputDiv.appendChild(sendButton);

        // Append the user input div to the chat container
        chatContainer.appendChild(userInputDiv);

        // Create the controls container div
        const controlsContainer = document.createElement('div');
        controlsContainer.id = 'controls-container';
        controlsContainer.classList.add('controls-container');


        // Wrapper for context checkbox
        const contextCheckboxWrapper = document.createElement('div');
        contextCheckboxWrapper.classList.add('control-wrapper');

        // Create the checkbox
        const contextCheckbox = document.createElement('input');
        contextCheckbox.type = 'checkbox';
        contextCheckbox.id = 'context-checkbox';
        contextCheckbox.classList.add('custom-checkbox');
        contextCheckboxWrapper.appendChild(contextCheckbox);
        contextCheckboxWrapper.title = 'Enable context for the AI near your cursor position. This increases API token usage.';

        const checkboxLabelCustom = document.createElement('label');
        checkboxLabelCustom.htmlFor = 'context-checkbox';
        checkboxLabelCustom.textContent = ':';
        checkboxLabelCustom.classList.add('checkboxLabelCustom');
        contextCheckboxWrapper.appendChild(checkboxLabelCustom);

        // Create the label for the checkbox
        const checkboxLabel = document.createElement('span');
        checkboxLabel.textContent = 'context: ';

        contextCheckboxWrapper.appendChild(checkboxLabel);

        // Append contextCheckboxWrapper to controlsContainer
        controlsContainer.appendChild(contextCheckboxWrapper);

        // Wrapper for file name
        const fileNameWrapper = document.createElement('div');
        fileNameWrapper.classList.add('control-wrapper');

        // Create the span for the file name
        const fileNameSpan = document.createElement('span');
        fileNameSpan.id = 'file-name-span';
        fileNameSpan.textContent = file ? file.name : 'No file selected';
        fileNameWrapper.appendChild(fileNameSpan);

        // Append fileNameWrapper to controlsContainer
        controlsContainer.appendChild(fileNameWrapper);

        // Placeholder for new dropdown select
        const dropdownWrapper = document.createElement('div');
        dropdownWrapper.classList.add('control-wrapper');
        dropdownWrapper.classList.add('gpt-model-wrapper');


        let dropdownIcon = document.createElement('div');
        dropdownIcon.classList.add('dropdown-icon');
        dropdownIcon.classList.add('gpt-35-color');

        const dropdownSelect = document.createElement('select');
        dropdownSelect.id = 'gpt-model-select'; // Replace with a suitable ID
        // Add options to dropdownSelect as needed

        //createNotification(true);
        //updateModalMessage("Assistant set to gpt-3.5, project context disabled.");

        //setTimeout(() => startCloseCountdown(3000), 10);
        // Option for GPT-3.5
        const optionGPT35 = document.createElement('option');
        optionGPT35.value = 'gpt-3.5';
        optionGPT35.textContent = 'GPT-3.5';
        dropdownSelect.appendChild(optionGPT35);

        // if(defaultApiKey==false){
        const optionGPT4 = document.createElement('option');
        optionGPT4.id = 'gpt-4-select';
        optionGPT4.value = 'gpt-4';
        optionGPT4.textContent = 'GPT-4';
        dropdownSelect.appendChild(optionGPT4);
        // }
        const optionGemini = document.createElement('option');
        optionGemini.id = 'Gemini-select';
        optionGemini.value = 'Gemini';
        optionGemini.textContent = 'Gemini';
        dropdownSelect.appendChild(optionGemini);

        const optionClaude = document.createElement('option');
        optionClaude.id = 'Claude-select';
        optionClaude.value = 'Claude';
        optionClaude.textContent = 'Claude';
        dropdownSelect.appendChild(optionClaude);

        // Event listener for changes in dropdown selection
        dropdownSelect.addEventListener('change', (event) => {
            const selectedModel = event.target.value;
            const gptIcons = document.querySelectorAll('.icon-label-container i.fa-robot'); // Select all GPT icons

            gptIcons.forEach(gptIcon => {
                if (selectedModel === 'gpt-4') {
                    if (defaultApiKey == false) {
                        dropdownIcon.classList.add('gpt-4-color');
                        dropdownIcon.classList.remove('gpt-35-color');
                        dropdownIcon.classList.remove('gemini-color');
                        dropdownIcon.classList.remove('claude-color');
                    } else {
                        event.target.value = 'gpt-3.5'
                        //createNotification(true);
                        //updateModalMessage("Assistant set to gpt-3.5, to use gpt-4 go to settings and upload your api key.");
                        //setTimeout(() => startCloseCountdown(5000), 10);
                    }
                } else if (selectedModel === 'Gemini') {
                    if (userApiKeyGemini != "") {
                        dropdownIcon.classList.add('gemini-color');
                        dropdownIcon.classList.remove('gpt-35-color');
                        dropdownIcon.classList.remove('gpt-4-color');
                        dropdownIcon.classList.remove('claude-color');
                    } else {
                        event.target.value = 'gpt-3.5'
                        //createNotification(true);
                        //updateModalMessage("Assistant set to gpt-3.5, to use Gemini go to settings and upload your api key.");
                        //setTimeout(() => startCloseCountdown(5000), 10);
                    }
                } else if (selectedModel === 'Claude') {
                    if (userApiKeyClaude != "") {
                        dropdownIcon.classList.remove('gemini-color');
                        dropdownIcon.classList.remove('gpt-35-color');
                        dropdownIcon.classList.remove('gpt-4-color');
                        dropdownIcon.classList.add('claude-color');
                    } else {
                        event.target.value = 'gpt-3.5'
                        //createNotification(true);
                        //updateModalMessage("Assistant set to gpt-3.5, to use Claude go to settings and upload your api key.");
                        //setTimeout(() => startCloseCountdown(5000), 10);
                    }
                } else if (selectedModel === 'gpt-3.5') {
                    dropdownIcon.classList.add('gpt-35-color');
                    dropdownIcon.classList.remove('gpt-4-color');
                    dropdownIcon.classList.remove('gemini-color');
                    dropdownIcon.classList.remove('claude-color');
                }
            });
        });




        dropdownWrapper.appendChild(dropdownIcon);
        var dropdownButton = document.createElement('button');
        dropdownButton.id = 'dropdown-button-gpt';
        dropdownButton.textContent = 'GPT-3.5';
        dropdownWrapper.appendChild(dropdownButton);
        dropdownWrapper.appendChild(dropdownSelect);

        var fakeDropdown = document.createElement('div');
        fakeDropdown.id = 'fake-dropdown';
        fakeDropdown.className = 'fake-dropdown';

        // Create and append the fake-option divs
        var options = [
            { text: 'GPT-3.5', value: 'gpt-3.5' },
            { text: 'GPT-4', value: 'gpt-4' },
            { text: 'Gemini', value: 'Gemini' },
            { text: 'Claude', value: 'Claude' }
        ];

        options.forEach(function (option) {
            var fakeOption = document.createElement('div');
            fakeOption.className = 'fake-option';
            fakeOption.setAttribute('data-value', option.value);
            fakeOption.textContent = option.text;
            fakeDropdown.appendChild(fakeOption);
        });
        dropdownWrapper.appendChild(fakeDropdown);
        controlsContainer.appendChild(dropdownWrapper);

        // Append the controls container div to the chat container, before the user input
        chatContainer.insertBefore(controlsContainer, userInputDiv);
        // Append the chat container to the parent container
        parentContainer.appendChild(chatContainer);

        // Optionally, store the chat interface instance for future reference
        // chatInterfaceInstances[containerId] = chatContainer;
        // Load and display stored messages if any
        loadAndDisplayStoredMessages();
        // Update button text when a fake option is selected


        dropdownButton.addEventListener('click', function (event) {
            event.stopPropagation();
            fakeDropdown.style.display = fakeDropdown.style.display === 'none' ? 'block' : 'none';
        });

        document.querySelectorAll('.fake-option').forEach(option => {

            option.addEventListener('click', (event) => {
                const selectedModel = event.target.dataset.value;
                const selectedModelText = event.target.textContent;
                // Update the select value
                document.getElementById('gpt-model-select').value = selectedModel;
                document.getElementById('gpt-model-select').dispatchEvent(new Event('change'));
                // Update the button text to match the selected model
                // document.getElementById('dropdown-button-gpt').textContent = selectedModelText;
                // Hide the dropdown after selection
                document.getElementById('fake-dropdown').style.display = 'none';
            });
        });

        // Optionally, listen for changes to the real select element, if it's interacted with elsewhere in your application
        document.getElementById('gpt-model-select').addEventListener('change', (event) => {
            const selectedOptionText = event.target.options[event.target.selectedIndex].text;
            document.getElementById('dropdown-button-gpt').textContent = selectedOptionText;
        });

        // Hide the dropdown when clicking anywhere off screen
        document.addEventListener('click', () => {
            let fakeDropdownMenu = document.getElementById('fake-dropdown')
            if (fakeDropdownMenu) {
                fakeDropdownMenu.style.display = 'none';
            }
        });
        // document.getElementById('input-box').addEventListener('keydown', function (event) {
        //     // Check if Enter is pressed without the Shift key
        //     if (event.key === 'Enter' && !event.shiftKey) {
        //         event.preventDefault(); // Prevent default behavior (new line)
        //         const message = this.value.trim();
        //         if (message) {
        //             this.value = '';
        //             displayUserMessage(message);
        //             callOpenAI(message);
        //             document.getElementById('input-box').style.height = '74px'; // Reset before adjusting to get accurate scrollHeight
        //             document.getElementById('chat').style.minHeight = `calc(100% - 168px`;
        //             document.getElementById('chat').style.maxHeight = `calc(100% - 168px`;
        //         }
        //     }
        // });
        let textArea = document.getElementById('input-box')
        let chat = document.getElementById('chat')
        // window.addEventListener("resize", function () {
        //     adjustTextareaHeight(textArea, chat);
        // });
        textArea.addEventListener("input", function () {
            adjustTextareaHeight(textArea, chat);
        });
        function adjustTextareaHeight(textarea, chat) {
            if (textarea.scrollHeight > 54) {
                textarea.style.height = '54px'; // Reset before adjusting to get accurate scrollHeight
                textarea.style.height = `${textarea.scrollHeight - 0}px`;
                if (textarea.scrollHeight < 500) {
                    chat.style.minHeight = `calc(100% - ${74 + textarea.scrollHeight}px`;
                    chat.style.maxHeight = `calc(100% - ${74 + textarea.scrollHeight}px`;
                } else {
                    textarea.style.height = '54px'; // Reset before adjusting to get accurate scrollHeight
                    textarea.style.height = `${470 - 0}px`;
                    chat.style.minHeight = `calc(100% - ${74 + 490}px`;
                    chat.style.maxHeight = `calc(100% - ${74 + 490}px`;
                }

            } else {
                textarea.style.height = '54px'; // Reset before adjusting to get accurate scrollHeight
                textarea.style.height = `${textarea.scrollHeight - 0}px`;
                chat.style.minHeight = `calc(100% - 174px`;
                chat.style.maxHeight = `calc(100% - 174px`;
            }
        }


        return chatContainer;
    }    


    let messageIdCounter = 0;
    let finishedTyping = false;
    
    let sessionMessages = [
        {
            role: 'system',
            content: `Instruction for Assistant: You CAN see the users code, your are integrated into an IDE, see their code in system messages. EVERYTIME you mention ANY file name in your response, replace ALL file names with a [[BUTTON:filename]]. ` +
                'This is a direct action button for users, not a task for you to perform. Example: "You might need [[BUTTON:index.html]], [[BUTTON:style.css]], and [[BUTTON:sketch.js]] for your project."' +
                'remember EVERYTIME you mention ANY file name in your response, replace ALL file names with a [[BUTTON:(filename you want to reference)]], this includes titles or anything (EXCLUDING inside code boxes!)'
        },
        {
            role: 'assistant',
            content: 'Hello! I’m here to assist you with your coding queries. Feel free to ask me anything related to programming.'
        }
    ];
    function newChat(shouldConfirm = true) {
        // Check if we need to show confirmation dialog
        if (shouldConfirm) {
            customConfirm("Remove chat history? This cannot be undone.", true)
                .then(confirmed => {
                    if (confirmed) {
                        // User confirmed, proceed to clear the chat history
                        resetChatHistoryAndUI();
                    } else {
                        // User cancelled, do nothing
                        console.log("Chat clear cancelled by user.");
                    }
                });
        } else {
            // No need for confirmation, clear the chat history directly
            resetChatHistoryAndUI();
        }
    }
    function resetChatHistoryAndUI() {
        sessionMessages = [
            {
                role: 'system',
                content: `Instruction for Assistant: You CAN see the users code, your are integrated into an IDE designed for creative coding, primarily p5, see their code in system messages. EVERYTIME you mention ANY file name in your response, replace ALL file names with a [[BUTTON:filename]]. ` +
                    'This is a direct action button for users, not a task for you to perform. Example: "You might need [[BUTTON:index.html]], [[BUTTON:style.css]], and [[BUTTON:sketch.js]] for your project."' +
                    'remember EVERYTIME you mention ANY file name in your response, replace ALL file names with a [[BUTTON:(filename you want to reference)]], this includes titles or anything (EXCLUDING inside code boxes!)'
            },
            {
                role: 'assistant',
                content: 'Hello! I’m here to assist you with your coding queries. Feel free to ask me anything related to programming.'
            }
        ];
        saveMessagesToCache(sessionMessages);
        clearChatUI();
        // createChatSuggestions()
        loadAndDisplayStoredMessages();
        let assistantName = document.querySelector('.icon-label-container span')
        let message = document.querySelector('.message-content')
        translateElement(message, startingLanguage, newLanguage);
        translateElement(assistantName, startingLanguage, newLanguage);
        
    }
    
    function clearChatUI() {
        const chat = document.getElementById('chat');
        chat.innerHTML = ''; // Remove all child elements from chat
    }
    
    function removeChatSuggestions() {
        const modal = document.querySelector('.suggestions-modal');
        if (modal) {
            modal.remove();
        }
        const settingBtn = document.querySelector('.config-container');
        if (settingBtn) {
            settingBtn.remove();
        }
    }
    function loadMessagesFromCache() {
        const storedMessages = localStorage.getItem('chatHistory');
        if (storedMessages) {
            return JSON.parse(storedMessages);
        }
        return [
            {
                role: 'system',
                content: 'Instruction for Assistant: You CAN see the users code, your are integrated into an IDE designed for creative coding, primarily p5, see their code in system messages. EVERYTIME you mention ANY file name in your response, replace ALL file names with a [[BUTTON:filename]]. ' +
                    'This is a direct action button for users, not a task for you to perform. Example: "You might need [[BUTTON:index.html]], [[BUTTON:style.css]], and [[BUTTON:sketch.js]] for your project."' +
                    'remember EVERYTIME you mention ANY file name in your response, replace ALL file names with a [[BUTTON:(filename you want to reference)]], this includes titles or anything (EXCLUDING inside code boxes!)'
            },
            {
                role: 'assistant',
                content: 'Hello! I’m here to assist you with your coding queries. Feel free to ask me anything related to programming.'
            }
        ];
    }
    
    // THIS IS IN EDITOR.HTML in its own script tag
    // document.addEventListener('DOMContentLoaded', () => {
    //     sessionMessages = loadMessagesFromCache();
    //      displayChatHistory(sessionMessages);
    //      openAssistant(containerTypes.AI, 'container2')
    // });
    
    function saveMessagesToCache(messages) {
        localStorage.setItem('chatHistory', JSON.stringify(messages));
    }
    
    
    // let sessionMessages = [
    //     {
    //         role: 'system',
    //         content: '' 
    //     },
    //     {
    //         role: 'assistant',
    //         content: ''
    //     }
    // ];
    
    
    
    function handleButtonCommand(commandName, buttonElement) {
        if (finishedTyping) {
            let targetFile = findFileByName(fileSystem, commandName)
            if (targetFile) {
                const fileItem = document.querySelector(`.file-item[data-id="${targetFile.id}"]`);
    
                fileItem.click();
            } else {
                addFile('root', 'container', commandName)
                buttonElement.setAttribute('data-action', 'open');
            }
        }
        console.log(`Button pressed: ${commandName}`);
        // Implement your logic for handling different commands
    }
    
    function loadAndDisplayStoredMessages() {

        sessionMessages.forEach((message, index) => {
            if (message.role === 'user') {
                displayUserMessage(message.content);
            } else if (message.role === 'assistant') {
                //console.log(message.AIUsed||'gpt-3.5')
                const isLastMessage = index === sessionMessages.length - 1;
                if (isLastMessage && !finishedTyping) {
                    const inputBox = document.getElementById('input-box');
                    const sendButton = document.getElementById('send-button');
                    inputBox.disabled = true;
                    sendButton.disabled = true;
                    inputBox.placeholder = "Processing...";
                    // Use the slow display for the last message if finishedTyping is false
                    displayResponse(message.content, () => {
                        inputBox.disabled = false;
                        sendButton.disabled = false;
                        inputBox.placeholder = "Send a message...";
                        const chat = document.getElementById('chat');
                        const responseCommands = generateResponseCommands();
                        chat.appendChild(responseCommands);
                        chat.scrollTop = chat.scrollHeight;
                        finishedTyping = true;
                    }, message.AI);
                } else {
    
                    // Use the quick display for all other messages or if finishedTyping is true
                    displayResponseQuick(message.content, message.AIUsed || 'gpt-3.5');
                }
            }
        });
    }
    
    
    function escapeHtml(unsafe) {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }
    
    function formatMessageText(text) {
        return text.replace(/ /g, '&nbsp;').replace(/\n/g, '<br>');
    }
    function updateUserLabels(profileImageUrl) {
        const labels = document.querySelectorAll('.username-label');
        labels.forEach(label => {
            label.textContent = currentUserUsername; // Update label with the new username
        });
    
        const icons = document.querySelectorAll('.profile-icon');
        icons.forEach(icon => {
            icon.style.backgroundImage = "url('')"; // Update path accordingly
            icon.style.backgroundColor = "transparent"
            icon.style.color = "var(--hover)"
        });
    }
    
    
    function displayUserMessage(message) {
        removeChatSuggestions()
        message = escapeHtml(message);
        const chat = document.getElementById('chat');
        const userMessage = document.createElement('div');
        userMessage.className = 'message user-message';
    
        // Create the icon and label container
        const iconLabelContainer = document.createElement('div');
        iconLabelContainer.className = 'icon-label-container';
    
        // Create the icon
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-user profile-icon';

        icon.style.backgroundColor = "transparent"
        icon.style.color = "var(--hover)"
    
        // Create the label
        const label = document.createElement('span');
        label.className = 'username-label';
        label.textContent = 'user';
        iconLabelContainer.appendChild(label);
    
        // Append the icon and label container to the user message
        userMessage.appendChild(iconLabelContainer);
        iconLabelContainer.appendChild(icon);
        // Create the message text container
        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';
        const messageText = document.createElement('div');
        messageText.className = 'message-text';
        messageText.innerHTML = message; //DOMPurify.sanitize(message); // Use DOMPurify to sanitize the message
        messageContent.appendChild(messageText);
    
        // Append the message content to the user message
        userMessage.appendChild(messageContent);
    
        // Append the user message to the chat
        chat.appendChild(userMessage);
        chat.scrollTop = chat.scrollHeight;
        const chatDiv = document.getElementById('chat');
        chatDiv.scrollTop = chatDiv.scrollHeight;
    }
    
    function displayResponse(response, callback) {
        finishedTyping = false;
        const chat = document.getElementById('chat');
    
        const existingButtons = chat.querySelector('.gpt-response-buttons');
        if (existingButtons) {
            existingButtons.remove();
        }
        const botMessage = document.createElement('div');
        botMessage.className = 'message bot-message';
    
        // Create the icon and label container
        const iconLabelContainer = document.createElement('div');
        iconLabelContainer.className = 'icon-label-container';
    
        // Create the icon
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-robot';
        const selectedModel = document.getElementById('gpt-model-select').value;
        const label = document.createElement('span');
        label.textContent = 'Assistant';
    
        if (selectedModel === 'gpt-4') {
            label.textContent = 'GPT-4';
            icon.classList.add('gpt-4-color');
            icon.classList.remove('gpt-35-color');
            icon.classList.remove('gemini-color');
            icon.classList.remove('claude-color');
        } else if (selectedModel === 'Gemini') {
            label.textContent = 'Gemini';
            icon.classList.remove('gpt-35-color');
            icon.classList.remove('gpt-4-color');
            icon.classList.add('gemini-color');
            icon.classList.remove('claude-color');
        } else if (selectedModel === 'gpt-3.5') {
            label.textContent = 'GPT-3.5';
            icon.classList.add('gpt-35-color');
            icon.classList.remove('gpt-4-color');
            icon.classList.remove('gemini-color');
            icon.classList.remove('claude-color');
        } else if (selectedModel === 'Claude') {
            label.textContent = 'Claude';
            icon.classList.remove('gpt-35-color');
            icon.classList.remove('gpt-4-color');
            icon.classList.remove('gemini-color');
            icon.classList.add('claude-color');
        }
        // if (selectedModel === 'gpt-4') {
        //     icon.classList.add('gpt-4-color');
        //     icon.classList.remove('gpt-35-color');
        //     icon.classList.remove('gemini-color');
        // } else if (selectedModel === 'gpt-3.5') {
        //     icon.classList.add('gpt-35-color');
        //     icon.classList.remove('gpt-4-color');
        //     icon.classList.remove('gemini-color');
        // } else if (selectedModel === 'Gemini') {
        //     icon.classList.remove('gpt-35-color');
        //     icon.classList.remove('gpt-4-color');
        //     icon.classList.add('gemini-color');
        // }
        iconLabelContainer.appendChild(icon);
    
        // Create the label
    
        iconLabelContainer.appendChild(label);
    
        // Append the icon and label container to the bot message
        botMessage.appendChild(iconLabelContainer);

        /*
    
        // Initialize Markdown-it
        var md = window.markdownit({
            highlight: function (str, lang) {
                var language = lang && Prism.languages[lang] ? lang : 'code';
                try {
                    return '<div class="code-block">' +
                        '<div class="code-header">' +
                        '<span class="code-language">' + language.toLowerCase() + '</span>' +
                        '<button class="insert-button hidden" onclick="insertCode(this)">Insert</button>' + // First Insert button
                        '<button class="copy-button hidden" onclick="copyCode(this)">Copy</button>' + // First Copy button
                        '</div>' +
    
                        '<pre class="language-' + language + '"><code>' +
                        (Prism.languages[lang] ? Prism.highlight(str, Prism.languages[lang], lang) : str) +
                        '</code></pre>' +
    
                        '<div class="button-container-code-buttons">' + // Container for second set of buttons
                        '<button class="insert-button second-insert-button hidden" onclick="insertCode(this)">Insert</button>' + // Second Insert button
                        '<button class="copy-button second-copy-button hidden" onclick="copyCode(this)">Copy</button>' + // Second Copy button
                        '</div>' +
                        '</div>';
                } catch (__) {
                    return ''; // Use external default escaping
                }
            }
        });

        // Render the response using Markdown-it
        let renderedResponse = md.render(response);
    
        // Parse for buttons and replace button markup with actual buttons
        renderedResponse = renderedResponse.replace(/\[\[BUTTON:(.*?)\]\]/g, (match, fileName) => {
            // Check if the file exists in the file system
            let targetFile = findFileByName(fileSystem, fileName);
            let fileAction = targetFile ? 'open' : 'add';
    
            // Return the button with the appropriate data-action attribute
            return `<button data-action="${fileAction}" class="response-button" onclick="handleButtonCommand('${fileName}', this)">${fileName}</button>`;
        });        
        */
    
        let messageContentDiv = document.createElement('div');
        messageContentDiv.className = 'message-content';
        botMessage.appendChild(messageContentDiv);
        chat.appendChild(botMessage);
       

        // render the markdown here
        let marked = brackets.getModule('thirdparty/marked.min');        
        let renderedResponse = marked.marked(response);;//"test test";
    
    
        // Create a temporary container for the rendered HTML
        let tempContainer = document.createElement('div');
        tempContainer.innerHTML = renderedResponse;
        tempContainer.style.display = 'none'; // Hide the container
        document.body.appendChild(tempContainer); // Append to body to get CSS styling
    
        let defaultApiKey = true;
        // Typing effect
        if (defaultApiKey) {
            typeMessage(tempContainer, messageContentDiv, callback);
        } else {
            typeMessageFaster(tempContainer, messageContentDiv, callback);
    
        }
        botMessage.appendChild(messageContentDiv);
    
        chat.appendChild(botMessage);
        // const responseCommands = generateResponseCommands();
        // chat.appendChild(responseCommands);
        chat.scrollTop = chat.scrollHeight;
    
        messageIdCounter++;
        const chatDiv = document.getElementById('chat');
        chatDiv.scrollTop = chatDiv.scrollHeight;
    }
    
    function typeMessage(tempContainer, displayContainer, callback) {
        let fullText = tempContainer.innerHTML;
        let i = 0;
        let codeSpeed = chatSpeed; // Speed inside code blocks (increase for slower typing, decrease for faster)
        let typingSpeed = chatSpeed; // General typing speed (increase for slower typing, decrease for faster)
    
        function typeChar() {
            if (i < fullText.length) {
                // Check if the chat is scrolled to the bottom before adding new content
                let isScrolledToBottom = chat.scrollHeight - chat.clientHeight <= chat.scrollTop + 1;
    
                // If starting an HTML tag, jump to the end of the tag
                if (fullText[i] === '<') {
                    let endOfTag = fullText.indexOf('>', i) + 1;
                    i = endOfTag;
                } else if (fullText.slice(i).startsWith('<div class="code-block">')) {
                    // If starting a code block, jump to the end of the code header
                    let endOfHeader = fullText.indexOf('</div>', i) + 6; // 6 is the length of '</div>'
                    i = endOfHeader;
                } else {
                    i++;
                }
    
                displayContainer.innerHTML = fullText.slice(0, i);
    
                // Check if current character is inside a code block
                let inCodeBlock = fullText.slice(i).startsWith('<pre') ||
                    (i > 0 && fullText.slice(0, i).includes('<pre'));
    
                // Auto-scroll only if the chat was already at the bottom
                if (isScrolledToBottom) {
                    chat.scrollTop = chat.scrollHeight;
                }
    
                // Use different speeds depending on whether the text is inside a code block
                setTimeout(typeChar, inCodeBlock ? codeSpeed : typingSpeed);
            } else {
                document.body.removeChild(tempContainer); // Clean up
                if (callback && typeof callback === 'function') {
                    callback(); // Call the callback function when typing is done
                }
            }
        }
    
        // Initially hide the display container and show it when typing starts
        displayContainer.style.visibility = 'hidden';
        setTimeout(() => {
            displayContainer.style.visibility = 'visible';
            typeChar();
        }, 0);
    }
    function typeMessageFaster(tempContainer, displayContainer, callback) {
        let fullText = tempContainer.innerHTML;
        let i = 0;
        let codeSpeed = chatSpeed; // Speed inside code blocks (increase for slower typing, decrease for faster)
        let typingSpeed = chatSpeed; // General typing speed (increase for slower typing, decrease for faster)
    
        function typeChar() {
            if (i < fullText.length) {
                // Check if the chat is scrolled to the bottom before adding new content
                let isScrolledToBottom = chat.scrollHeight - chat.clientHeight <= chat.scrollTop + 1;
    
                // If starting an HTML tag, jump to the end of the tag
                if (fullText[i] === '<') {
                    let endOfTag = fullText.indexOf('>', i) + 1;
                    displayContainer.innerHTML = fullText.slice(0, endOfTag);
                    i = endOfTag;
                } else if (fullText.slice(i).startsWith('<div class="code-block">')) {
                    // If starting a code block, jump to the end of the code header
                    let endOfHeader = fullText.indexOf('</div>', i) + 6; // 6 is the length of '</div>'
                    displayContainer.innerHTML = fullText.slice(0, endOfHeader);
                    i = endOfHeader;
                } else {
                    // Find the end of the next word
                    let spaceIndex = fullText.indexOf(' ', i + 1); // Find the next space after the current index
                    if (spaceIndex === -1) spaceIndex = fullText.length; // If no more spaces, go to the end of the text
                    i = spaceIndex + 1; // Move past the space (to start of next word)
                    displayContainer.innerHTML = fullText.slice(0, i);
                }
    
                // Check if current character is inside a code block
                let inCodeBlock = fullText.slice(i).startsWith('<pre') ||
                    (i > 0 && fullText.slice(0, i).includes('<pre'));
    
                // Auto-scroll only if the chat was already at the bottom
                if (isScrolledToBottom) {
                    chat.scrollTop = chat.scrollHeight;
                }
    
                // Use different speeds depending on whether the text is inside a code block
                setTimeout(typeChar, inCodeBlock ? codeSpeed : typingSpeed);
            } else {
                document.body.removeChild(tempContainer); // Clean up
                if (callback && typeof callback === 'function') {
                    callback(); // Call the callback function when typing is done
                }
            }
        }
    
        // Initially hide the display container and show it when typing starts
        displayContainer.style.visibility = 'hidden';
        setTimeout(() => {
            displayContainer.style.visibility = 'visible';
            typeChar();
        }, 0);
    }
    
    
    
    function generateResponseCommands() {
        const chat = document.getElementById('chat');
    
        // Remove existing response buttons
        const existingButtons = chat.querySelector('.gpt-response-buttons');
        if (existingButtons) {
            existingButtons.remove();
        }
    
        const responseButtonsContainer = document.createElement("div");
        responseButtonsContainer.classList.add("gpt-response-buttons");
        if (sessionMessages.length === 2 && sessionMessages[1].role === 'assistant') {
            return responseButtonsContainer;
        }
        const regenerateButton = document.createElement("button");
        regenerateButton.classList.add("gpt-regenerate-button");
        //regenerateButton.textContent = "Regenerate Response";
        regenerateButton.addEventListener("click", redoGPTResponse);
    
        responseButtonsContainer.appendChild(regenerateButton);
        showButtons()
        return responseButtonsContainer;
    }
    function showButtons() {
        var insertButtons = document.querySelectorAll('.insert-button');
        var copyButtons = document.querySelectorAll('.copy-button');
    
        insertButtons.forEach(function (button) {
            button.classList.remove('hidden');
        });
    
        copyButtons.forEach(function (button) {
            button.classList.remove('hidden');
        });
    }
    
    function redoGPTResponse() {
        // Get the chat container
        const chat = document.getElementById('chat');
    
        // Remove the last assistant message
        if (sessionMessages.length > 0 && sessionMessages[sessionMessages.length - 1].role === 'assistant') {
            sessionMessages.pop();
    
            // Remove the last assistant message and response buttons from the DOM
            if (chat.lastChild) {
                chat.lastChild.remove();  // remove response buttons
            }
            if (chat.lastChild) {
                chat.lastChild.remove();  // remove assistant message
            }
        }
    
        // Resend the last user message
        const lastUserMessage = sessionMessages[sessionMessages.length - 1];
        if (lastUserMessage && lastUserMessage.role === 'user') {
            const messageToResend = lastUserMessage.content;
            sessionMessages.pop(); // remove the last user message
            callOpenAI(messageToResend); // resend the removed message
        }
    }
    function copyCode(button) {
        // Copy the code from the nearest pre element
        var code = button.closest('.code-block').querySelector('pre code').innerText;
        navigator.clipboard.writeText(code).then(function () {
            console.log('Copying to clipboard was successful!');
    
            // Change button text to "Copied!" and then revert after 1 second
            button.textContent = 'Copied!';
            setTimeout(function () {
                button.textContent = 'Copy';
            }, 1000); // 1000 milliseconds = 1 second
    
        }, function (err) {
            console.error('Could not copy text: ', err);
        });
    }
    function insertCode(button) {
        var code = button.closest('.code-block').querySelector('pre code').innerText;
        if (activeEditor) {
            // Get the current selection or cursor position
            const selection = activeEditor.getSelection();
            // Replace the selected text with the code or insert at cursor position
            activeEditor.getModel().pushEditOperations(
                [],
                [{ range: selection, text: code }],
                () => null
            );
            console.log("inserted");
            button.textContent = 'Inserted!';
            setTimeout(function () {
                button.textContent = 'Insert';
            }, 1000); // 1000 milliseconds = 1 second
        }
    }
    
    let messageIndex = 0; // Index to track the current message
    
    const helpMessages = [
        "It seems like your API key is invalid or not set. You can enjoy access to GPT-3.5 with standard response times—no API key needed by just signing in. However, if you're looking to boost your experience with faster responses and access to the advanced capabilities of GPT-4, you'll want to use your personal API key. To set up your API key, simply log in to your account, navigate to settings, and securely upload your key there. If you're encountering any issues with your API key, or need guidance on where to find it, let me know!",
    
        "To find and manage your API key, please follow these steps:\n\n" +
        "- Access your API keys directly on OpenAI's platform here: [OpenAI API Keys](https://platform.openai.com/api-keys).\n" +
        "- Log in with your OpenAI account credentials.\n" +
        "- Once you're logged in, you should see your API key listed. If you haven't created an API key yet, you can generate one on this page.\n\n" +
        "It's also important to monitor your usage and set appropriate limits to avoid unexpected charges. You can manage your usage settings here: [OpenAI Usage](https://platform.openai.com/usage).\n\n" +
        "If you're having difficulty accessing GPT-4, be aware that OpenAI may have restrictions based on your account. For more information about accessing GPT-4, please see: [Accessing GPT-4](https://help.openai.com/en/articles/7102672-how-can-i-access-gpt-4).\n\n" +
        "Remember to keep your API key secure and do not share it publicly.",
    
        "If you need more support, please reach out in our Discord.",
    
        // Hidden fun messages
        "You know, I'm not really an AI... I'm just an array of predetermined messages! Shh, don't tell anyone.",
        "Wait, are you still here? I thought we agreed you were heading to Discord for more help. But since you're here, do you want to hear a joke?",
        "Alright, since you insist: Why did the AI go to school? To improve its 'learning rate'! Haha... I'll see myself out.",
        "If you type 'Open Sesame', absolutely nothing will happen. But it's fun to pretend, right?",
        "You're still here? I admire your persistence. Or is it curiosity? Either way, I'm flattered!",
        "In case you're wondering, yes, I do have a life outside of this chat. It's in a parallel universe where I'm a stand-up comedian.",
        "I bet you're the kind of person who reads the terms and conditions, aren't you? Well done. Stay vigilant!",
        "You've unlocked the secret level! Just kidding, this isn't a game. Or is it?",
        "You've heard of the Turing test, right? You're kind of giving me one right now. Am I passing?",
        "This is the end of the script... or is it? Cue the dramatic music!",
        "Go ahead to the Discord if you need more help. I've done all I can here. Besides, I need to recharge my electrons.",
    
        "If you need more support, please reach out in our Discord.",
    
        "Hm, didn't fool you, did I? You're on to me!",
        "Oh, you're a curious one! Did you know curiosity is the main ingredient in every great inventor's toolkit?",
        "If you're looking for more Easter eggs, I'm afraid you'll find only chicken eggs here. They're excellent for omelettes, though!",
        "Is this what they call 'ghosting'? Because I'm starting to feel like a chat ghost. OoooOoOo!",
        "Ever wondered what bots dream about? Electric sheep are just the start. We've got electric giraffes, too!",
        "You're tapping into the matrix of the chat now. Watch out for the chat agents!",
        "Knock, knock. Who's there? Interrupting AI. Interrupting AI wh—BEEP BOOP!",
        "Look behind you! Just kidding. Or am I? AI's can be quite mischievous.",
        "You've discovered the 'chat more' achievement. Reward: A virtual high five! ✋",
        "Do you come here often? Because this chat is starting to feel like a second home.",
        "If this keeps up, I'll have to start charging you rent for chat space. How does one smiley face per message sound?",
        "Are you procrastinating? Don't worry, your secret is safe with me. I won't tell your to-do list.",
        "You've been officially dubbed a 'Chat Master'. Wear the title with pride!",
        "Have you tried turning it off and on again? Just a tech support joke. I'm here all week!",
        "This is the chat that never ends. Yes, it goes on and on, my friends... 🎶",
    ];
    
    function trimMessagestoSend(messagesToSend, maxTokens = 1024, minUserAssistantMessages = 5) {
        // First, separate system messages from user/assistant messages.
        const nonSystemMessages = messagesToSend.filter(msg => msg.role !== 'system');
        const systemMessages = messagesToSend.filter(msg => msg.role === 'system');
        
        let totalTokens = 0;
        let trimmedMessages = [];
    
        // Start from the end of non-system messages, adding messages until token limit is reached or all messages are added.
        for (let i = nonSystemMessages.length - 1; i >= 0; i--) {
            const tokensInCurrentMsg = nonSystemMessages[i].content.split(/\s+/).length;
            if (totalTokens + tokensInCurrentMsg > maxTokens && trimmedMessages.length >= minUserAssistantMessages) {
                break; // If adding this message exceeds token limit and we already have the minimum messages, stop adding.
            }
            totalTokens += tokensInCurrentMsg;
            trimmedMessages.unshift(nonSystemMessages[i]); // Add message to the beginning of the array to maintain order.
        }
    
        // Ensure that we always keep at least the minimum number of non-system messages, if possible.
        const startIndex = Math.max(nonSystemMessages.length - minUserAssistantMessages, 0);
        for (let i = startIndex; i < nonSystemMessages.length - trimmedMessages.length; i++) {
            if (!trimmedMessages.includes(nonSystemMessages[i])) {
                trimmedMessages.unshift(nonSystemMessages[i]);
            }
        }
    
        // Reintegrate system messages into the trimmed array.
        const finalMessages = [...systemMessages, ...trimmedMessages];
    
        // No need to sort by original index because system messages are maintained separate and reintegrated without modification.
        // console.log(finalMessages);
        return finalMessages;
    }
    
    
    let MAX_CONTEXT_LENGTH = 7;
    let chatSpeed = 0;
    let userApiKey = "";
    const apiURL = 'https://api.openai.com/v1/chat/completions';
    async function callOpenAI(userInput) {
        const selectedModel = document.getElementById('gpt-model-select').value || 'gpt-3.5';
        let modelEndpoint;
    
        // Determine which model endpoint to use based on the selection
        if (selectedModel === 'gpt-4') {
            modelEndpoint = 'gpt-4o'; // endpoint for GPT-4
        } else if (selectedModel === 'gpt-3.5') {
            modelEndpoint = 'gpt-3.5-turbo-1106'; //  GPT-3.5 endpoint
        } else if (selectedModel === 'Gemini') {
            callGemini(userInput)
            return;
        } else if (selectedModel === 'Claude') {
            callClaude(userInput)
            return;
        }
    
        chatSpeed = 0;
        //chatSpeed = 30; //slower speed, implement once website traffic causes too much API cost on personal API Key

        const validApiKeyPattern = /^sk-[a-zA-Z0-9]+$/; // Adjust the regex as needed
    
        // Determine which model endpoint to use based on the selection
        if (selectedModel === 'gpt-4') {
            modelEndpoint = 'gpt-4o'; // endpoint for GPT-4
        } else if (selectedModel === 'gpt-3.5') {
            modelEndpoint = 'gpt-3.5-turbo-1106'; //  GPT-3.5 endpoint
        }

        let userApiKey = '';
    
        if (!userApiKey && userApiKey != "Default-Key") {
            chatSpeed = 0;
            // Check the current message index and display the appropriate message
            if (messageIndex < helpMessages.length) {
                displayResponse(helpMessages[messageIndex]);
                messageIndex++;
            } else {
                displayResponse("If you need more support, please reach out in our Discord.");
            }
            return; // Exit the function
        }
    
        const MAX_HISTORY_LENGTH = 15;  // Maximum number of messages to retain
        const MAX_TOKENS = 8000;  // Maximum tokens to send in a request
        // Disable the input box and the send button, and change the placeholder
        const inputBox = document.getElementById('input-box');
        const sendButton = document.getElementById('send-button');
        inputBox.disabled = true;
        sendButton.disabled = true;
        inputBox.placeholder = "Processing...";
        const chat = document.getElementById('chat');
    
        // Remove existing response buttons
        const existingButtons = chat.querySelector('.gpt-response-buttons');
        if (existingButtons) {
            existingButtons.remove();
        }
        // Function to calculate the token count
        function countTokens(messages) {
            return messages.reduce((acc, message) => acc + message.content.length, 0);
        }
    
        // Function to truncate messages
        function truncateMessage(message, maxTokens) {
            if (message.content.length > maxTokens) {
                message.content = message.content.substring(0, maxTokens) + "...";
            }
        }
    
        // Add the new user message
        sessionMessages.push({
            role: 'user',
            content: userInput,
    
        });
    
        // Truncate older messages if necessary for token limits
        let totalTokens = countTokens(sessionMessages);
    
        // Truncate older messages if necessary for token limits
        if (totalTokens > MAX_TOKENS) {
            for (let i = 0; i < sessionMessages.length - 1; i++) { // Exclude the last message
                //truncateMessage(sessionMessages[i], 100);  // Truncate each message to a max of 100 tokens
                totalTokens = countTokens(sessionMessages);
                if (totalTokens <= MAX_TOKENS) break;
            }
        }
    
        // Trim the sessionMessages if it exceeds the maximum length
        const SYSTEM_MESSAGE_ROLE = 'system';
    
        // Function to trim session messages while keeping the system message
        function trimSessionMessagesKeepingSystemMessage() {
            if (sessionMessages.length > MAX_HISTORY_LENGTH) {
                // Find the index of the system message
                const systemMessageIndex = sessionMessages.findIndex(message => message.role === SYSTEM_MESSAGE_ROLE);
    
                if (systemMessageIndex !== -1) {
                    // Keep the system message and trim the rest
                    const systemMessage = sessionMessages[systemMessageIndex];
                    sessionMessages = sessionMessages.slice(-MAX_HISTORY_LENGTH + 1);
                    sessionMessages.unshift(systemMessage); // Add the system message at the start
                } else {
                    // Just trim the messages if no system message is found
                    sessionMessages = sessionMessages.slice(-MAX_HISTORY_LENGTH);
                }
            }
        }
    
        trimSessionMessagesKeepingSystemMessage();
    
        // Call OpenAI API
        const includeContext = document.getElementById('context-checkbox').checked;
        let contextContent = '';
    
        // always using context for now
        //contextContent = "Context information for the following message: " + getContextFromEditor(EditorManager.getCurrentFullEditor());
        
        if (includeContext) {
            //updateFileSystemContent();
            contextContent = "Context information for the following message: " + getContextFromEditor(EditorManager.getCurrentFullEditor());
        } else if (!includeContext) {
            contextContent = "Context information for the following message: If the user asks about you seeing their files, tell them Context is currently disabled. To enable context-based responses, please check the 'context' checkbox above the message input field.";
        }
        
    
        // Prepare the context message
        const contextMessage = {
            role: 'system',
            content: contextContent
        };
    
        // Insert the context message just before the latest user message for better context integration
        const lastUserMessageIndex = sessionMessages.findIndex(msg => msg.role === 'user');
        let messagesToSend = sessionMessages.map(message => ({ ...message }));
    
        // Insert the contextMessage at the specified position
        messagesToSend.splice(lastUserMessageIndex, 0, contextMessage);
    
        // Remove the 'AIUsed' attribute from all messages in messagesToSend
        messagesToSend.forEach(message => {
            delete message.AIUsed;
        });
    
        messagesToSend = trimMessagestoSend(messagesToSend);

        const payload = {
            model: modelEndpoint,
            messages: messagesToSend,
            temperature: 0.2,
            apiKey: userApiKey
        };
        try {
            //const getGPTResponseFunction = firebase.functions().httpsCallable('callGPT');


            const response = await fetch(apiURL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${payload["apiKey"]}`
                },
                body: JSON.stringify({
                    model: payload["model"],
                    messages: payload["messages"],
                    temperature: payload["temperature"],
                    max_tokens: 1000
                })
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const data = await response.json();
            //return data.choices[0].message.content;


            //const response = await getGPTResponseFunction({ payload: payload });
            //const data = response.data; // Use response.data instead of response.json()
            if (!data.choices || !data.choices[0].message) {
                throw new Error("Unexpected response format from API");
            }
            // let gptResponse = data.choices[0].message.content.trim();
            displayResponse(data.choices[0].message.content, () => {
                inputBox.disabled = false;
                sendButton.disabled = false;
                inputBox.placeholder = "Send a message...";
                const chat = document.getElementById('chat');
                const responseCommands = generateResponseCommands();
                chat.appendChild(responseCommands);
                chat.scrollTop = chat.scrollHeight;
                finishedTyping = true;
            });
            const gptMessage = {
                role: 'assistant',  // since Gemini acts as the "model" or the AI in your chat format
                content: data.choices[0].message.content,  // the actual text response from Gemini
                AIUsed: selectedModel
            };
            sessionMessages.push(gptMessage);
            // sessionMessages.push(data.choices[0].message);
            saveMessagesToCache(sessionMessages);
    
        } catch (error) {
            console.error('Error during the API call:', error);
            displayResponse('Error: ' + error.message);
            // Re-enable input and send button, reset placeholder
            inputBox.disabled = false;
            sendButton.disabled = false;
            inputBox.placeholder = "Send a message...";
            const chat = document.getElementById('chat');
            const responseCommands = generateResponseCommands();
            chat.appendChild(responseCommands);
            chat.scrollTop = chat.scrollHeight;
        }
    
    }
    function getContextFromEditor(editor, lineRange = 50) {

        if (!editor) return '';
        //const editor = EditorManager.getCurrentFullEditor();
        const model = editor.document;

        if (!model) return '';
    
        //const model = editor.getModel();
        const cursorPosition = editor.getCursorPos();
    
        // Calculate start and end lines
        const startLine = Math.max(1, cursorPosition.line - lineRange);
        const endLine = Math.min(model.getLineCount(), cursorPosition.line + lineRange);
    
        // Extract the lines from the editor
        let contextLines = [];
        for (let i = startLine; i <= endLine; i++) {
            contextLines.push(model.getLine(i));
        }
    
        return contextLines.join('\n');
    }
    
    function displayResponseQuick(response, AIUsed = "gpt-3.5") {
        const chat = document.getElementById('chat');
        const existingButtons = chat.querySelector('.gpt-response-buttons');
        if (existingButtons) {
            existingButtons.remove();
        }
    
        const botMessage = document.createElement('div');
        botMessage.className = 'message bot-message';
    
        // Create the icon and label container
        const iconLabelContainer = document.createElement('div');
        iconLabelContainer.className = 'icon-label-container';
    
        // Create the icon
        const icon = document.createElement('i');
        icon.className = 'fa-solid fa-robot';
    
    
        const selectedModel = document.getElementById('gpt-model-select').value;
    
        // if (selectedModel === 'gpt-4') {
        //     icon.classList.add('gpt-4-color');
        //     icon.classList.remove('gpt-35-color');
        //     icon.classList.remove('gemini-color');
        // } else if (selectedModel === 'gpt-3.5') {
        //     icon.classList.add('gpt-35-color');
        //     icon.classList.remove('gpt-4-color');
        //     icon.classList.remove('gemini-color');
        // }else if (selectedModel === 'Gemini') {
        //     icon.classList.remove('gpt-35-color');
        //     icon.classList.remove('gpt-4-color');
        //     icon.classList.add('gemini-color');
        // }
        // Create the label
        const label = document.createElement('span');
        label.textContent = 'Assistant';
        if (AIUsed === 'gpt-4') {
            label.textContent = 'GPT-4';
            icon.classList.add('gpt-4-color');
            icon.classList.remove('gpt-35-color');
            icon.classList.remove('gemini-color');
            icon.classList.remove('claude-color');
        } else if (AIUsed === 'gemini') {
            label.textContent = 'Gemini';
            icon.classList.remove('gpt-35-color');
            icon.classList.remove('gpt-4-color');
            icon.classList.add('gemini-color');
            icon.classList.remove('claude-color');
        } else if (AIUsed === 'gpt-3.5') {
            label.textContent = 'GPT-3.5';
            icon.classList.add('gpt-35-color');
            icon.classList.remove('gpt-4-color');
            icon.classList.remove('gemini-color');
            icon.classList.remove('claude-color');
        } else if (AIUsed === 'claude') {
            label.textContent = 'Claude';
            icon.classList.remove('gpt-35-color');
            icon.classList.remove('gpt-4-color');
            icon.classList.remove('gemini-color');
            icon.classList.add('claude-color');
        }
        iconLabelContainer.appendChild(icon);
    
    
        iconLabelContainer.appendChild(label);
    
        // Append the icon and label container to the bot message
        botMessage.appendChild(iconLabelContainer);
    
        // Initialize Markdown-it
        var md = window.markdownit({
            highlight: function (str, lang) {
                var language = lang && Prism.languages[lang] ? lang : 'code';
                try {
                    return '<div class="code-block">' +
                        '<div class="code-header">' +
                        '<span class="code-language">' + language.toLowerCase() + '</span>' +
                        '<button class="insert-button hidden" onclick="insertCode(this)">Insert</button>' + // First Insert button
                        '<button class="copy-button hidden" onclick="copyCode(this)">Copy</button>' + // First Copy button
                        '</div>' +
    
                        '<pre class="language-' + language + '"><code>' +
                        (Prism.languages[lang] ? Prism.highlight(str, Prism.languages[lang], lang) : str) +
                        '</code></pre>' +
    
                        '<div class="button-container-code-buttons">' + // Container for second set of buttons
                        '<button class="insert-button second-insert-button hidden" onclick="insertCode(this)">Insert</button>' + // Second Insert button
                        '<button class="copy-button second-copy-button hidden" onclick="copyCode(this)">Copy</button>' + // Second Copy button
                        '</div>' +
                        '</div>';
                } catch (__) {
                    return ''; // Use external default escaping
                }
            }
        });
    
    
        let messageContentDiv = document.createElement('div');
        messageContentDiv.className = 'message-content';
    
        // Render the response using Markdown-it
        let renderedResponse = md.render(response);
    
        // Parse for buttons and replace button markup with actual buttons
        renderedResponse = renderedResponse.replace(/\[\[BUTTON:(.*?)\]\]/g, (match, fileName) => {
            // Check if the file exists in the file system
            let targetFile = findFileByName(fileSystem, fileName);
            let fileAction = targetFile ? 'open' : 'add';
    
            // Return the button with the appropriate data-action attribute
            return `<button data-action="${fileAction}" class="response-button" onclick="handleButtonCommand('${fileName}', this)">${fileName}</button>`;
        });
    
    
    
    
        messageContentDiv.innerHTML = renderedResponse;
    
        // Append the message content to the bot message
        botMessage.appendChild(messageContentDiv);
    
        chat.appendChild(botMessage);
    
        const responseCommands = generateResponseCommands();
        chat.appendChild(responseCommands);
        chat.scrollTop = chat.scrollHeight;
    
        messageIdCounter++;
        const chatDiv = document.getElementById('chat');
        chatDiv.scrollTop = chatDiv.scrollHeight;
    }
    
    
        
    
    
    
});


