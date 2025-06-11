const { getClaudeResponse } = require('./claudeService');
const { getOpenAIResponse } = require('./openAIService');
const { getOpenAIoResponse } = require('./openAIoService');
const { getXAIResponse } = require('./xAiService');
const { getGoogleAIResponse } = require('./geminiService')
const { getDeepSeekResponse } = require('./deepseekService');
const { getBedrockResponse } = require('./Bedrock Models/bedrockSDK');
const { getOpenAIReasoning } = require('./openAIReasoning');

const responseHandlers = {
  grok: getXAIResponse,
  gpt : getOpenAIResponse,
  'o1_or_o3mini': getOpenAIReasoning,
  'o1mini_or_o3': getOpenAIoResponse,
  claude: getClaudeResponse,
  gemini: getGoogleAIResponse,
  deep: getDeepSeekResponse,
  meta: getBedrockResponse,
  mistral: getBedrockResponse,
};

const getLLMResponse = async (message, modelType, sessionKey, botPrompt) => {
  try {
    if (!message || !modelType) {
      return res
        .status(400)
        .json({ error: "userInput and modelType are required" });
    }

    let response;
    // Dynamically determine the correct handler function based on modelType
    let handlerKey;
    if (modelType.startsWith('o1') || modelType.startsWith('o3-mini')) {
      handlerKey = 'o1_or_o3mini';  // Matches when modelType is o1 or o3-mini
    } else if (modelType.startsWith('o1-mini') || modelType.startsWith('o3')) {
      handlerKey = 'o1mini_or_o3';  // Matches when modelType is o1-mini or o3
    } else {
      // Default: try to find a match in responseHandlers based on the prefix of modelType
      handlerKey = Object.keys(responseHandlers).find((key) =>
        modelType.startsWith(key)
      );
    }

    if (handlerKey) {
      const handler = responseHandlers[handlerKey];
      response = await handler(message, sessionKey, modelType, botPrompt);
      return response;

    } else {
      console.error(" modelType not matching ", error.message);
      return res.json({ error: "Unsupported modelType" });
    }
  } catch (error) {
    console.error("getLLMResponse:", error.message);
    return res.status(500).json({ error: "Failed to get a response from LLM" });
  }
};

module.exports = { getLLMResponse };
