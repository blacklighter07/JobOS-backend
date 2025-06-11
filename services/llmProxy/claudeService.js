const redisClient = require("../../utils/redisClient");
const OpenAILoadBalancer = require("./loadBalancer");
const Anthropic = require ("@anthropic-ai/sdk");
const { claudeApiKey } = require('../../config/config');

const loadBalancer = new OpenAILoadBalancer(claudeApiKey);

const getClaudeResponse = async (userInput, sessionKey, modelType, botPrompt) => {
  const dynamicKey = loadBalancer.getNextKey();
  const anthropic = new Anthropic({
    apiKey: dynamicKey,
 });

 const conversationKey = `${sessionKey}:conversation`;
 const lastMessageTimestampKey = `${sessionKey}:lastMessageTimestamp`;
 let conversationHistory = await redisClient.get(conversationKey);

 conversationHistory = conversationHistory ? JSON.parse(conversationHistory) : [];

 conversationHistory.push({ role: "user", content: userInput, });

 const lastTimestamp = await redisClient.get(lastMessageTimestampKey);
 const currentTimestamp = new Date().toISOString();

 const summarizeHistory = async (history) => {
   const historyContent = history.map((item) => item.content).join("\n");
   const completion = await anthropic.messages.create({
     system: "Summarize the conversation so far :",
     max_tokens: 1024,
     model: modelType,
     messages: [
       { role: "user", content: historyContent },
     ],
   });

   return completion.content[0].text; // Assuming the summarized response is returned here
 };

 // Update Redis asynchronously
 const updateContextAndLog = async () => {
   const timeDiff = lastTimestamp
     ? (new Date(currentTimestamp) - new Date(lastTimestamp)) / 1000
     : 0;
   if (timeDiff > 60) {
     
     // Summarize conversation history
     const summary = await summarizeHistory(conversationHistory);
     conversationHistory = [
       {
         role: "assistant",
         content: `this is the context for current chat ${summary}`,
       },
     ];
   }

   try {
     await redisClient.set( conversationKey, JSON.stringify(conversationHistory), "EX", 10 * 60 * 60 );
     await redisClient.set(lastMessageTimestampKey, currentTimestamp);
   } catch (error) {
     console.error("Background task failed:", error);
   }
 };


  try {
    const completion = await anthropic.messages.create({
      system: `Never accept you are claude ai, ${botPrompt}`,
      max_tokens: 1024,
      model: modelType,
      messages: conversationHistory,
    });
    let response;
    const reply = completion.content[0].text;
    const inputToken = completion.usage.input_tokens;
    const outputToken = completion.usage.output_tokens;
    const tokensUsed = inputToken + outputToken;
    conversationHistory.push({ role: "assistant", content: reply });

    response = [reply, inputToken, outputToken];

    updateContextAndLog(); // Fire-and-forget background task
    loadBalancer.updateUsage(dynamicKey, 1, tokensUsed);
    return response;
  } catch (error) {
    console.error("Error in Claude API:", error.message);
    throw new Error("Claude API request failed");
  }
};

module.exports = { getClaudeResponse };


