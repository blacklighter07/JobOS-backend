const User = require('../../services/authentication/userModel');

// Get user profile
const getProfile = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId).select('-password');
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      data: user
    });

  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch profile'
    });
  }
};

// Update user profile
const updateProfile = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      firstName,
      lastName,
      email,
      phone,
      linkedin,
      github,
      profilePicture
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if email is being changed and if it's already taken
    if (email && email !== user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          success: false,
          error: 'Email is already in use by another account'
        });
      }
      user.email = email;
    }

    // Validate LinkedIn URL if provided
    if (linkedin !== undefined && linkedin.trim()) {
      try {
        const url = new URL(linkedin);
        if (!url.hostname.includes('linkedin.com')) {
          return res.status(400).json({
            success: false,
            error: 'Please provide a valid LinkedIn URL'
          });
        }
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid LinkedIn URL'
        });
      }
    }

    // Validate GitHub URL if provided
    if (github !== undefined && github.trim()) {
      try {
        const url = new URL(github);
        if (!url.hostname.includes('github.com')) {
          return res.status(400).json({
            success: false,
            error: 'Please provide a valid GitHub URL'
          });
        }
      } catch {
        return res.status(400).json({
          success: false,
          error: 'Please provide a valid GitHub URL'
        });
      }
    }

    // Update profile fields
    if (firstName !== undefined) user.firstName = firstName;
    if (lastName !== undefined) user.lastName = lastName;
    if (phone !== undefined) user.phone = phone;
    if (linkedin !== undefined) user.linkedin = linkedin;
    if (github !== undefined) user.github = github;
    if (profilePicture !== undefined) user.profilePicture = profilePicture;

    await user.save();

    res.json({
      success: true,
      message: 'Profile updated successfully',
      data: {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        phone: user.phone,
        linkedin: user.linkedin,
        github: user.github,
        profilePicture: user.profilePicture
      }
    });

  } catch (error) {
    console.error('Error updating profile:', error);
    
    // Handle MongoDB validation errors
    if (error.name === 'ValidationError') {
      const firstError = Object.values(error.errors)[0];
      return res.status(400).json({
        success: false,
        error: firstError.message
      });
    }
    
    res.status(500).json({
      success: false,
      error: 'Failed to update profile'
    });
  }
};

// Update user preferences
const updatePreferences = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      domains,
      salaryRange,
      experience,
      specificSkills,
      jobTypes,
      locations,
      remotePreference
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update preferences
    const preferences = user.preferences;

    if (domains !== undefined) preferences.domains = domains;
    if (salaryRange) {
      if (salaryRange.min !== undefined) preferences.salaryRange.min = salaryRange.min;
      if (salaryRange.max !== undefined) preferences.salaryRange.max = salaryRange.max;
    }
    if (experience) preferences.experience = experience;
    if (specificSkills !== undefined) preferences.specificSkills = specificSkills;
    if (jobTypes !== undefined) preferences.jobTypes = jobTypes;
    if (locations !== undefined) preferences.locations = locations;
    if (remotePreference) preferences.remotePreference = remotePreference;

    user.preferences = preferences;
    await user.save();

    res.json({
      success: true,
      message: 'Preferences updated successfully',
      data: user.preferences
    });

  } catch (error) {
    console.error('Error updating preferences:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update preferences'
    });
  }
};

// Update application settings
const updateSettings = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      autoApply,
      maxApplicationsPerDay,
      minJobMatchScore
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Validate premium features
    if (!user.hasPremiumAccess()) {
      if (maxApplicationsPerDay && maxApplicationsPerDay > 5) {
        return res.status(403).json({
          success: false,
          error: 'Premium subscription required for more than 5 applications per day'
        });
      }
    }

    // Update application settings
    const settings = user.applicationSettings;

    if (autoApply !== undefined) settings.autoApply = autoApply;
    if (maxApplicationsPerDay !== undefined) {
      // Validate limits
      const maxLimit = user.hasPremiumAccess() ? 50 : 5;
      if (maxApplicationsPerDay > maxLimit) {
        return res.status(400).json({
          success: false,
          error: `Maximum ${maxLimit} applications per day allowed for your subscription plan`
        });
      }
      settings.maxApplicationsPerDay = maxApplicationsPerDay;
    }
    if (minJobMatchScore !== undefined) {
      // Validate score range
      if (minJobMatchScore < 50 || minJobMatchScore > 100) {
        return res.status(400).json({
          success: false,
          error: 'Minimum job match score must be between 50 and 100'
        });
      }
      settings.minJobMatchScore = minJobMatchScore;
    }

    user.applicationSettings = settings;
    await user.save();

    res.json({
      success: true,
      message: 'Application settings updated successfully',
      data: user.applicationSettings
    });

  } catch (error) {
    console.error('Error updating settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update settings'
    });
  }
};

