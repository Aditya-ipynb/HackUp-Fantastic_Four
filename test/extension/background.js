/**
 * ─── PHISHGUARD.AI — BACKGROUND SERVICE WORKER ───
 * Handles side panel lifecycle, message relay, and email detection bridging.
 */

// ─── OPEN SIDE PANEL WHEN TOOLBAR ICON IS CLICKED ───
chrome.action.onClicked.addListener((tab) => {
    chrome.sidePanel.open({ tabId: tab.id });
});

// ─── ENABLE SIDE PANEL ON GMAIL TABS AUTOMATICALLY ───
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
    if (tab.url && tab.url.includes('mail.google.com')) {
        chrome.sidePanel.setOptions({
            tabId,
            path: 'popup.html',
            enabled: true
        });
    }
});

// ─── RELAY EMAIL_OPENED FROM CONTENT SCRIPT → SIDE PANEL ───
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === "EMAIL_OPENED") {
        console.log("📨 [Background] Email opened, ID:", message.emailId);

        // Cache the email ID so the side panel can pick it up even if not open yet
        chrome.storage.local.set({ pendingEmailId: message.emailId });

        // Auto-open the side panel on the Gmail tab
        if (sender.tab && sender.tab.id) {
            chrome.sidePanel.open({ tabId: sender.tab.id });
        }

        // Relay the message to the side panel if it's already open
        // (catch silently — it's fine if panel isn't open yet, storage handles it)
        chrome.runtime.sendMessage(message).catch(() => {});
    }
});