document.addEventListener('DOMContentLoaded', () => {
  console.log('Popup loaded - starting privacy check');
  
  // Privacy agreement elements
  const privacyOverlay = document.getElementById('privacyOverlay');
  const mainContent = document.getElementById('mainContent');
  const privacyAccept = document.getElementById('privacyAccept');
  const privacyDecline = document.getElementById('privacyDecline');
  
  // Main elements
  const toggleButton = document.getElementById('toggleButton');
  const status = document.getElementById('status');
  const currentDomain = document.getElementById('currentDomain');
  const apiKeyInput = document.getElementById('apiKey');
  const anthropicApiKeyInput = document.getElementById('anthropicApiKey');
  const anthropicApiKeyGroup = document.getElementById('anthropicApiKeyGroup');
  const saveConfigButton = document.getElementById('saveConfig');
  
  // Google Auth elements
  const googleSignInButton = document.getElementById('googleSignInButton');
  const signInSection = document.getElementById('signInSection');
  const userProfileSection = document.getElementById('userProfileSection');
  const userEmail = document.getElementById('userEmail');
  const userName = document.getElementById('userName');
  const trialStatus = document.getElementById('trialStatus');
  const signOutButton = document.getElementById('signOutButton');

  console.log('Found privacy elements:', !!privacyOverlay, !!mainContent, !!privacyAccept, !!privacyDecline);

  if (!toggleButton || !status || !currentDomain || !apiKeyInput || !saveConfigButton) {
    console.error('Could not find required elements');
    return;
  }

  if (!googleSignInButton) {
    console.error('Google sign-in button not found!');
    return;
  }

  // Check privacy agreement status first
  checkPrivacyAgreement();
  
  // Listen for trial status update requests from content script
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.action === 'updateTrialStatus' && message.email) {
      updateTrialStatus(message.email);
    }
  });

  function checkPrivacyAgreement() {
    chrome.storage.local.get(['privacyAgreed'], (result) => {
      console.log('Privacy check result:', result);
      if (!result.privacyAgreed) {
        console.log('No privacy agreement found, showing modal');
        // Show privacy modal and disable main content
        privacyOverlay.style.display = 'flex';
        mainContent.classList.add('disabled');
      } else {
        // Privacy agreed, enable normal functionality
        privacyOverlay.style.display = 'none';
        mainContent.classList.remove('disabled');
        initializeExtension();
      }
    });
  }

  // Privacy agreement handlers
  privacyAccept.addEventListener('click', () => {
    chrome.storage.local.set({ 
      privacyAgreed: true,
      privacyAgreedDate: new Date().toISOString()
    }, () => {
      privacyOverlay.style.display = 'none';
      mainContent.classList.remove('disabled');
      initializeExtension();
      status.textContent = 'Privacy agreement accepted';
      setTimeout(() => {
        status.textContent = 'Ready';
      }, 2000);
    });
  });

  privacyDecline.addEventListener('click', () => {
    // Close popup if declined
    window.close();
  });

  function initializeExtension() {
    // Load saved configuration and initialize all functionality
    loadConfiguration();
    initializeGoogleAuth();
    initializeToggleButton();
    initializeCredentials();
    initializeFAQ();
  }

  function loadConfiguration() {
    chrome.storage.local.get(['apiKey', 'anthropicApiKey'], (result) => {
      if (result.apiKey) {
        apiKeyInput.value = result.apiKey;
      }
      if (result.anthropicApiKey) {
        anthropicApiKeyInput.value = result.anthropicApiKey;
      }
    });

    // Auto-save API key as user types
    apiKeyInput.addEventListener('input', () => {
      const apiKey = apiKeyInput.value.trim();
      chrome.storage.local.set({ apiKey });
    });

    // Auto-save Anthropic API key as user types
    anthropicApiKeyInput.addEventListener('input', () => {
      const anthropicApiKey = anthropicApiKeyInput.value.trim();
      chrome.storage.local.set({ anthropicApiKey });
    });

    // Save configuration (now just for validation feedback)
    saveConfigButton.addEventListener('click', async () => {
      const apiKey = apiKeyInput.value.trim();
      const anthropicApiKey = anthropicApiKeyInput.value.trim();
      
      // Check if user is signed in
      const googleToken = await getStoredGoogleToken();
      if (!googleToken) {
        status.textContent = 'Please sign in with Google first';
        return;
      }
      
      if (!apiKey) {
        status.textContent = 'Please enter your n8n API key';
        return;
      }
      
      // Anthropic API key is optional for trial users (backend will use .env key)
      // Only required if user has exceeded trial or wants to use their own key
      
      status.textContent = 'Configuration saved';
      setTimeout(() => {
        status.textContent = 'Ready';
      }, 2000);
    });
  }

  function initializeToggleButton() {
    // Get current tab info first
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      if (tabs.length === 0) {
        status.textContent = 'Error: No active tab';
        return;
      }

      const currentTab = tabs[0];
      const url = new URL(currentTab.url);
      const domain = url.hostname;
      
      currentDomain.textContent = domain;

      // Get the current state for this domain
      chrome.storage.local.get(['domainStates'], (result) => {
        console.log('Storage result:', result);
        const domainStates = result.domainStates || {};
        const currentState = domainStates[domain] || false;
        
        updateButtonState(currentState);
      });
    });

    // Toggle button click handler
    toggleButton.addEventListener('click', () => {
      console.log('Toggle button clicked');
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        console.log('Active tabs:', tabs);
        if (tabs.length === 0) return;

        const currentTab = tabs[0];
        const url = new URL(currentTab.url);
        const domain = url.hostname;

        // Get current state
        chrome.storage.local.get(['domainStates'], (result) => {
          const domainStates = result.domainStates || {};
          const currentState = domainStates[domain] || false;
          const newState = !currentState;

          // Update state
          domainStates[domain] = newState;
          chrome.storage.local.set({ domainStates }, () => {
            console.log('Updated storage:', result);
            updateButtonState(newState);
          });

          // Inject or check content script
          if (newState) {
            console.log('Content script not found, injecting...');
            chrome.scripting.executeScript({
              target: { tabId: currentTab.id },
              files: ['config.js', 'content.js']
            }, () => {
              if (chrome.runtime.lastError) {
                console.error('Script injection failed:', chrome.runtime.lastError);
                status.textContent = 'Failed to inject content script';
                return;
              }
              
              // Send toggle message
              chrome.tabs.sendMessage(currentTab.id, { 
                action: 'toggleChatBox' 
              }, (response) => {
                if (chrome.runtime.lastError) {
                  console.error('Message sending failed:', chrome.runtime.lastError);
                } else {
                  console.log('Message sent successfully');
                  status.textContent = newState ? 'Chat box enabled' : 'Chat box disabled';
                }
              });
            });
          } else {
            // Send toggle message to hide
            chrome.tabs.sendMessage(currentTab.id, { 
              action: 'toggleChatBox' 
            }, (response) => {
              if (chrome.runtime.lastError) {
                console.error('Message sending failed:', chrome.runtime.lastError);
              } else {
                status.textContent = 'Chat box disabled';
              }
            });
          }
        });
      });
    });

    function updateButtonState(isEnabled) {
      setTimeout(() => {
        if (isEnabled) {
          toggleButton.textContent = 'Disable Chat Box';
        } else {
          toggleButton.textContent = 'Enable Chat Box';
        }
      }, 100);
    }
  }

  function initializeCredentials() {
    // Credentials functionality
    const credentialsToggle = document.getElementById('credentialsToggle');
    const credentialsView = document.getElementById('credentialsView');
    const credentialsList = document.getElementById('credentialsList');
    const exportCredentials = document.getElementById('exportCredentials');
    const clearCredentials = document.getElementById('clearCredentials');

    credentialsToggle.addEventListener('click', () => {
      const isVisible = credentialsView.style.display !== 'none';
      credentialsView.style.display = isVisible ? 'none' : 'block';
      
      if (!isVisible) {
        // Load and display credentials
        loadCredentials();
      }
    });

    exportCredentials.addEventListener('click', () => {
      chrome.runtime.sendMessage({ type: 'getCredentials' }, async (response) => {
        const credentials = response.credentials;
        
        if (!credentials || !credentials.rawResponse) {
          status.textContent = 'No credentials to export';
          setTimeout(() => {
            status.textContent = 'Ready';
          }, 2000);
          return;
        }

        // Create the export data - this is the same format sent with chat requests
        const exportData = {
          rawResponse: credentials.rawResponse,
          timestamp: credentials.timestamp,
          domain: credentials.domain,
          credentialCount: credentials.credentialCount
        };

        // Copy credentials to clipboard
        const jsonString = JSON.stringify(exportData, null, 2);
        
        try {
          await navigator.clipboard.writeText(jsonString);
          status.textContent = 'Credentials copied to clipboard';
        } catch (error) {
          console.error('Failed to copy to clipboard:', error);
          // Fallback: create a temporary text area for manual copying
          const textArea = document.createElement('textarea');
          textArea.value = jsonString;
          textArea.style.position = 'fixed';
          textArea.style.left = '-999999px';
          textArea.style.top = '-999999px';
          document.body.appendChild(textArea);
          textArea.focus();
          textArea.select();
          
          try {
            document.execCommand('copy');
            status.textContent = 'Credentials copied to clipboard (fallback)';
          } catch (fallbackError) {
            status.textContent = 'Copy failed - please try again';
            console.error('Fallback copy failed:', fallbackError);
          }
          
          document.body.removeChild(textArea);
        }
        setTimeout(() => {
          status.textContent = 'Ready';
        }, 2000);
      });
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
  }


  function initializeFAQ() {
    // FAQ functionality
    const faqButton = document.getElementById('faqButton');
    
    faqButton.addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://trylinker.io#faq' });
    });
  }


  function initializeGoogleAuth() {
    console.log('Initializing Google Auth...');
    console.log('Chrome Identity API available:', !!chrome.identity);
    console.log('Extension ID:', chrome.runtime.id);
    
    // Log manifest info for debugging
    const manifest = chrome.runtime.getManifest();
    console.log('Manifest version:', manifest.manifest_version);
    console.log('OAuth2 config:', manifest.oauth2);
    console.log('Permissions:', manifest.permissions);
    
    // Check if user is already signed in
    checkSignInStatus();
    
    // Set up event listeners
    if (googleSignInButton) {
      console.log('Adding click listener to Google sign-in button');
      googleSignInButton.addEventListener('click', handleGoogleSignIn);
    } else {
      console.error('Google sign-in button not found!');
    }
    
    if (signOutButton) {
      signOutButton.addEventListener('click', handleSignOut);
    }
  }

  async function checkSignInStatus() {
    try {
      const googleToken = await getStoredGoogleToken();
      if (googleToken) {
        // Verify token is still valid by getting user info
        const userInfo = await getUserInfo(googleToken);
        if (userInfo) {
          showUserProfile(userInfo);
          await updateTrialStatus(userInfo.email);
        } else {
          // Token expired, clear it
          await clearStoredGoogleToken();
          showSignInButton();
        }
      } else {
        showSignInButton();
      }
    } catch (error) {
      console.error('Error checking sign-in status:', error);
      showSignInButton();
    }
  }

  async function handleGoogleSignIn() {
    try {
      console.log('Starting Google sign-in process...');
      googleSignInButton.disabled = true;
      googleSignInButton.textContent = 'Signing in...';
      
      // Check if chrome.identity is available
      if (!chrome.identity) {
        throw new Error('Chrome Identity API not available');
      }
      
      console.log('Using chrome.identity.getAuthToken (recommended approach)');
      
      // Get OAuth token using Chrome's built-in method
      const token = await new Promise((resolve, reject) => {
        chrome.identity.getAuthToken({ 
          interactive: true 
        }, (token) => {
          if (chrome.runtime.lastError) {
            console.error('Chrome Identity error:', chrome.runtime.lastError);
            reject(new Error(chrome.runtime.lastError.message));
          } else if (token) {
            resolve(token);
          } else {
            reject(new Error('No token received'));
          }
        });
      });
      
      console.log('Got token from Chrome Identity API');
      
      // Get user info from Google
      const userInfo = await getUserInfo(token);
      if (userInfo) {
        console.log('Got user info:', userInfo);
        
        // Store token and user info
        await chrome.storage.local.set({ 
          googleToken: token,
          userInfo: userInfo
        });
        
        showUserProfile(userInfo);
        await updateTrialStatus(userInfo.email);
        status.textContent = 'Successfully signed in!';
        setTimeout(() => {
          status.textContent = 'Ready';
        }, 2000);
      } else {
        throw new Error('Failed to get user info from Google API');
      }
      
    } catch (error) {
      console.error('Google sign-in error:', error);
      
      // Provide specific error messages
      let errorMessage = 'Sign-in failed. Please try again.';
      if (error.message.includes('OAuth2 request failed')) {
        errorMessage = 'OAuth configuration error. Please check Google Cloud Console setup.';
      } else if (error.message.includes('user info')) {
        errorMessage = 'Failed to get user info. Please try again.';
      } else if (error.message.includes('No token')) {
        errorMessage = 'Authentication cancelled or failed.';
      } else if (error.message.includes('not available')) {
        errorMessage = 'Chrome Identity API not available. Please check permissions.';
      }
      
      status.textContent = errorMessage;
      setTimeout(() => {
        status.textContent = 'Ready';
      }, 4000);
    } finally {
      googleSignInButton.disabled = false;
      googleSignInButton.textContent = '📧 Sign in with Google';
    }
  }

  async function handleSignOut() {
    try {
      const googleToken = await getStoredGoogleToken();
      if (googleToken) {
        // Revoke the token
        await chrome.identity.removeCachedAuthToken({ token: googleToken });
      }
      
      // Clear stored data
      await clearStoredGoogleToken();
      showSignInButton();
      
      status.textContent = 'Signed out successfully';
      setTimeout(() => {
        status.textContent = 'Ready';
      }, 2000);
    } catch (error) {
      console.error('Sign-out error:', error);
      status.textContent = 'Sign-out failed';
    }
  }

  async function getUserInfo(token) {
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        return await response.json();
      }
      return null;
    } catch (error) {
      console.error('Error getting user info:', error);
      return null;
    }
  }

  async function updateTrialStatus(email) {
    try {
      // Get user stats from the backend
      const response = await fetch(`${CONFIG.SERVICE_URL}/user-stats?email=${encodeURIComponent(email)}`);
      if (response.ok) {
        const stats = await response.json();
        const remaining = Math.max(0, 10 - stats.trial_requests_used);
        
        if (stats.is_premium) {
          trialStatus.textContent = 'Premium Account';
          trialStatus.style.color = '#4285f4';
        } else if (remaining > 0) {
          trialStatus.textContent = `${remaining} free requests remaining`;
          trialStatus.style.color = '#FF4040';
        } else {
          trialStatus.textContent = 'Trial limit reached';
          trialStatus.style.color = '#B32D2D';
        }
      }
    } catch (error) {
      console.error('Error updating trial status:', error);
      trialStatus.textContent = 'Unable to check trial status';
    }
  }

  function showUserProfile(userInfo) {
    signInSection.style.display = 'none';
    userProfileSection.style.display = 'block';
    
    userEmail.textContent = userInfo.email;
    userName.textContent = userInfo.name || '';
  }

  function showSignInButton() {
    signInSection.style.display = 'block';
    userProfileSection.style.display = 'none';
  }

  async function getStoredGoogleToken() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['googleToken'], (result) => {
        resolve(result.googleToken);
      });
    });
  }

  async function clearStoredGoogleToken() {
    return new Promise((resolve) => {
      chrome.storage.local.remove(['googleToken', 'userInfo'], resolve);
    });
  }

});