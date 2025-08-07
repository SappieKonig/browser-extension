// Service worker for handling credential interception and storage

console.log('Service worker loaded');

// Listen for messages from content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === 'credentials') {
    handleCredentialData(message.payload);
    sendResponse({ success: true });
  }
  return true;
});

async function handleCredentialData(payload) {
  try {
    console.log('Received credential data:', {
      url: payload.url,
      timestamp: payload.timestamp,
      credentialCount: payload.credentials?.length || 0,
      hasFullResponse: !!payload.fullResponse
    });

    // Store the raw credential data - overwrite any existing data
    const credentialData = {
      timestamp: payload.timestamp,
      url: payload.url,
      rawResponse: payload.fullResponse, // Store the complete raw response
      domain: extractDomain(payload.url),
      credentialCount: payload.credentials?.length || 0
    };

    // Simply overwrite the stored credentials
    await chrome.storage.local.set({ n8nCredentials: credentialData });
    
    console.log(`Stored ${credentialData.credentialCount} credentials from ${credentialData.domain}`);
    
    // Notify about successful capture
    showNotification('n8n credentials updated', `Found ${credentialData.credentialCount} credentials`);
    
  } catch (error) {
    console.error('Failed to handle credential data:', error);
  }
}

function extractCredentialIds(rawResponse) {
  // Simple function to extract IDs for display purposes
  try {
    if (rawResponse && rawResponse.data && Array.isArray(rawResponse.data)) {
      return rawResponse.data.map(cred => ({
        id: cred.id,
        name: cred.name,
        type: cred.type
      }));
    }
  } catch (error) {
    console.warn('Failed to extract credential IDs:', error);
  }
  return [];
}

function extractDomain(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return 'unknown';
  }
}

function generateId() {
  return 'cred_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

async function showNotification(title, message) {
  try {
    // Check if we have notification permission
    if ('Notification' in self && self.Notification.permission === 'granted') {
      self.registration.showNotification(title, {
        body: message,
        icon: 'icons/icon48.png',
        tag: 'n8n-credentials',
        requireInteraction: false
      });
    }
  } catch (error) {
    console.warn('Failed to show notification:', error);
  }
}

// API to retrieve stored credentials
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'getCredentials') {
    chrome.storage.local.get({ n8nCredentials: null }).then(result => {
      sendResponse({ credentials: result.n8nCredentials });
    });
    return true; // Will respond asynchronously
  }
  
  if (message?.type === 'clearCredentials') {
    chrome.storage.local.set({ n8nCredentials: null }).then(() => {
      sendResponse({ success: true });
    });
    return true; // Will respond asynchronously
  }
});