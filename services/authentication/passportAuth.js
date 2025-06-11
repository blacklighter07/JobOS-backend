const express = require("express");
const passport = require('passport');
const jwt = require('jsonwebtoken');
const { API_URL, JWTSecret , JWTEncryptionSecret } = require('../../config/config');
const jwtSecret = JWTSecret;
const encryptionKey = JWTEncryptionSecret;
const router = express.Router();
const crypto = require('crypto');

const encryptPayload = (payload, secretKey) => {
  const iv = crypto.randomBytes(16); // Initialization vector
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(secretKey, 'hex'), iv);

  let encrypted = cipher.update(JSON.stringify(payload), 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag().toString('base64');

  return {
    encryptedData: encrypted,
    iv: iv.toString('base64'),
    authTag,
  };
};

// Generate JWT token for authenticated user
const generateToken = (user) => {
  const payload = {
    userId: user._id,
    email: user.email,
    username: user.username
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key', {
    expiresIn: '30d'
  });
};

// Redirect to Google's OAuth 2.0 login page
router.get("/auth/google", (req, res, next) => {
  const platform = req.query.platform || "web";
  const state = JSON.stringify({ platform, returnUrl: req.query.returnUrl });
  
  passport.authenticate("google", {
    scope: ["profile", "email"],
    state: state,
    accessType: 'offline',
    prompt: 'consent'
  })(req, res, next);
});

// Handle callback from Google
router.get(
  "/auth/google/callback",
  passport.authenticate("google", { failureRedirect: "/login" }),
  async (req, res) => {
    try {
      const user = req.user;
      
      if (!user) {
        return res.redirect(`${getRedirectUrl('web')}/auth/error?error=authentication_failed`);
      }

      // Generate JWT token
      const token = generateToken(user);
      
      // Parse state to get platform info
      let platform = 'web';
      let returnUrl = null;
      
      try {
        const state = JSON.parse(req.query.state || '{}');
        platform = state.platform || 'web';
        returnUrl = state.returnUrl;
      } catch (e) {
        // Fallback for old format
        platform = req.query.state || 'web';
      }

      const redirectUrl = getRedirectUrl(platform);
      
      // For mobile platforms, use a custom scheme or localhost
      if (platform === 'mobile' || platform === 'expo') {
        // For Expo/React Native, redirect to a deep link or localhost
        res.redirect(`exp://192.168.1.100:19000/--/auth/success?token=${token}&onboardingCompleted=${user.onboardingCompleted}`);
      } else if (platform === 'android') {
        res.redirect(`http://localhost:19006/auth/success?token=${token}&onboardingCompleted=${user.onboardingCompleted}`);
      } else {
        // For web platform
        const finalUrl = returnUrl || `${redirectUrl}/auth/success`;
        res.redirect(`${finalUrl}?token=${token}&onboardingCompleted=${user.onboardingCompleted}`);
      }
      
    } catch (error) {
      console.error('OAuth callback error:', error);
      res.redirect(`${getRedirectUrl('web')}/auth/error?error=callback_failed`);
    }
  }
);

// Helper function to get redirect URL based on platform
function getRedirectUrl(platform) {
  const baseUrl = process.env.NODE_ENV === 'production' 
    ? 'https://smartchat.tech' 
    : 'http://localhost:3000';
    
  switch (platform) {
    case 'mobile':
    case 'expo':
      return 'exp://192.168.1.100:19000';
    case 'android':
      return 'http://localhost:19006';
    default:
      return baseUrl;
  }
}

// Mobile-specific auth endpoint for direct token exchange
router.post("/auth/google/mobile", async (req, res) => {
  try {
    const { googleToken, userInfo } = req.body;
    
    if (!googleToken || !userInfo) {
      return res.status(400).json({
        success: false,
        error: 'Google token and user info required'
      });
    }

    // Verify Google token (you might want to add Google token verification here)
    
    // Find or create user
    let user = await User.findOne({ 
      $or: [
        { googleId: userInfo.id },
        { email: userInfo.email }
      ]
    });

    if (!user) {
      const username = await generateUsername(userInfo.name);
      const [firstName, ...lastNameParts] = userInfo.name.split(' ');
      
      user = new User({
        googleId: userInfo.id,
        username: username,
        email: userInfo.email,
        firstName: firstName || '',
        lastName: lastNameParts.join(' ') || '',
        profilePicture: userInfo.picture || null,
        onboardingCompleted: false,
        isActive: true
      });
      
      await user.save();
    } else if (!user.googleId) {
      // Link Google account to existing user
      user.googleId = userInfo.id;
      await user.save();
    }

    // Generate JWT token
    const token = generateToken(user);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        profilePicture: user.profilePicture,
        onboardingCompleted: user.onboardingCompleted
      }
    });

  } catch (error) {
    console.error('Mobile Google auth error:', error);
    res.status(500).json({
      success: false,
      error: 'Authentication failed'
    });
  }
});

async function generateUsername(fullName) {
  if (!fullName) return "";

  const User = require('./userModel');
  
  let username = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_");

  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeString = `${hours}:${minutes}`;

  const existingUser = await User.findOne({ username });

  if (existingUser) {
    username = `${username}_${timeString}`;
  }

  return username;
}

module.exports = router;
