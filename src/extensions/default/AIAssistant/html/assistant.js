var hoster = window.parent;
           
let currentTypingInterval = null;

class ChatUI {
    constructor() {
        this.chatMessages = document.getElementById('chatMessages');
        this.userInput = document.getElementById('userInput');
        this.sendButton = document.getElementById('sendButton');
        this.includeContext = document.getElementById('includeContext');
        // 1 token ~ 1 word
        this.MAX_TOKENS = 4000;

        // an array of messages (both user and AI)
        // will send the last n - maxTokens of the user messages as additional context to the AI
        this.messagesHistory = []

        // setting up the default system message (always going to be the first message sent to the API)
        this.framingMessage = {
            role: "system",
            content: "You are an AI programming assistant. Provide clear, concise responses. When sharing code, use markdown code blocks with appropriate language tags."
        };
        
        this.sendButton.addEventListener('click', () => this.handleSend());
        this.userInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleSend();
            }
        });


    }

    async handleSend() {
        const prompt = this.userInput.value.trim();
        if (!prompt) return;

        // Add user message
        this.addMessage(prompt, 'user');
        this.userInput.value = '';

        // Get context if checkbox is checked
        if (this.includeContext.checked) {
            // Create a promise that resolves when we get the context
            const contextPromise = new Promise((resolve) => {
                const messageHandler = (event) => {
                    // Security check
                    if (!parent.Phoenix.TRUSTED_ORIGINS[event.origin]) {
                        console.warn('Received message from untrusted origin:', event.origin);
                        return;
                    }

                    const message = event.data;
                    if (message.handlerName === 'ai-assistant' && message.eventName === 'CONTEXT') {
                        // Remove the listener once we get the context
                        window.removeEventListener('message', messageHandler);
                        window.editorContext = message.message;
                        resolve();
                    }
                };

                // Add temporary message listener
                window.addEventListener('message', messageHandler);

                // Request context from parent
                window.parent.postMessage({
                    handlerName: 'ai-assistant-host',
                    eventName: 'GET_CONTEXT',
                    message: null
                }, '*');
            });

            // Wait for context before proceeding
            await contextPromise;
        }

        // Query OpenAI with context
        const context = this.includeContext.checked ? window.editorContext || '' : null;        
        
        // Query OpenAI
        let messagesToSend = this.composeMessages(context, this.MAX_TOKENS);
        const response = await queryOpenAI(messagesToSend);//prompt, context);
        
        // Add AI response with typing effect
        this.addMessage(response, 'assistant', true);
    }

    addMessage(content, role, withTyping = false) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${role}-message`;

        this.messagesHistory.push({role: role, content: content});
        
        if (withTyping) {
            this.typeWriter(messageDiv, this.processCodeBlocks(content));
        } else {
            messageDiv.innerHTML = this.processCodeBlocks(content);
        }

        this.chatMessages.appendChild(messageDiv);
        this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
    }

    processCodeBlocks(content) {
        // Simple regex to detect code blocks (```language code ```)
        const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
        return content.replace(codeBlockRegex, (match, language, code) => {
            const highlightedCode = hljs.highlight(code, { language: language || 'plaintext' }).value;
            return `
                <div class="code-block">
                    <div class="code-actions">
                        <button onclick="copyCode(this)">Copy</button>
                        <button onclick="insertCode(this)">Insert</button>
                    </div>
                    <pre><code class="hljs ${language || ''}">${highlightedCode}</code></pre>
                </div>
            `;
        });
    }

    typeWriter(element, text, index = 0) {
        let speed = 16;
        if (currentTypingInterval) {
            clearInterval(currentTypingInterval);
        }
    
        // Create a temporary div to handle HTML unescaping
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = text;
        const unescapedText = tempDiv.innerHTML;
        
        currentTypingInterval = setInterval(() => {
            if (index < unescapedText.length) {
                // Append character and maintain HTML structure
                element.innerHTML = unescapedText.substring(0, index + 1);
                index++;
                element.scrollIntoView({ behavior: 'smooth', block: 'end' });
            } else {
                clearInterval(currentTypingInterval);
            }
        }, speed);
    }

    // assembles messages in the following order, from earliest index (0) to last index (n):
    // 0: system message, overall instruction ("you are a code assistant" etc...)
    // 1: first user prompt
    // 2: first AI response
    // ...
    // n - 1: context from editor (if provided)
    // n: latest user prompt
    //
    // when composing, start with the latest user prompt and go back n messages, where n is the max tokens allowed
    composeMessages(context) {
        let messagesToSend = [];
        let remainingTokens = this.MAX_TOKENS;

        // push the latest user prompt
        let messagePacket = this.clampMessage(this.messagesHistory.at(-1), remainingTokens); 
        messagesToSend.push(messagePacket.message);
        remainingTokens = messagePacket.remainingTokens;

        // push the first framing system message, this will be shifted to the beginning of the array at the end
        messagePacket = this.clampMessage(this.framingMessage, remainingTokens);
        messagesToSend.push(messagePacket.message);
        remainingTokens = messagePacket.remainingTokens;

        if (remainingTokens > 0 && context != null) {
            // add the context if provided
            context = `Here's the relevant code context:\n${context}`;

            messagePacket = this.clampMessage({role: "system", content: context}, remainingTokens);

            messagesToSend.unshift(messagePacket.message);
            remainingTokens = messagePacket.remainingTokens;
        }

        // now iterate backwards through the chat history and add to the messagesToSend array while there are remaining tokens
        let i = this.messagesHistory.length - 2; // start at the second to last message
        while (remainingTokens > 0 && i >= 0 ) {
            messagePacket = this.clampMessage(this.messagesHistory.at(i), remainingTokens); 
            messagesToSend.unshift(messagePacket.message);
            remainingTokens = messagePacket.remainingTokens;
            i--;
        }

        // Move system message to beginning of array
        const systemMessage = messagesToSend.pop();     // Remove from end
        messagesToSend.unshift(systemMessage);          // Add to beginning  
        
        return messagesToSend;
    }

    // takes in a message and clamps it to the max tokens permitted, returns the clamped message and remaining tokens
    clampMessage(message, remainingTokens) {
        // TODO: tokens are characters at the moment, change to words later
        let messageClone = { ...message };
        let tokensToClamp = Math.min(remainingTokens, messageClone.content.length);
        messageClone.content = messageClone.content.substring(0, tokensToClamp);
        if (tokensToClamp <= messageClone.content.length) {
            messageClone.content += "...";
        }
        return {message: messageClone, remainingTokens: remainingTokens - tokensToClamp};
    }
}

