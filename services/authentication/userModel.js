const mongoose = require("mongoose");
const Schema = mongoose.Schema;

// Schema for 'users' collection
const UserSchema = new Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 3,
    maxlength: 20,
  },
  email: { 
    type: String, 
    required: true, 
    unique: true, 
    trim: true 
  },
  password: {
    type: String,
    // Password is optional since users can sign up with Google OAuth
    required: false,
    minlength: 6
  },
  firstName: {
    type: String,
    trim: true
  },
  lastName: {
    type: String,
    trim: true
  },
  phone: {
    type: String,
    trim: true
  },
  profilePicture: {
    type: String // URL to profile picture
  },
  linkedin: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        try {
          const url = new URL(v);
          return url.hostname.includes('linkedin.com');
        } catch {
          return false;
        }
      },
      message: 'Please provide a valid LinkedIn URL'
    }
  },
  github: {
    type: String,
    trim: true,
    validate: {
      validator: function(v) {
        if (!v) return true; // Optional field
        try {
          const url = new URL(v);
          return url.hostname.includes('github.com');
        } catch {
          return false;
        }
      },
      message: 'Please provide a valid GitHub URL'
    }
  },
  googleId: {
    type: String, // Unique Google ID for Google-authenticated users
    unique: true,
    sparse: true, // Allows this field to be optional
  },
  appleId: String,
  fcmToken: {
    type: String, // Firebase Cloud Messaging token for push notifications
    sparse: true
  },
  
  // Job OS specific fields
  preferences: {
    domains: [{
      type: String,
      enum: ['technology', 'finance', 'healthcare', 'marketing', 'sales', 'design', 'operations', 'legal', 'hr', 'consulting', 'other']
    }],
    salaryRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 }
    },
    experience: {
      type: String,
      enum: ['entry', 'junior', 'mid', 'senior', 'lead', 'executive']
    },
    specificSkills: [String],
    jobTypes: [{
      type: String,
      enum: ['full-time', 'part-time', 'contract', 'freelance', 'internship']
    }],
    locations: [String],
    remotePreference: {
      type: String,
      enum: ['remote', 'hybrid', 'onsite', 'any'],
      default: 'any'
    }
  },
  
  applicationSettings: {
    autoApply: { type: Boolean, default: false },
    maxApplicationsPerDay: { type: Number, default: 5 },
    minJobMatchScore: { type: Number, default: 70 },
    resumeAutoOptimize: { type: Boolean, default: true },
  },
  
  subscription: {
    plan: {
      type: String,
      enum: ['free', 'premium'],
      default: 'free'
    },
    status: {
      type: String,
      enum: ['active', 'inactive', 'cancelled'],
      default: 'active'
    },
    startDate: Date,
    endDate: Date,
    stripeCustomerId: String,
    stripeSubscriptionId: String
  },
  
  notificationSettings: {
    pushNotifications: { type: Boolean, default: true },
    emailAlerts: { type: Boolean, default: true },
    jobRecommendations: { type: Boolean, default: true },
    applicationUpdates: { type: Boolean, default: true },
    weeklyReport: { type: Boolean, default: true }
  },
  
  onboardingCompleted: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true },
  emailVerified: {
    type: Boolean,
    default: false,
  },
  lastLoginAt: Date,
  
  // Legacy fields
  likedBots: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bot' }], 
  savedBots: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Bot' }],

  date: {
    type: Date,
    default: Date.now,
  },
}, {
  collection: 'users',
  timestamps: true
});

// Instance methods
UserSchema.methods.hasPremiumAccess = function() {
  // Made free for all users - no premium subscription required
  return true;
};

UserSchema.methods.getFullName = function() {
  return `${this.firstName || ''} ${this.lastName || ''}`.trim();
};

UserSchema.methods.updateLastLogin = function() {
  this.lastLoginAt = new Date();
  return this.save();
};

// Static methods
UserSchema.statics.findByEmail = function(email) {
  return this.findOne({ email: email.toLowerCase() });
};

UserSchema.statics.findActiveUsers = function() {
  return this.find({ isActive: true });
};

// Update the updatedAt field before saving
UserSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

const User = mongoose.model("User", UserSchema);

module.exports = User;
