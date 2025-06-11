const jwt = require('jsonwebtoken');
const { JWTSecret, JWTEncryptionSecret } = require('../../config/config')
const jwtSecret = JWTSecret;
const encryptionKey = JWTEncryptionSecret;
const crypto = require('crypto');
const User = require('./userModel');


const decryptPayload = async (encryptedPayload, secretKey) => {
  const { encryptedData, iv, authTag } = encryptedPayload;

  if (!encryptedData || !iv || !authTag) {
    throw new Error('Invalid encrypted payload structure');
  }

  try {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      Buffer.from(secretKey, 'hex'),
      Buffer.from(iv, 'base64')
    );
  
    decipher.setAuthTag(Buffer.from(authTag, 'base64'));
  
    let decrypted = decipher.update(encryptedData, 'base64', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  } catch (error) {
    console.error('Decryption error:', error.message);
    throw new Error('Failed to decrypt payload');
  }
};


const verifyAndDecryptToken = async (token, jwtSecret, encryptionKey) => {

  try {
    // Verify JWT
    const encryptedPayload = jwt.verify(token, jwtSecret);

    // Decrypt the payload
    const decryptedPayload =   await decryptPayload(encryptedPayload, encryptionKey);

    return decryptedPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};


module.exports = async function(req, res, next) {
  try {
    // Get token from header
    const authHeader = req.header('Authorization');
    
    if (!authHeader) {
      return res.status(401).json({ 
        success: false,
        error: 'Access denied. No token provided.' 
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({ 
        success: false,
        error: 'Access denied. No token provided.' 
      });
    }

    try {
      // Try new JWT format first
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
      
      // Verify user exists and is active
      const user = await User.findById(decoded.userId);
      
      if (!user || !user.isActive) {
        return res.status(401).json({
          success: false,
          error: 'Invalid token or user not found.'
        });
      }

      // Update last login
      user.lastLoginAt = new Date();
      await user.save();

      req.user = user;
      req.userId = user._id;
      next();
      
    } catch (newFormatError) {
      // Fallback to old encrypted format for backward compatibility
      try {
        const { JWTSecret, JWTEncryptionSecret } = require('../../config/config');
        const jwtSecret = JWTSecret;
        const encryptionKey = JWTEncryptionSecret;
        
        // Verify JWT
        const encryptedPayload = jwt.verify(token, jwtSecret);

        // Decrypt the payload
        const decryptedPayload = await decryptPayload(encryptedPayload, encryptionKey);

        // Add user from payload (old format uses 'id' instead of 'userId')
        req.user = { id: decryptedPayload.id };
        next();
        
      } catch (oldFormatError) {
        return res.status(401).json({ 
          success: false,
          error: 'Invalid token.' 
        });
      }
    }

  } catch (err) {
    console.error('Auth middleware error:', err);
    res.status(401).json({ 
      success: false,
      error: 'Token verification failed.' 
    });
  }
};
