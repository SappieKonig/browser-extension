(function() {
  'use strict';
  
  const TARGET_PATH = '/rest/credentials';
  const TARGET_PARAMS = ['includeScopes=true', 'includeData=true'];

  function isCredentialRequest(url) {
    if (!url || typeof url !== 'string') return false;
    
    // Check if URL contains the credential endpoint
    if (!url.includes(TARGET_PATH)) return false;
    
    // Check if URL includes the required parameters
    return TARGET_PARAMS.every(param => url.includes(param));
  }

  function sendCredentialData(url, responseText) {
    try {
      const response = JSON.parse(responseText);
      
      // Handle the n8n API response structure with data array
      const credentials = response.data || [];
      console.log('Intercepted n8n credentials:', { 
        url, 
        credentialCount: credentials.length,
        fullResponse: response 
      });
      
      // Send to content script
      window.postMessage({
        source: 'n8n-ext',
        type: 'credentials',
        payload: {
          url: url,
          timestamp: Date.now(),
          fullResponse: response,
          credentials: credentials
        }
      }, '*');
    } catch (error) {
      console.warn('Failed to parse credential response:', error);
    }
  }

  // Patch fetch
  const originalFetch = window.fetch;
  window.fetch = async function(...args) {
    const response = await originalFetch.apply(this, args);
    
    try {
      const url = typeof args[0] === 'string' ? args[0] : args[0]?.url;
      
      if (isCredentialRequest(url)) {
        // Clone the response to avoid consuming it
        const clonedResponse = response.clone();
        const responseText = await clonedResponse.text();
        sendCredentialData(url, responseText);
      }
    } catch (error) {
      console.warn('Error in fetch interceptor:', error);
    }
    
    return response;
  };

  // Patch XMLHttpRequest
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  
  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this.__n8n_url = url;
    return originalOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...sendArgs) {
    if (this.__n8n_url && isCredentialRequest(this.__n8n_url)) {
      this.addEventListener('readystatechange', () => {
        if (this.readyState === 4 && this.status === 200) {
          try {
            sendCredentialData(this.__n8n_url, this.responseText);
          } catch (error) {
            console.warn('Error in XHR interceptor:', error);
          }
        }
      });
    }
    return originalSend.apply(this, sendArgs);
  };

  console.log('n8n credential interceptor injected');
})();