// Complete onboarding
const completeOnboarding = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    user.onboardingCompleted = true;
    await user.save();

    res.json({
      success: true,
      message: 'Onboarding completed successfully'
    });

  } catch (error) {
    console.error('Error completing onboarding:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete onboarding'
    });
  }
};

// Update notification settings
const updateNotificationSettings = async (req, res) => {
  try {
    const userId = req.userId;
    const {
      pushNotifications,
      emailAlerts,
      jobRecommendations,
      applicationUpdates,
      weeklyReport
    } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Initialize notification settings if not exist
    if (!user.notificationSettings) {
      user.notificationSettings = {};
    }

    // Update notification preferences
    if (pushNotifications !== undefined) user.notificationSettings.pushNotifications = pushNotifications;
    if (emailAlerts !== undefined) user.notificationSettings.emailAlerts = emailAlerts;
    if (jobRecommendations !== undefined) user.notificationSettings.jobRecommendations = jobRecommendations;
    if (applicationUpdates !== undefined) user.notificationSettings.applicationUpdates = applicationUpdates;
    if (weeklyReport !== undefined) user.notificationSettings.weeklyReport = weeklyReport;

    await user.save();

    res.json({
      success: true,
      message: 'Notification settings updated successfully',
      data: user.notificationSettings
    });

  } catch (error) {
    console.error('Error updating notification settings:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update notification settings'
    });
  }
};

// Delete user account
const deleteAccount = async (req, res) => {
  try {
    const userId = req.userId;
    const { confirmPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Additional confirmation could be added here
    // For now, we'll soft delete by setting isActive to false
    user.isActive = false;
    user.deletedAt = new Date();
    await user.save();

    res.json({
      success: true,
      message: 'Account deleted successfully'
    });

  } catch (error) {
    console.error('Error deleting account:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete account'
    });
  }
};

// Get account statistics
const getAccountStats = async (req, res) => {
  try {
    const userId = req.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Calculate account age
    const accountAge = Math.floor((new Date() - user.createdAt) / (1000 * 60 * 60 * 24));

    // Get application count (this would need to be imported from JobApplication)
    // For now, we'll return basic stats
    const stats = {
      accountAge,
      memberSince: user.createdAt,
      lastLogin: user.lastLoginAt,
      subscriptionPlan: user.subscription.plan,
      onboardingCompleted: user.onboardingCompleted,
      profileCompleteness: calculateProfileCompleteness(user)
    };

    res.json({
      success: true,
      data: stats
    });

  } catch (error) {
    console.error('Error fetching account stats:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch account statistics'
    });
  }
};

// Helper function to calculate profile completeness
const calculateProfileCompleteness = (user) => {
  let completeness = 0;
  const totalFields = 13; // Updated to include new fields

  // Basic profile fields
  if (user.firstName) completeness++;
  if (user.lastName) completeness++;
  if (user.email) completeness++;
  if (user.phone) completeness++;
  if (user.linkedin) completeness++;
  if (user.github) completeness++;
  if (user.profilePicture) completeness++;
  
  // Preferences fields
  if (user.preferences.domains && user.preferences.domains.length > 0) completeness++;
  if (user.preferences.experience) completeness++;
  if (user.preferences.specificSkills && user.preferences.specificSkills.length > 0) completeness++;
  if (user.preferences.jobTypes && user.preferences.jobTypes.length > 0) completeness++;
  if (user.preferences.salaryRange.min > 0) completeness++;
  if (user.preferences.remotePreference) completeness++;

  return Math.round((completeness / totalFields) * 100);
};

module.exports = {
  getProfile,
  updateProfile,
  updatePreferences,
  updateSettings,
  completeOnboarding,
  updateNotificationSettings,
  deleteAccount,
  getAccountStats
}; 