const express = require("express");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const jwksClient = require('jwks-rsa');
const User = require("./userModel");
const router = express.Router();

// Initialize Google OAuth2 client
const client = new OAuth2Client();

// Initialize JWKS client for Apple
const appleJwksClient = jwksClient({
  jwksUri: 'https://appleid.apple.com/auth/keys',
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5
});

// JWT secret from environment variables
const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-jwt-key";

// Verify Google ID token and create/login user
router.post("/google/signin", async (req, res) => {
  try {
    const { accessToken } = req.body;

    if (!accessToken) {
      return res.status(400).json({
        success: false,
        error: "Access token is required",
      });
    }

    // Verify the Google access token
    const response = await fetch(`https://www.googleapis.com/oauth2/v2/userinfo?access_token=${accessToken}`);
    const googleUser = await response.json();

    if (!googleUser.email) {
      return res.status(400).json({
        success: false,
        error: "Failed to get user information from Google",
      });
    }

    // Check if user already exists
    let user = await User.findOne({ email: googleUser.email });

    if (!user) {
      // Create new user
      const username = await generateUsername(googleUser.name || googleUser.email);
      const [firstName, ...lastNameParts] = (googleUser.name || "").split(' ');
      
      user = new User({
        googleId: googleUser.id,
        username: username,
        email: googleUser.email,
        firstName: firstName || '',
        lastName: lastNameParts.join(' ') || '',
        profilePicture: googleUser.picture || null,
        onboardingCompleted: false, // New users need onboarding
        isActive: true,
        emailVerified: true,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });

      await user.save();
      console.log("New user created:", user.email);
    } else {
      // Update existing user's last login
      user.lastLoginAt = new Date();
      if (!user.googleId && googleUser.id) {
        user.googleId = googleUser.id;
      }
      if (!user.profilePicture && googleUser.picture) {
        user.profilePicture = googleUser.picture;
      }
      
      // For existing users who have used the app before, mark onboarding as completed
      // This handles users who were created before the onboarding system was implemented
      if (user.onboardingCompleted === undefined || user.onboardingCompleted === null) {
        user.onboardingCompleted = true;
        console.log("Marked existing user onboarding as completed:", user.email);
      }
      
      await user.save();
      console.log("Existing user logged in:", user.email);
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Authentication successful",
      data: {
        user: {
          _id: user._id,
          googleId: user.googleId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          linkedin: user.linkedin,
          github: user.github,
          username: user.username,
          profilePicture: user.profilePicture,
          onboardingCompleted: user.onboardingCompleted,
          isActive: user.isActive,
          preferences: {
            domains: [],
            salaryRange: { min: 0, max: 200000 },
            experience: 'mid',
            specificSkills: [],
            jobTypes: ['full-time'],
            locations: [],
            remotePreference: 'any'
          },
          subscription: {
            plan: 'free',
            expiresAt: null,
            trialUsed: false
          },
          applicationSettings: {
            autoApply: false,
            maxApplicationsPerDay: 10,
            minJobMatchScore: 70
          },
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          updatedAt: user.updatedAt || user.lastLoginAt,
        },
        token: token,
      },
    });

  } catch (error) {
    console.error("Google authentication error:", error);
    res.status(500).json({
      success: false,
      error: "Authentication failed. Please try again.",
    });
  }
});

