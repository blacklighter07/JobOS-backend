const { body, query, param, validationResult } = require('express-validator');

const validateRequest = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      error: 'Validation failed',
      details: errors.array()
    });
  }
  next();
};

// Job search validation
const validateJobSearch = [
  query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
  query('limit').optional().isInt({ min: 1, max: 50 }).withMessage('Limit must be between 1 and 50'),
  query('keywords').optional().isString().withMessage('Keywords must be a string'),
  query('location').optional().isString().withMessage('Location must be a string'),
  query('experienceLevel').optional().isIn(['entry', 'junior', 'mid', 'senior', 'lead', 'executive']).withMessage('Invalid experience level'),
  query('jobType').optional().isIn(['full-time', 'part-time', 'contract', 'freelance', 'internship']).withMessage('Invalid job type'),
  query('isRemote').optional().isBoolean().withMessage('isRemote must be a boolean'),
  query('salaryMin').optional().isInt({ min: 0 }).withMessage('Minimum salary must be a positive integer'),
  query('salaryMax').optional().isInt({ min: 0 }).withMessage('Maximum salary must be a positive integer')
];

// Application status validation
const validateApplicationStatus = [
  body('status').isIn(['applied', 'viewed', 'in_review', 'phone_screen', 'interview_scheduled', 'interview_completed', 'offer_received', 'rejected', 'withdrawn', 'accepted']).withMessage('Invalid application status'),
  body('notes').optional().isString().withMessage('Notes must be a string')
];

// Resume validation
const validateResume = [
  body('content').notEmpty().withMessage('Resume content is required'),
  body('format').optional().isIn(['modern', 'classic', 'creative', 'minimal']).withMessage('Invalid resume format')
];

// Profile update validation
const validateProfileUpdate = [
  body('firstName').optional().isLength({ min: 1, max: 50 }).withMessage('First name must be between 1 and 50 characters'),
  body('lastName').optional().isLength({ min: 1, max: 50 }).withMessage('Last name must be between 1 and 50 characters'),
  body('email').optional().isEmail().withMessage('Valid email is required')
];

// Preferences validation
const validatePreferences = [
  body('domains').optional().isArray().withMessage('Domains must be an array'),
  body('domains.*').optional().isIn(['technology', 'finance', 'healthcare', 'marketing', 'sales', 'design', 'operations', 'legal', 'hr', 'consulting', 'other']).withMessage('Invalid domain'),
  body('salaryRange.min').optional().isInt({ min: 0 }).withMessage('Minimum salary must be a positive integer'),
  body('salaryRange.max').optional().isInt({ min: 0 }).withMessage('Maximum salary must be a positive integer'),
  body('experience').optional().isIn(['entry', 'junior', 'mid', 'senior', 'lead', 'executive']).withMessage('Invalid experience level'),
  body('jobTypes').optional().isArray().withMessage('Job types must be an array'),
  body('jobTypes.*').optional().isIn(['full-time', 'part-time', 'contract', 'freelance', 'internship']).withMessage('Invalid job type'),
  body('remotePreference').optional().isIn(['remote', 'hybrid', 'onsite', 'any']).withMessage('Invalid remote preference')
];

// Job ID validation
const validateJobId = [
  param('jobId').isMongoId().withMessage('Invalid job ID')
];

// Application ID validation
const validateApplicationId = [
  param('applicationId').isMongoId().withMessage('Invalid application ID')
];

module.exports = {
  validateRequest,
  validateJobSearch,
  validateApplicationStatus,
  validateResume,
  validateProfileUpdate,
  validatePreferences,
  validateJobId,
  validateApplicationId
}; 