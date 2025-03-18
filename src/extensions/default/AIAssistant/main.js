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
        AppInit            = brackets.getModule("utils/AppInit"),
        EditorManager      = brackets.getModule("editor/EditorManager");

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
        
        $iframe = $panel.find("#AIAssistant-frame");
        $iframe[0].onload = function () {
            $iframe.attr('srcdoc', null);
        };
        $iframe.attr('src', "extensions/default/AIAssistant/html/index.html");
        
        let minSize = window.innerWidth/3;

        panel = WorkspaceManager.createPluginPanel("AIAssistant-panel", $panel, minSize, $icon);

        WorkspaceManager.recomputeLayout(false);
    }

    AppInit.appReady(function () {
        if(!FeatureGate.isFeatureEnabled(FEATURE_AI_ASSISTANT)){
            return;
        }
        _createExtensionPanel();
        //_createAssistant(null, 'chat-container', 'AIAssistant');
    });

    window.addEventListener('message', function(event) {
        // Security check
        if (!parent.Phoenix.TRUSTED_ORIGINS[event.origin]) {
            console.warn('Received message from untrusted origin:', event.origin);
            return;
        }
    
        const message = event.data; // {handlerName: 'ph-liveServer', eventName: 'GET_CONTENT', message: {…}}
        if (message.handlerName === 'ai-assistant-host') {
            if (message.eventName == "ECHO") {
                alert(message.message);
            } else if (message.eventName == "GET_CONTEXT") {
                const lineRange = 10;
                const editor = EditorManager.getCurrentFullEditor();
                let context = '';
                if (editor) {
                    const doc = editor.document;                
                    if (doc) {               
                        const cursorPosition = editor.getCursorPos();                    
                        const begin = Math.max(1, cursorPosition.line - lineRange);
                        const end = Math.min(doc.getLineCount(), cursorPosition.line + lineRange);                    
                        for (i = begin; i <= end; i++) {
                            context += doc.getLine(i) + '\n';
                        }
                    }
                }
                $iframe[0].contentWindow.postMessage({handlerName: 'ai-assistant', eventName: 'CONTEXT', message: context}, '*');
            }      
        }
    });      
    
});

           


