// routes/user.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./userModel');
const Feedback = require('./feedbackModel');

const auth = require('./auth');

// Generate JWT token
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

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, username } = req.body;

    // Validation
    if (!email || !password || !firstName) {
      return res.status(400).json({
        success: false,
        error: 'Email, password, and first name are required'
      });
    }

    // Check if user already exists
    const existingUser = await User.findOne({ 
      $or: [{ email }, { username: username || email }] 
    });
    
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email or username'
      });
    }

    // Hash password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate username if not provided
    const finalUsername = username || await generateUsername(`${firstName} ${lastName}`);

    // Create new user
    const user = new User({
      email,
      password: hashedPassword,
      firstName,
      lastName: lastName || '',
      username: finalUsername,
      onboardingCompleted: false,
      isActive: true
    });

    await user.save();

    // Generate token
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
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
    console.error('Registration error:', error);
    res.status(500).json({
      success: false,
      error: 'Registration failed'
    });
  }
});

// Login user
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        success: false,
        error: 'Email and password are required'
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if user has a password (might be Google-only user)
    if (!user.password) {
      return res.status(401).json({
        success: false,
        error: 'Please sign in with Google'
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Update last login
    user.lastLoginAt = new Date();
    await user.save();

    // Generate token
    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful',
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
    console.error('Login error:', error);
    res.status(500).json({
      success: false,
      error: 'Login failed'
    });
  }
});

// Verify token and get current user
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.userId).select('-password');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        profilePicture: user.profilePicture,
        onboardingCompleted: user.onboardingCompleted,
        preferences: user.preferences,
        applicationSettings: user.applicationSettings,
        subscription: user.subscription
      }
    });

  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get user'
    });
  }
});

// Update user profile
router.put('/profile', auth, async (req, res) => {
  try {
    const { firstName, lastName, profilePicture } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update fields
    if (firstName) user.firstName = firstName;
    if (lastName) user.lastName = lastName;
    if (profilePicture) user.profilePicture = profilePicture;

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
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
    console.error('Update profile error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
});

// Complete onboarding
router.post('/complete-onboarding', auth, async (req, res) => {
  try {
    const { preferences, applicationSettings } = req.body;
    
    const user = await User.findById(req.userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update user with onboarding data
    user.onboardingCompleted = true;
    if (preferences) user.preferences = { ...user.preferences, ...preferences };
    if (applicationSettings) user.applicationSettings = { ...user.applicationSettings, ...applicationSettings };

    await user.save();

    res.json({
      success: true,
      message: 'Onboarding completed successfully',
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        username: user.username,
        profilePicture: user.profilePicture,
        onboardingCompleted: user.onboardingCompleted,
        preferences: user.preferences,
        applicationSettings: user.applicationSettings
      }
    });

  } catch (error) {
    console.error('Complete onboarding error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete onboarding'
    });
  }
});

// Test endpoint to verify authentication
router.get('/test-auth', auth, async (req, res) => {
  res.json({
    success: true,
    message: 'Authentication working!',
    user: {
      id: req.user._id,
      email: req.user.email,
      firstName: req.user.firstName,
      lastName: req.user.lastName
    }
  });
});

// Generate username helper
async function generateUsername(fullName) {
  if (!fullName) return "";

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

router.get('/profile', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('username email _id');
    if (!user) {
      return res.status(404).json({ msg: 'User not found' });
    }
    res.json(user);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});


router.post("/feedback", async (req, res) => {
  try {
    const { type, text } = req.body;

    if (!text.trim()) {
      return res.status(400).json({ error: "Feedback cannot be empty." });
    }

    const newFeedback = new Feedback({ type, text });
    await newFeedback.save();

    res.status(201).json({ message: "Feedback submitted successfully!" });
  } catch (error) {
    console.error("Feedback error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

router.get('/:userId/liked-bots', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate('likedBots'); // Populate likedBots with bot details

    if (!user) {
      return res.status(404).send('User not found');
    }

    res.json(user.likedBots);
  } catch (error) {
    console.error('Error fetching liked bots:', error);
    res.status(500).send('Internal server error');
  }
});

// Route to get saved bots by a user
router.get('/:userId/saved-bots', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).populate('savedBots'); // Populate savedBots with bot details

    if (!user) {
      return res.status(404).send('User not found');
    }

    res.json(user.savedBots);
  } catch (error) {
    console.error('Error fetching saved bots:', error);
    res.status(500).send('Internal server error');
  }
});

module.exports = router;