// Utility functions
function copyCode(button) {
    const codeBlock = button.parentElement.parentElement.querySelector('code');
    const text = codeBlock.textContent;
    navigator.clipboard.writeText(text);
    
    // Show feedback
    const originalText = button.textContent;
    button.textContent = 'Copied!';
    setTimeout(() => button.textContent = originalText, 2000);
}

function insertCode(button) {
    const codeBlock = button.parentElement.parentElement.querySelector('code');
    const code = codeBlock.textContent;
    // This function would need to be implemented by the external editor
    if (window.insertToEditor) {
        window.insertToEditor(code);
    }
}

//const API_URL = 'https://api.openai.com/v1/chat/completions';
const API_URL = 'https://codestore-348206.ts.r.appspot.com/openai/chat';

async function queryOpenAI(messages) { //prompt, context = '') {
    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                // using the restricted test school ID for now, replace with actual school issued id later
                school: "school_test",
                messages: messages
            })
       });
    
        const data = await response.json();
        if (data.status === 200) {
            console.log('AI Response:', data.response);
            return data.response;
        } else {
            throw new Error(data.response);
        }

    } catch (error) {
        console.error('Error querying OpenAI:', error);
        return `Error: ${error.message}. Please try again or check your API key.`;
    }
}

// Initialize the chat UI
const chat = new ChatUI();

// Mock editor context (replace with actual implementation)
window.editorContext = ''; 