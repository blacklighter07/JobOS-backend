const express = require('express');
const router = express.Router();

// Import controllers
const dashboardController = require('../controllers/dashboardController');
const resumeController = require('../controllers/resumeController');
const profileController = require('../controllers/profileController');

// Import middleware
const { auth } = require('../middleware/auth');
const { validateRequest } = require('../middleware/validation');

// Logging middleware for mobile API calls
router.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  const method = req.method;
  const url = req.originalUrl;
  const userAgent = req.get('User-Agent') || 'Unknown';
  const userId = req.userId || 'Anonymous';
  
  console.log(`📱 [${timestamp}] ${method} ${url} - User: ${userId} - Agent: ${userAgent}`);
  
  if (req.body && Object.keys(req.body).length > 0) {
    console.log(`📝 Request Body:`, JSON.stringify(req.body, null, 2));
  }
  
  // Log response
  const originalSend = res.send;
  res.send = function(data) {
    console.log(`📤 [${timestamp}] Response ${res.statusCode} for ${method} ${url}`);
    if (res.statusCode >= 400) {
      console.log(`❌ Error Response:`, data);
    } else {
      console.log(`✅ Success Response for ${method} ${url}`);
    }
    originalSend.call(this, data);
  };
  
  next();
});

// Dashboard routes
router.get('/dashboard/stats', auth, dashboardController.getDashboardStats);

// Resume routes
router.get('/resume', auth, resumeController.getResume);
router.get('/resume/list', auth, resumeController.getUserResumes);
router.get('/resume/:resumeId', auth, resumeController.getResumeById);
router.post('/resume', auth, resumeController.createOrUpdateResume);
router.post('/resume/generate', auth, resumeController.generateFromPrompt);
router.post('/resume/create', auth, resumeController.createResumeWithName);
router.post('/resume/upload', auth, resumeController.uploadResume);
router.post('/resume/modify', auth, resumeController.modifyResumeWithPrompt);
router.post('/resume/:resumeId/modify', auth, resumeController.modifyResumeWithPrompt);
router.put('/resume/:resumeId', auth, resumeController.updateResumeById);
router.put('/resume/:resumeId/rename', auth, resumeController.renameResume);
router.delete('/resume/:resumeId', auth, resumeController.deleteResume);
router.get('/resume/versions', auth, resumeController.getVersions);
router.get('/resume/:resumeId/versions', auth, resumeController.getVersions);
router.post('/resume/optimize', auth, resumeController.optimizeResume);
router.post('/resume/:resumeId/optimize', auth, resumeController.optimizeResumeById);
router.post('/resume/generate-pdf', auth, resumeController.generatePDF);
router.post('/resume/:resumeId/pdf', auth, resumeController.generatePDF);

router.get('/resume/:resumeId/download/:format', auth, resumeController.downloadResume);

// Profile routes
router.get('/profile', auth, profileController.getProfile);
router.patch('/profile', auth, profileController.updateProfile);
router.patch('/profile/preferences', auth, profileController.updatePreferences);
router.patch('/profile/settings', auth, profileController.updateSettings);

module.exports = router; 