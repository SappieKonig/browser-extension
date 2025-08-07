document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded');
  const toggleButton = document.getElementById('toggleButton');
  const status = document.getElementById('status');
  const currentDomain = document.getElementById('currentDomain');
  const authTokenInput = document.getElementById('authToken');
  const apiKeyInput = document.getElementById('apiKey');
  const saveConfigButton = document.getElementById('saveConfig');

  if (!toggleButton || !status || !currentDomain || !authTokenInput || !apiKeyInput || !saveConfigButton) {
    console.error('Could not find required elements');
    return;
  }

  // Load saved configuration
  chrome.storage.local.get(['authToken', 'apiKey'], (result) => {
    if (result.authToken) {
      authTokenInput.value = result.authToken;
    }
    if (result.apiKey) {
      apiKeyInput.value = result.apiKey;
    }
  });

  // Save configuration
  saveConfigButton.addEventListener('click', () => {
    const authToken = authTokenInput.value.trim();
    const apiKey = apiKeyInput.value.trim();
    
    if (!authToken) {
      status.textContent = 'Please enter your service auth token';
      return;
    }
    
    if (!apiKey) {
      status.textContent = 'Please enter your n8n API key';
      return;
    }
    
    chrome.storage.local.set({ authToken, apiKey }, () => {
      status.textContent = 'Configuration saved';
      setTimeout(() => {
        status.textContent = 'Ready';
      }, 2000);
    });
  });

  // Get current tab info first
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    if (tabs.length === 0) {
      status.textContent = 'Error: No active tab';
      return;
    }

    const tab = tabs[0];
    let domain;
    
    try {
      domain = new URL(tab.url).hostname;
      currentDomain.textContent = domain;
    } catch (error) {
      domain = 'unknown';
      currentDomain.textContent = 'Invalid URL';
    }

    // Check if we're on a restricted page
    if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
        tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
      status.textContent = 'Not available on this page';
      toggleButton.disabled = true;
      return;
    }

    // Get domain-specific state
    chrome.storage.local.get(['domainStates'], (result) => {
      console.log('Storage result:', result);
      const domainStates = result.domainStates || {};
      const isEnabled = domainStates[domain] || false;
      
      if (isEnabled) {
        status.textContent = 'Chat box is enabled';
        toggleButton.textContent = 'Disable Chat Box';
      } else {
        status.textContent = 'Chat box is disabled';
        toggleButton.textContent = 'Enable Chat Box';
      }
    });
  });

  toggleButton.addEventListener('click', () => {
    console.log('Toggle button clicked');
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      console.log('Active tabs:', tabs);
      if (tabs.length === 0) {
        console.error('No active tabs found');
        status.textContent = 'Error: No active tab';
        return;
      }

      const tab = tabs[0];
      let domain;
      
      try {
        domain = new URL(tab.url).hostname;
      } catch (error) {
        status.textContent = 'Error: Invalid URL';
        return;
      }
      
      // Check if we're on a restricted page
      if (tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://') || 
          tab.url.startsWith('about:') || tab.url.startsWith('moz-extension://')) {
        status.textContent = 'Not available on this page';
        return;
      }

      // First try to send message
      chrome.tabs.sendMessage(tab.id, {action: 'toggleChatBox', domain: domain}, (response) => {
        if (chrome.runtime.lastError) {
          console.log('Content script not found, injecting...');
          // Content script not running, inject it
          chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['config.js', 'content.js']
          }, () => {
            if (chrome.runtime.lastError) {
              console.error('Injection error:', chrome.runtime.lastError);
              status.textContent = 'Error: Cannot inject on this page';
              return;
            }
            
            // Also inject CSS
            chrome.scripting.insertCSS({
              target: { tabId: tab.id },
              files: ['chat-styles.css']
            }, () => {
              // Wait a bit for script to load then send message
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, {action: 'toggleChatBox', domain: domain}, (response) => {
                  if (chrome.runtime.lastError) {
                    console.error('Message sending error after injection:', chrome.runtime.lastError);
                    status.textContent = 'Error: ' + chrome.runtime.lastError.message;
                    return;
                  }
                  updateButtonState(domain);
                });
              }, 100);
            });
          });
        } else {
          console.log('Message sent successfully');
          updateButtonState(domain);
        }
      });
    });
  });

  function updateButtonState(domain) {
    setTimeout(() => {
      chrome.storage.local.get(['domainStates'], (result) => {
        console.log('Updated storage:', result);
        const domainStates = result.domainStates || {};
        const isEnabled = domainStates[domain] || false;
        
        if (isEnabled) {
          status.textContent = 'Chat box is enabled';
          toggleButton.textContent = 'Disable Chat Box';
        } else {
          status.textContent = 'Chat box is disabled';
          toggleButton.textContent = 'Enable Chat Box';
        }
      });
    }, 100);
  }
  
  // Credentials functionality
  const credentialsToggle = document.getElementById('credentialsToggle');
  const credentialsView = document.getElementById('credentialsView');
  const credentialsList = document.getElementById('credentialsList');
  const clearCredentials = document.getElementById('clearCredentials');

  credentialsToggle.addEventListener('click', () => {
    const isVisible = credentialsView.style.display !== 'none';
    credentialsView.style.display = isVisible ? 'none' : 'block';
    
    if (!isVisible) {
      // Load and display credentials
      loadCredentials();
    }
  });

  clearCredentials.addEventListener('click', () => {
    if (confirm('Are you sure you want to clear captured credentials?')) {
      chrome.runtime.sendMessage({ type: 'clearCredentials' }, (response) => {
        if (response.success) {
          credentialsList.innerHTML = '<div style="color: #666; text-align: center;">No credentials captured yet</div>';
          status.textContent = 'Credentials cleared';
          setTimeout(() => {
            status.textContent = 'Ready';
          }, 2000);
        }
      });
    }
  });

  function loadCredentials() {
    chrome.runtime.sendMessage({ type: 'getCredentials' }, (response) => {
      const credentials = response.credentials;
      displayCredentials(credentials);
    });
  }

  function displayCredentials(credentials) {
    if (!credentials) {
      credentialsList.innerHTML = '<div style="color: #666; text-align: center;">No credentials captured yet</div>';
      return;
    }

    const date = new Date(credentials.timestamp).toLocaleString();
    const credCount = credentials.credentialCount;
    const domain = credentials.domain;
    
    // Extract credential info for display (ID, name, type only)
    let credentialsHtml = '';
    try {
      if (credentials.rawResponse && credentials.rawResponse.data) {
        credentialsHtml = credentials.rawResponse.data.map(cred => 
          `<div style="margin-left: 10px; margin-bottom: 4px; padding: 4px; background: #fff; border-radius: 2px; border-left: 3px solid #4285f4;">
            <strong>${cred.name}</strong> (${cred.type})<br>
            <span style="color: #666;">ID: ${cred.id}</span>
          </div>`
        ).join('');
      }
    } catch (error) {
      credentialsHtml = '<div style="color: #999; font-style: italic;">Could not parse credentials</div>';
    }

    const html = `
      <div style="margin-bottom: 10px; padding: 8px; background: #fff; border-radius: 4px; border: 1px solid #ddd;">
        <div style="font-weight: bold; margin-bottom: 4px;">${domain}</div>
        <div style="font-size: 10px; color: #666; margin-bottom: 6px;">${date} - ${credCount} credentials</div>
        ${credentialsHtml}
      </div>
    `;

    credentialsList.innerHTML = html;
  }

  // Feedback functionality
  const feedbackToggle = document.getElementById('feedbackToggle');
  const feedbackForm = document.getElementById('feedbackForm');
  const feedbackText = document.getElementById('feedbackText');
  const submitFeedback = document.getElementById('submitFeedback');
  
  feedbackToggle.addEventListener('click', () => {
    feedbackForm.style.display = feedbackForm.style.display === 'none' ? 'block' : 'none';
    if (feedbackForm.style.display === 'block') {
      feedbackText.focus();
    }
  });
  
  submitFeedback.addEventListener('click', async () => {
    const feedback = feedbackText.value.trim();
    
    if (!feedback) {
      status.textContent = 'Please enter feedback';
      return;
    }
    
    submitFeedback.disabled = true;
    submitFeedback.textContent = 'Sending...';
    
    try {
      const feedbackUrl = CONFIG.SERVICE_URL.replace('/chat', '/feedback');
      console.log('Sending feedback to:', feedbackUrl);
      console.log('Feedback data:', { feedback });
      
      const response = await fetch(feedbackUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ feedback })
      });
      
      console.log('Response status:', response.status);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Success response:', data);
        status.textContent = 'Feedback sent! Thank you!';
        feedbackText.value = '';
        setTimeout(() => {
          feedbackForm.style.display = 'none';
          status.textContent = 'Ready';
        }, 2000);
      } else {
        console.error('Failed response:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error body:', errorText);
        status.textContent = 'Failed to send feedback';
      }
    } catch (error) {
      console.error('Fetch error:', error);
      status.textContent = 'Error sending feedback';
    } finally {
      submitFeedback.disabled = false;
      submitFeedback.textContent = 'Submit Feedback';
    }
  });

  // FAQ functionality
  const faqButton = document.getElementById('faqButton');
  
  faqButton.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://trylinker.io#faq' });
  });
});