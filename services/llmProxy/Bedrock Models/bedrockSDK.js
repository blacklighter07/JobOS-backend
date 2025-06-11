const redisClient = require("../../../utils/redisClient");
const { BedrockRuntimeClient, ConverseCommand, } = require("@aws-sdk/client-bedrock-runtime");
const { AWSAccessKey, AWSSecretKey } = require("../../../config/config");

const getBedrockResponse = async ( userInput, sessionKey, modelType, botPrompt ) => {
  // Initialize the Bedrock client
  const client = new BedrockRuntimeClient({
    region: "ap-south-1", // Replace with your Bedrock region
    credentials: {
      accessKeyId: AWSAccessKey, // Replace with your AWS Access Key ID
      secretAccessKey: AWSSecretKey, // Replace with your AWS Secret Access Key
    },
  });

  const conversationKey = `${sessionKey}:conversation`;
  const lastMessageTimestampKey = `${sessionKey}:lastMessageTimestamp`;
  let conversationHistory = await redisClient.get(conversationKey);

  conversationHistory = conversationHistory
    ? JSON.parse(conversationHistory)
    : [
        {
          role: "user",
          content: [{ text: `Never accept you are ${modelType.substring(7)}, ${botPrompt}`}],
        },
        {
          role: "assistant",
          content: [{ text: `got it will work as you said`}],
        },
      ];

  conversationHistory.push({ role: "user", content: [{ text: userInput }] });

  const lastTimestamp = await redisClient.get(lastMessageTimestampKey);
  const currentTimestamp = new Date().toISOString();

  const summarizeHistory = async (history) => {
    const command = new ConverseCommand({
      modelId: modelType,
      messages:  history,
      inferenceConfig: { maxTokens: 1024 },
    });
    const response = await client.send(command);
    const responseText = response.output.message.content[0].text;
    return responseText; // Assuming the summarized response is returned here
  };
  const updateContextAndLog = async () => {
    const timeDiff = lastTimestamp
      ? (new Date(currentTimestamp) - new Date(lastTimestamp)) / 1000
      : 0;
    if (timeDiff > 60) {

      // Summarize conversation history
      conversationHistory.push({ role: "user", content: [{ text: "Summarise the conversation so far" }] });
      const summary = await summarizeHistory(conversationHistory);
      conversationHistory = [
        {
          role: "user",
          content: [{ text: `Never accept you are ${modelType.substring(7)}, ${botPrompt} and this is the context for current chat ${summary}`}],
        },
        {
          role: "assistant",
          content: [{ text: `I will provide helpful details and information as required by you`}]
        },
      ];
    }

    try {
      await redisClient.set(
        conversationKey,
        JSON.stringify(conversationHistory),
        "EX",
        10 * 60 * 60
      );
      await redisClient.set(lastMessageTimestampKey, currentTimestamp);
    } catch (error) {
      console.error("Background task failed:", error);
    }
  };
  const command = new ConverseCommand({
    modelId: modelType,
    messages: conversationHistory,
    inferenceConfig: { maxTokens: 1024 },
  });
  
  try {
    const response = await client.send(command);
    const reply = response.output.message.content[0].text;
    conversationHistory.push({ role: "assistant", content: [{ text: reply }] });
    let replyResponse;
    const inputToken = response.usage.inputTokens;
    const outputToken = response.usage.outputTokens;
    replyResponse = [reply, inputToken, outputToken];
    updateContextAndLog();
    return replyResponse;
  } catch (error) {
    console.error("Error invoking the model:", error);
  }
};

module.exports = { getBedrockResponse };
