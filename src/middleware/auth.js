const jwt = require('jsonwebtoken');
const User = require('../../services/authentication/userModel');

const auth = async (req, res, next) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Access denied. No token provided.'
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
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
  } catch (error) {
    res.status(401).json({
      success: false,
      error: 'Invalid token.'
    });
  }
};

// Middleware to check premium subscription
const requirePremium = async (req, res, next) => {
  try {
    if (!req.user.hasPremiumAccess()) {
      return res.status(403).json({
        success: false,
        error: 'Premium subscription required for this feature.'
      });
    }
    next();
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Error checking subscription status.'
    });
  }
};

module.exports = { auth, requirePremium }; 