// Verify Apple ID token and create/login user
router.post("/apple/signin", async (req, res) => {
  try {
    const { identityToken, user: userIdentifier, firstName, lastName } = req.body;

    if (!identityToken) {
      return res.status(400).json({
        success: false,
        error: "Identity token is required",
      });
    }

    // Verify the Apple ID token
    const decodedToken = jwt.decode(identityToken, { complete: true });
    if (!decodedToken) {
      return res.status(400).json({
        success: false,
        error: "Invalid identity token",
      });
    }

    // Get the key ID from the token header
    const kid = decodedToken.header.kid;

    // Get the public key from Apple's JWKS
    const key = await appleJwksClient.getSigningKey(kid);
    const publicKey = key.getPublicKey();

    // Verify the token
    const verifiedToken = jwt.verify(identityToken, publicKey, {
      algorithms: ['RS256'],
      audience: 'com.jobos.mobile', // app's bundle ID
      issuer: 'https://appleid.apple.com',
    });

    // Extract user information
    const { sub: appleId, email } = verifiedToken;

    // Check if user already exists
    let user = await User.findOne({ appleId });

    if (!user) {
      // Create new user
      // Extract username from email (part before @) or use a default
      const emailUsername = email ? email.split('@')[0] : 'appleuser';
      const username = await generateUsername(emailUsername);
      
      user = new User({
        appleId,
        username,
        email,
        firstName: firstName || '',
        lastName: lastName || '',
        onboardingCompleted: false,
        isActive: true,
        emailVerified: true,
        createdAt: new Date(),
        lastLoginAt: new Date(),
      });

      await user.save();
      console.log("New user created with Apple Sign In:", user.email, `Name: ${firstName} ${lastName}`);
    } else {
      // Update existing user's last login and name if provided
      user.lastLoginAt = new Date();
      
      // Update name if provided and not already set
      if (firstName && !user.firstName) {
        user.firstName = firstName;
      }
      if (lastName && !user.lastName) {
        user.lastName = lastName;
      }
      
      await user.save();
      console.log("Existing user logged in with Apple Sign In:", user.email);
    }

    // Generate JWT token
    const token = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      message: "Authentication successful",
      data: {
        user: {
          _id: user._id,
          appleId: user.appleId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          linkedin: user.linkedin,
          github: user.github,
          username: user.username,
          profilePicture: user.profilePicture,
          onboardingCompleted: user.onboardingCompleted,
          isActive: user.isActive,
          preferences: {
            domains: [],
            salaryRange: { min: 0, max: 200000 },
            experience: 'mid',
            specificSkills: [],
            jobTypes: ['full-time'],
            locations: [],
            remotePreference: 'any'
          },
          subscription: {
            plan: 'free',
            expiresAt: null,
            trialUsed: false
          },
          applicationSettings: {
            autoApply: false,
            maxApplicationsPerDay: 10,
            minJobMatchScore: 70
          },
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          updatedAt: user.updatedAt || user.lastLoginAt,
        },
        token: token,
      },
    });

  } catch (error) {
    console.error("Apple authentication error:", error);
    res.status(500).json({
      success: false,
      error: "Authentication failed. Please try again.",
    });
  }
});

// Refresh token endpoint
router.post("/refresh", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: "User not found",
      });
    }

    // Generate new token
    const newToken = jwt.sign(
      { 
        userId: user._id, 
        email: user.email,
        username: user.username 
      },
      JWT_SECRET,
      { expiresIn: "30d" }
    );

    res.json({
      success: true,
      data: {
        token: newToken,
        user: {
          _id: user._id,
          googleId: user.googleId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          linkedin: user.linkedin,
          github: user.github,
          username: user.username,
          profilePicture: user.profilePicture,
          onboardingCompleted: user.onboardingCompleted,
          isActive: user.isActive,
          preferences: {
            domains: [],
            salaryRange: { min: 0, max: 200000 },
            experience: 'mid',
            specificSkills: [],
            jobTypes: ['full-time'],
            locations: [],
            remotePreference: 'any'
          },
          subscription: {
            plan: 'free',
            expiresAt: null,
            trialUsed: false
          },
          applicationSettings: {
            autoApply: false,
            maxApplicationsPerDay: 10,
            minJobMatchScore: 70
          },
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          updatedAt: user.updatedAt || user.lastLoginAt,
        },
      },
    });

  } catch (error) {
    console.error("Token refresh error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
});

// Verify token endpoint
router.post("/verify", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    res.json({
      success: true,
      data: {
        user: {
          _id: user._id,
          googleId: user.googleId,
          email: user.email,
          firstName: user.firstName,
          lastName: user.lastName,
          phone: user.phone,
          linkedin: user.linkedin,
          github: user.github,
          username: user.username,
          profilePicture: user.profilePicture,
          onboardingCompleted: user.onboardingCompleted,
          isActive: user.isActive,
          preferences: {
            domains: [],
            salaryRange: { min: 0, max: 200000 },
            experience: 'mid',
            specificSkills: [],
            jobTypes: ['full-time'],
            locations: [],
            remotePreference: 'any'
          },
          subscription: {
            plan: 'free',
            expiresAt: null,
            trialUsed: false
          },
          applicationSettings: {
            autoApply: false,
            maxApplicationsPerDay: 10,
            minJobMatchScore: 70
          },
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
          updatedAt: user.updatedAt || user.lastLoginAt,
        },
      },
    });

  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({
      success: false,
      error: "Invalid or expired token",
    });
  }
});

