class OpenAILoadBalancer {
    constructor(apiKeys) {
      this.apiKeys = apiKeys.map(key => ({
        key,
        rpmUsage: 0,  // Requests per minute usage
        tpmUsage: 0,  // Tokens per minute usage
        isBlocked: false, // To track rate limit issues
      }));
      this.currentKeyIndex = 0;
    }
  
    // Get the next available API key
    getNextKey() {
      const availableKeys = this.apiKeys.filter(key => !key.isBlocked);
  
      if (availableKeys.length === 0) {
        throw new Error("All API keys are currently blocked.");
      }
  
      // Round-robin strategy
      const selectedKey = availableKeys[this.currentKeyIndex % availableKeys.length];
      this.currentKeyIndex++;
      return selectedKey.key;
      
    }
  
    // Update usage stats for a key
    updateUsage(apiKey, rpmUsed, tpmUsed) {
      const key = this.apiKeys.find(k => k.key === apiKey);
      if (key) {
        key.rpmUsage += rpmUsed;
        key.tpmUsage += tpmUsed;
        // Mark as blocked if limits are hit (e.g., assume 60 RPM and 90k TPM as limits)
        if (key.rpmUsage >= 30 || key.tpmUsage >= 8000) {
          key.isBlocked = true;
          setTimeout(() => (key.isBlocked = false), 60 * 1000); // Unblock after 1 minute
        }
      }
    }
  }
  
module.exports = OpenAILoadBalancer;