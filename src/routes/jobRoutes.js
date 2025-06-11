const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const jobController = require('../controllers/jobController');

// Process shared job from LinkedIn
router.post('/process-shared', auth, jobController.processSharedJob);

// Scrape job details by job ID
router.get('/scrape/:jobId', auth, jobController.scrapeJobById);

// Optimize resume for specific job
router.post('/optimize-resume', auth, jobController.optimizeResumeForJob);

module.exports = router; 