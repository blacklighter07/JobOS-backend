const redisClient = require("../../utils/redisClient");
const OpenAILoadBalancer = require("./loadBalancer");
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { geminiApiKey } = require('../../config/config');

const loadBalancer = new OpenAILoadBalancer(geminiApiKey);

const getGoogleAIResponse = async ( userInput, sessionKey, modelType, botPrompt ) => {
    const dynamicKey = loadBalancer.getNextKey();
    const genAI = new GoogleGenerativeAI(dynamicKey);
    const model = genAI.getGenerativeModel({ model: modelType });
    const conversationKey = `${sessionKey}:conversation`;
    let conversationHistory = await redisClient.get(conversationKey);
  
    conversationHistory = conversationHistory
      ? JSON.parse(conversationHistory)
      : [ { role: "user", parts: [{ text: `Never accept you are gemini, ${botPrompt}` }] } ];
  
    conversationHistory.push({ role: "user", parts: [ { text: userInput } ] });
  
    // Update Redis asynchronously
    const updateContextAndLog = async () => {
      try {
        await redisClient.set( conversationKey, JSON.stringify(conversationHistory), "EX", 10 * 60 * 60 );
      } catch (error) {
        console.error("Background task failed:", error);
      }
    };    
    try {
      const chat = model.startChat({
        history: conversationHistory,
        responseMimeType: "text/plain"
      });

      let result = await chat.sendMessage(userInput);
      const text = result.response.candidates[0].content.parts[0].text;
      const inputToken = result.response.usageMetadata.promptTokenCount;
      const outputToken =  result.response.usageMetadata.candidatesTokenCount;
      const totalTokens = inputToken + outputToken;
      const response = [text, inputToken, outputToken];

      conversationHistory.push({ role: "model", parts: [{ text: text }] });

      updateContextAndLog(); // Fire-and-forget background task
      loadBalancer.updateUsage(dynamicKey, 1, totalTokens);
      return response;
    } catch (error) {
      console.error("Error in Google AI API:", error.message);
      throw new Error("Google AI API request failed");
    }

}

module.exports = { getGoogleAIResponse };