require('dotenv').config();

module.exports = {
  claudeApiKey: process.env.CLAUDE_API_KEY.split(','),
  openaiApiKey: process.env.OPENAI_API_KEY.split(','),
  xApiKey: process.env.X_API_KEY.split(','),
  geminiApiKey: process.env.GEMINI_API_KEY.split(','),
  deepseekApiKey: process.env.DEEPSEEK_API_KEY.split(','),
  // Any additional settings or API URL for the services
  // 
  API_URL:  process.env.REACT_APP_BASE_API,
  AWSAccessKey: process.env.AWS_ACCESS_KEY_ID,
  AWSSecretKey: process.env.AWS_SECRET_ACCESS_KEY,
  JWTSecret: process.env.JWT_SECRET,
  JWTEncryptionSecret: process.env.JWT_ENCRYPTION_SECRET,
  MongoURI: process.env.REACT_APP_MONGO_URI,
};
