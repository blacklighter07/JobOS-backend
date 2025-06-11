const mongoose = require('mongoose');

const resumeVersionSchema = new mongoose.Schema({
  content: {
    type: String,
    required: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    default: null
  },
  tailoredFor: {
    type: String,
    default: null
  },
  pdfUrl: String,
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const resumeSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  originalContent: {
    type: String,
    required: true
  },
  markdownContent: {
    type: String,
    required: true
  },
  versions: [resumeVersionSchema],
  metadata: {
    skills: [String],
    experience: {
      totalYears: Number,
      positions: [{
        title: String,
        company: String,
        duration: String,
        description: String
      }]
    },
    education: [{
      degree: String,
      institution: String,
      year: Number,
      gpa: String
    }],
    contact: {
      email: String,
      phone: String,
      location: String,
      linkedin: String,
      github: String,
      portfolio: String
    },
    certifications: [String],
    languages: [String],
    projects: [{
      name: String,
      description: String,
      technologies: [String],
      url: String
    }]
  },
  format: {
    type: String,
    enum: ['modern', 'classic', 'creative', 'minimal', 'ats'],
    default: 'ats'
  },
  isActive: {
    type: Boolean,
    default: true
  },
  lastOptimizedAt: Date,
  optimizationScore: {
    type: Number,
    min: 0,
    max: 100,
    default: 0
  },
  optimizedFrom: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Resume',
    default: null
  }
}, {
  timestamps: true
});

// Indexes for better query performance
resumeSchema.index({ userId: 1 });
resumeSchema.index({ isActive: 1 });
resumeSchema.index({ 'metadata.skills': 1 });

// Method to add a new version
resumeSchema.methods.addVersion = function(content, jobId = null, tailoredFor = null) {
  this.versions.push({
    content,
    jobId,
    tailoredFor
  });
  return this.save();
};

// Method to get latest version
resumeSchema.methods.getLatestVersion = function() {
  if (this.versions.length === 0) {
    return this.markdownContent;
  }
  return this.versions[this.versions.length - 1].content;
};

// Method to get version by job ID
resumeSchema.methods.getVersionByJob = function(jobId) {
  return this.versions.find(version => 
    version.jobId && version.jobId.toString() === jobId.toString()
  );
};

// Static method to find resume by user
resumeSchema.statics.findByUser = function(userId) {
  return this.findOne({ userId, isActive: true });
};

module.exports = mongoose.model('Resume', resumeSchema); 