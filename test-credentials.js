// Test script for credential interception functionality
// This simulates network requests that would be intercepted

console.log('Testing credential interception...');

// Simulate the n8n credentials endpoint response
const mockCredentialsResponse = [
  {
    id: "cred_123",
    name: "Test Gmail",
    type: "gmail",
    createdAt: "2025-01-07T10:00:00Z",
    updatedAt: "2025-01-07T10:00:00Z",
    data: {
      username: "test@gmail.com",
      password: "[HIDDEN]",
      clientId: "google-client-id",
      clientSecret: "[HIDDEN]"
    }
  },
  {
    id: "cred_456",
    name: "Test Slack",
    type: "slack",
    createdAt: "2025-01-07T09:30:00Z",
    updatedAt: "2025-01-07T09:30:00Z",
    data: {
      token: "[HIDDEN]",
      workspace: "test-workspace"
    }
  }
];

// Function to test fetch interception
function testFetchInterception() {
  console.log('Testing fetch interception...');
  
  // Simulate a fetch to the n8n credentials endpoint
  const mockUrl = 'https://sheggle.app.n8n.cloud/rest/credentials?includeScopes=true&includeData=true';
  
  // Create a mock response
  const mockResponse = new Response(
    JSON.stringify(mockCredentialsResponse),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
  
  // This would be intercepted by our page-inject.js script
  Promise.resolve(mockResponse).then(response => response.text()).then(text => {
    console.log('Mock response intercepted:', text);
  });
}

// Function to test XHR interception  
function testXHRInterception() {
  console.log('Testing XHR interception...');
  
  // This would normally make a real request, but for testing we'll just log
  const xhr = new XMLHttpRequest();
  const testUrl = 'https://sheggle.app.n8n.cloud/rest/credentials?includeScopes=true&includeData=true';
  
  xhr.open('GET', testUrl);
  console.log('Mock XHR request prepared for:', testUrl);
}

// Test storage functionality
function testStorageAPI() {
  console.log('Testing storage API...');
  
  // Test data
  const testCredentialEntry = {
    id: 'test_' + Date.now(),
    timestamp: Date.now(),
    url: 'https://sheggle.app.n8n.cloud/rest/credentials?includeScopes=true&includeData=true',
    credentials: mockCredentialsResponse,
    domain: 'sheggle.app.n8n.cloud'
  };
  
  // Simulate storing credentials
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.local.get({ n8nCredentials: [] }, (result) => {
      const credentials = result.n8nCredentials;
      credentials.unshift(testCredentialEntry);
      
      chrome.storage.local.set({ n8nCredentials: credentials }, () => {
        console.log('Test credentials stored successfully');
      });
    });
  } else {
    console.log('Chrome storage API not available in this context');
  }
}

// Run tests
if (window.location.hostname.includes('.app.n8n.cloud')) {
  console.log('Running on n8n domain - credential interception should be active');
  testFetchInterception();
  testXHRInterception();
  testStorageAPI();
} else {
  console.log('Not on n8n domain - credential interception would be inactive');
}

// Add a simple message to verify script loading
console.log('Credential interception test script loaded successfully');