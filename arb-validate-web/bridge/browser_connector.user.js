// ==UserScript==
// @name         Trae Bridge Connector
// @namespace    http://tampermonkey.net/
// @version      1.2
// @description  Expose ChatGPT state to Trae via Window Title (Robust Version with Observer)
// @author       Trae
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    // The keyword our PowerShell script looks for.
    const TARGET_TITLE_KEYWORD = "套利项目开发"; 

    function updateState() {
        let state = "IDLE";
        
        // 1. Check if generating (Stop button exists)
        // ChatGPT typically uses specific test-ids or aria-labels for the stop button
        const stopButton = document.querySelector('button[aria-label="Stop generating"]');
        const stopButton2 = document.querySelector('button[data-testid="stop-button"]');
        
        if (stopButton || stopButton2) {
            state = "BUSY";
        } else {
            // 2. Check if user is typing (Drafting)
            const promptTextarea = document.querySelector('#prompt-textarea');
            if (promptTextarea && promptTextarea.textContent.trim().length > 0) {
                // Check if it's just the previous result (heuristic?)
                // For safety, if there is text, we assume user is using it, UNLESS it looks like our automation payload
                // (Automation payload starts with "RESULT_READY")
                if (!promptTextarea.textContent.startsWith("RESULT_READY")) {
                     state = "DRAFT";
                }
            }
        }

        let prefix = "";
        switch (state) {
            case "BUSY":
                prefix = "[BUSY] ";
                break;
            case "DRAFT":
                prefix = "[DRAFT] ";
                break;
            case "IDLE":
                prefix = "[IDLE] ";
                break;
        }

        // Remove existing prefix (both old emoji style and new text style)
        let currentTitle = document.title.replace(/^\[.*?\]\s*/, "");
        
        // Ensure keyword exists for discovery
        if (currentTitle.indexOf("套利项目开发") === -1) {
            currentTitle += " - 套利项目开发";
        }

        const desiredTitle = prefix + currentTitle;
        
        if (document.title !== desiredTitle) {
                document.title = desiredTitle;
                // console.log("Updated title to:", desiredTitle);
            }
        }

        // Auto-focus input when window gains focus
        window.addEventListener('focus', () => {
            const promptTextarea = document.querySelector('#prompt-textarea');
            if (promptTextarea) {
                promptTextarea.focus();
                // console.log("Window focused, auto-focusing input");
            }
        });

        // Add Shortcut Listener: Alt + Shift + X to Force Focus (Changed from I to X to avoid Edge Feedback shortcut)
        document.addEventListener('keydown', (e) => {
            if (e.altKey && e.shiftKey && (e.code === 'KeyX' || e.key === 'X' || e.key === 'x')) {
                const promptTextarea = document.querySelector('#prompt-textarea');
                if (promptTextarea) {
                    promptTextarea.focus();
                    // console.log("Shortcut Alt+Shift+X triggered focus");
                }
            }
        });

        // Check every 500ms to override ChatGPT's SPA title changes
        setInterval(updateState, 500);

    // Also run immediately
    updateState();
    
    // Add MutationObserver to react faster to DOM changes
    const observer = new MutationObserver(() => {
        updateState();
    });
    observer.observe(document.body, { childList: true, subtree: true });

})();
