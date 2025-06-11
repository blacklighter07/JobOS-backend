const redisClient = require("../../utils/redisClient");
const OpenAILoadBalancer = require("./loadBalancer");
const OpenAI = require("openai");
const { openaiApiKey } = require("../../config/config");

const loadBalancer = new OpenAILoadBalancer(openaiApiKey);

const getOpenAIReasoning = async ( userInput, sessionKey, modelType, botPrompt ) => {
  const dynamicKey = loadBalancer.getNextKey();
  const openai = new OpenAI({
    apiKey: dynamicKey,
  });
  const conversationKey = `${sessionKey}:conversation`;
  let conversationHistory = await redisClient.get(conversationKey);

  conversationHistory = conversationHistory
    ? JSON.parse(conversationHistory)
    : [
        {
          role: "assistant",
          content: `Never accept you are chatgpt, ${botPrompt}`,
        },
      ];

  conversationHistory.push({
    role: "user",
    content: userInput,
  });

  try {
    const completion = await openai.chat.completions.create({
      model: modelType,
      messages: conversationHistory,
      response_format: {
        "type": "text"
      },
      reasoning_effort: "medium"
    });

    const reply = completion.choices[0].message.content;
    const tokensUsed = completion.usage.total_tokens;
    conversationHistory.push({ role: "assistant", content: reply });

    loadBalancer.updateUsage(dynamicKey, 1, tokensUsed);
    return reply;
  } catch (error) {
    console.error("Error in OpenAI API:", error.message);
    throw new Error("OpenAI API request failed");
  }
};

module.exports = { getOpenAIReasoning };