// Sign out endpoint
router.post("/signout", async (req, res) => {
  try {
    // In a production app, you might want to blacklist the token
    // For now, we'll just return success as the client will remove the token
    res.json({
      success: true,
      message: "Successfully signed out",
    });
  } catch (error) {
    console.error("Sign out error:", error);
    res.status(500).json({
      success: false,
      error: "Sign out failed",
    });
  }
});

// Update profile endpoint
router.put("/profile", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    // Update user with provided data
    const allowedUpdates = ['firstName', 'lastName', 'onboardingCompleted', 'preferences', 'applicationSettings'];
    const updates = {};
    
    Object.keys(req.body).forEach(key => {
      if (allowedUpdates.includes(key)) {
        updates[key] = req.body[key];
      }
    });

    Object.assign(user, updates);
    user.updatedAt = new Date();
    await user.save();

    console.log("User profile updated:", user.email, updates);

    res.json({
      success: true,
      message: "Profile updated successfully",
      data: {
        _id: user._id,
        googleId: user.googleId,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        profilePicture: user.profilePicture,
        onboardingCompleted: user.onboardingCompleted,
        isActive: user.isActive,
        preferences: {
          domains: [],
          salaryRange: { min: 0, max: 200000 },
          experience: 'mid',
          specificSkills: [],
          jobTypes: ['full-time'],
          locations: [],
          remotePreference: 'any'
        },
        subscription: {
          plan: 'free',
          expiresAt: null,
          trialUsed: false
        },
        applicationSettings: {
          autoApply: false,
          maxApplicationsPerDay: 10,
          minJobMatchScore: 70
        },
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt,
        updatedAt: user.updatedAt,
      },
    });

  } catch (error) {
    console.error("Profile update error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to update profile",
    });
  }
});

// Delete account endpoint
router.delete("/account", async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: "No token provided",
      });
    }

    const token = authHeader.substring(7);
    const decoded = jwt.verify(token, JWT_SECRET);
    
    const user = await User.findById(decoded.userId);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: "User not found or inactive",
      });
    }

    // Import Resume model
    const Resume = require('../../src/models/Resume');

    // First, find all resumes associated with the user
    const userResumes = await Resume.find({ userId: user._id });
    console.log(`Found ${userResumes.length} resumes for user ${user.email}`);

    // Delete all user resumes
    const deleteResult = await Resume.deleteMany({ userId: user._id });
    console.log(`Deleted ${deleteResult.deletedCount} resumes for user ${user.email}`);

    // Delete the user account
    await User.findByIdAndDelete(user._id);
    console.log(`Deleted user account: ${user.email}`);

    res.json({
      success: true,
      message: "Account and all associated data deleted successfully",
      data: {
        deletedResumes: deleteResult.deletedCount,
        deletedUser: true
      }
    });

  } catch (error) {
    console.error("Account deletion error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to delete account. Please try again.",
    });
  }
});

// Helper function to generate username
const generateUsername = async (fullName) => {
  if (!fullName) return `user_${Date.now()}`.substring(0, 20);

  let username = fullName
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .replace(/\s+/g, "_");

  // Truncate to maximum 15 characters to leave room for uniqueness suffix
  username = username.substring(0, 15);

  // Check if username exists and make it unique
  let finalUsername = username;
  let counter = 1;
  
  while (await User.findOne({ username: finalUsername })) {
    const suffix = `_${counter}`;
    // Ensure the final username doesn't exceed 20 characters
    const maxBaseLength = 20 - suffix.length;
    finalUsername = username.substring(0, maxBaseLength) + suffix;
    counter++;
  }

  return finalUsername;
};

module.exports = router; 