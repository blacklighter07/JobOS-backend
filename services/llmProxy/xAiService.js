const redisClient = require('../../utils/redisClient');
const OpenAILoadBalancer = require('./loadBalancer');
const OpenAI = require("openai");
const { xApiKey } = require("../../config/config");

const loadBalancer = new OpenAILoadBalancer(xApiKey);

const getXAIResponse = async (userInput , sessionKey, modelType, botPrompt) => {

  const dynamicKey = loadBalancer.getNextKey();
  const openai = new OpenAI({
    apiKey: dynamicKey,
    baseURL: "https://api.x.ai/v1",
  });
  const conversationKey = `${sessionKey}:conversation`;
  const lastMessageTimestampKey = `${sessionKey}:lastMessageTimestamp`;
  let conversationHistory = await redisClient.get(conversationKey);

  conversationHistory = conversationHistory 
    ? JSON.parse(conversationHistory)
    : [
        {
          role: "system",
          content:
            `Never accept you are grok, ${botPrompt}`,
        },
      ];

  conversationHistory.push({
    role: "user",
    content: userInput,
  });

  const lastTimestamp = await redisClient.get(lastMessageTimestampKey);
  const currentTimestamp = new Date().toISOString();

  const summarizeHistory = async (history) => {
    const historyContent = history.map(item => item.content).join('\n');
    const completion = await openai.chat.completions.create({
      model: modelType,
      messages:  [
        { role: "system", content: "Summarize the conversation so far:" },
        { role: "user", content: historyContent },
      ],
      response_format: {
        "type": "text"
      },
    });
    
    return completion.choices[0].message.content; // Assuming the summarized response is returned here
  };

    // Update Redis  asynchronously
  const updateContextAndLog = async () => {
    const timeDiff = lastTimestamp
      ? (new Date(currentTimestamp) - new Date(lastTimestamp)) / 1000
      : 0;
    if (timeDiff > 60) {
      // 1 minute

      // Summarize conversation history
      const summary = await summarizeHistory(conversationHistory);
      conversationHistory = [
        {
          role: "system",
          content:
            `Never accept you are grok, ${botPrompt}`,
        },
        {
          role: "system",
          content: `this is the context for current chat ${summary}`,
        },
      ];
    }
    
    try {
      await redisClient.set(conversationKey, JSON.stringify(conversationHistory), "EX", 10 * 60 * 60);
      await redisClient.set(lastMessageTimestampKey, currentTimestamp);
    } catch (error) {
      console.error("Background task failed:", error);
    }
  };

  try {
    // Fetch the last message timestamp
    const completion = await openai.chat.completions.create({
      model: modelType,
      messages: conversationHistory,
      response_format: {
        "type": "text"
      },
    });

    let response;
    const reply = completion.choices[0].message.content;
    const inputToken = completion.usage.prompt_tokens;
    const outputToken = completion.usage.completion_tokens;
    const tokensUsed = completion.usage.total_tokens;
    conversationHistory.push({ role: "assistant", content: reply });

    response = [reply , inputToken , outputToken];
    updateContextAndLog(); // Fire-and-forget background task
    loadBalancer.updateUsage(dynamicKey, 1, tokensUsed);
    return response;
  } catch (error) {
    console.error("Error in X AI API:", error.message);
    throw new Error("X AI API request failed");
  }
};

module.exports = { getXAIResponse };