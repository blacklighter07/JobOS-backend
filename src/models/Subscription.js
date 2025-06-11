const mongoose = require('mongoose');

const subscriptionSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  plan: {
    type: String,
    enum: ['free', 'premium'],
    default: 'free'
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'cancelled', 'past_due', 'trialing'],
    default: 'inactive'
  },
  stripeCustomerId: String,
  stripeSubscriptionId: String,
  stripePriceId: String,
  currentPeriodStart: Date,
  currentPeriodEnd: Date,
  trialStart: Date,
  trialEnd: Date,
  cancelAt: Date,
  canceledAt: Date,
  endedAt: Date,
  features: {
    maxApplicationsPerDay: {
      type: Number,
      default: 5
    },
    aiResumeOptimization: {
      type: Boolean,
      default: true
    },
    priorityJobMatching: {
      type: Boolean,
      default: false
    },
    advancedAnalytics: {
      type: Boolean,
      default: false
    },
    personalizedJobAlerts: {
      type: Boolean,
      default: false
    },
    coverLetterGeneration: {
      type: Boolean,
      default: false
    },
    interviewPrep: {
      type: Boolean,
      default: false
    },
    dedicatedSupport: {
      type: Boolean,
      default: false
    }
  },
  usage: {
    applicationsThisMonth: {
      type: Number,
      default: 0
    },
    lastResetDate: {
      type: Date,
      default: Date.now
    },
    totalApplications: {
      type: Number,
      default: 0
    },
    resumeOptimizations: {
      type: Number,
      default: 0
    }
  },
  billing: {
    amount: Number, // in cents
    currency: {
      type: String,
      default: 'USD'
    },
    interval: {
      type: String,
      enum: ['month', 'year'],
      default: 'month'
    },
    nextBillingDate: Date,
    lastPaymentDate: Date,
    lastPaymentAmount: Number,
    failedPayments: {
      type: Number,
      default: 0
    }
  },
  promoCode: {
    code: String,
    discountPercent: Number,
    validUntil: Date
  },
  metadata: {
    source: String, // where the subscription came from
    campaignId: String,
    referralCode: String
  }
}, {
  timestamps: true
});

// Indexes for better query performance
subscriptionSchema.index({ userId: 1 });
subscriptionSchema.index({ stripeCustomerId: 1 });
subscriptionSchema.index({ stripeSubscriptionId: 1 });
subscriptionSchema.index({ plan: 1, status: 1 });

// Method to check if subscription is active
subscriptionSchema.methods.isActive = function() {
  return this.status === 'active' || this.status === 'trialing';
};

// Method to check if user is in trial period
subscriptionSchema.methods.isInTrial = function() {
  return this.status === 'trialing' && this.trialEnd > new Date();
};

// Method to check if subscription has expired
subscriptionSchema.methods.hasExpired = function() {
  return this.currentPeriodEnd < new Date();
};

// Method to get days remaining in current period
subscriptionSchema.methods.getDaysRemaining = function() {
  if (!this.currentPeriodEnd) return 0;
  const now = new Date();
  const diffTime = this.currentPeriodEnd - now;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
};

// Method to check if user can apply to more jobs today
subscriptionSchema.methods.canApplyToMoreJobs = function() {
  const now = new Date();
  const lastReset = new Date(this.usage.lastResetDate);
  
  // Check if we need to reset monthly counter
  if (now.getMonth() !== lastReset.getMonth() || now.getFullYear() !== lastReset.getFullYear()) {
    this.usage.applicationsThisMonth = 0;
    this.usage.lastResetDate = now;
    this.save();
  }
  
  return this.usage.applicationsThisMonth < this.features.maxApplicationsPerDay * 30; // Monthly limit
};

// Method to increment application usage
subscriptionSchema.methods.incrementUsage = function(type = 'application') {
  switch (type) {
    case 'application':
      this.usage.applicationsThisMonth += 1;
      this.usage.totalApplications += 1;
      break;
    case 'optimization':
      this.usage.resumeOptimizations += 1;
      break;
  }
  return this.save();
};

// Method to upgrade subscription features based on plan
subscriptionSchema.methods.updateFeatures = function() {
  if (this.plan === 'premium' && this.isActive()) {
    this.features = {
      maxApplicationsPerDay: 50,
      aiResumeOptimization: true,
      priorityJobMatching: true,
      advancedAnalytics: true,
      personalizedJobAlerts: true,
      coverLetterGeneration: true,
      interviewPrep: true,
      dedicatedSupport: true
    };
  } else {
    // Free plan features
    this.features = {
      maxApplicationsPerDay: 5,
      aiResumeOptimization: true,
      priorityJobMatching: false,
      advancedAnalytics: false,
      personalizedJobAlerts: false,
      coverLetterGeneration: false,
      interviewPrep: false,
      dedicatedSupport: false
    };
  }
  return this.save();
};

// Method to handle subscription cancellation
subscriptionSchema.methods.cancel = function(cancelAt = null) {
  this.status = 'cancelled';
  this.canceledAt = new Date();
  if (cancelAt) {
    this.cancelAt = cancelAt;
  }
  return this.save();
};

// Static method to get subscription by user ID
subscriptionSchema.statics.findByUserId = function(userId) {
  return this.findOne({ userId });
};

// Static method to get active subscriptions
subscriptionSchema.statics.getActiveSubscriptions = function() {
  return this.find({ 
    status: { $in: ['active', 'trialing'] },
    currentPeriodEnd: { $gt: new Date() }
  });
};

// Static method to get subscriptions that need billing update
subscriptionSchema.statics.getNeedsBillingUpdate = function() {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return this.find({
    status: 'active',
    'billing.nextBillingDate': { $lte: tomorrow }
  });
};

module.exports = mongoose.model('Subscription', subscriptionSchema); 