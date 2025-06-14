const jobScrapingService = require('../services/jobScrapingService');
const llmService = require('../services/llmService');
const Resume = require('../models/Resume');
const { optimizeResumeWithAI, extractResumeMetadata } = require('../services/resumeService');
const User = require('../../services/authentication/userModel');

// Process shared job from LinkedIn
const processSharedJob = async (req, res) => {
  try {
    const { sharedText } = req.body;
    const userId = req.user._id || req.user.userId;

    if (!sharedText) {
      return res.status(400).json({
        success: false,
        message: 'Shared text is required'
      });
    }

    console.log('📧 Processing shared job text:', sharedText);

    // Extract job info from shared text
    const jobInfo = jobScrapingService.extractJobInfoFromSharedText(sharedText);
    console.log('🔍 Extracted job info:', jobInfo);

    // Scrape job details
    const jobDetails = await jobScrapingService.scrapeJobDetails(jobInfo.jobId);
    console.log('📋 Scraped job details:', jobDetails);

    // Get user's resumes for selection
    const userResumes = await Resume.find({ userId, isActive: true }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      data: {
        jobDetails,
        jobInfo,
        userResumes: userResumes.map(resume => ({
          _id: resume._id,
          name: resume.name,
          createdAt: resume.createdAt,
          lastModified: resume.updatedAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error processing shared job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process shared job',
      error: error.message
    });
  }
};

// Scrape job details by job ID
const scrapeJobById = async (req, res) => {
  try {
    const { jobId } = req.params;
    const userId = req.user._id || req.user.userId;

    if (!jobId) {
      return res.status(400).json({
        success: false,
        message: 'Job ID is required'
      });
    }

    console.log('🔍 Scraping job by ID:', jobId);

    // Scrape job details
    const jobDetails = await jobScrapingService.scrapeJobDetails(jobId);

    // Get user's resumes for selection
    const userResumes = await Resume.find({ userId, isActive: true }).sort({ updatedAt: -1 });

    res.json({
      success: true,
      data: {
        jobDetails,
        userResumes: userResumes.map(resume => ({
          _id: resume._id,
          name: resume.name,
          createdAt: resume.createdAt,
          lastModified: resume.updatedAt
        }))
      }
    });

  } catch (error) {
    console.error('❌ Error scraping job by ID:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to scrape job details',
      error: error.message
    });
  }
};

// Optimize resume for specific job
const optimizeResumeForJob = async (req, res) => {
  try {
    const { resumeId, jobDetails, optimizationNote, resumeName } = req.body;
    const userId = req.user._id || req.user.userId;

    if (!resumeId || !jobDetails) {
      return res.status(400).json({
        success: false,
        message: 'Resume ID and job details are required'
      });
    }

    console.log('🎯 Optimizing resume for job:', {
      resumeId,
      jobTitle: jobDetails.title,
      company: jobDetails.company,
      hasJobDescription: !!jobDetails.description,
      skillsCount: jobDetails.skills?.length || 0
    });

    // Find the selected resume
    const selectedResume = await Resume.findOne({
      _id: resumeId,
      userId,
      isActive: true
    });

    if (!selectedResume) {
      return res.status(404).json({
        success: false,
        message: 'Resume not found'
      });
    }

    // Get user for preferences
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }

    // Create optimization prompt using markdownContent if available, otherwise originalContent
    const resumeContent = selectedResume.markdownContent || selectedResume.originalContent;

    console.log('🤖 Generating optimized resume with enhanced AI service...');
    console.log('🎯 Job details for optimization:', jobDetails);

    // Use the same high-quality optimization function as regular resume optimization
    // This includes better prompt engineering and job-specific tailoring
    const optimizedContent = await optimizeResumeWithAI(
      resumeContent,
      jobDetails,
      jobDetails.title, // targetRole
      jobDetails.skills || [], // targetSkills
      user.preferences || {} // userPreferences
    );

    // Extract new metadata for the optimized resume
    const newMetadata = await extractResumeMetadata(optimizedContent);

    // Calculate optimization score based on new metadata
    const calculateOptimizationScore = (metadata, content) => {
      let score = 0;
      if (metadata.contact?.email) score += 10;
      if (metadata.contact?.phone) score += 10;
      if (metadata.skills?.length > 5) score += 20;
      if (metadata.experience?.positions?.length > 0) score += 30;
      if (metadata.education?.length > 0) score += 15;
      if (content.includes('achievement') || content.includes('accomplish')) score += 15;
      return Math.min(score, 100);
    };

    const optimizationScore = calculateOptimizationScore(newMetadata, optimizedContent);

    // Create new resume with optimized content
    const optimizedResumeName = (resumeName || `${jobDetails.company} - ${jobDetails.title}`).substring(0, 100);
    
    const optimizedResume = await Resume.create({
      userId,
      name: optimizedResumeName,
      originalContent: selectedResume.originalContent || selectedResume.markdownContent,
      markdownContent: optimizedContent,
      isActive: true,
      format: selectedResume.format || 'ats',
      optimizationScore: optimizationScore,
      metadata: {
        ...newMetadata,
        optimizedFor: {
          jobId: jobDetails.jobId,
          jobTitle: jobDetails.title,
          company: jobDetails.company,
          originalResumeId: resumeId
        },
        createdFrom: 'job_optimization'
      },
      optimizedFrom: resumeId,
      lastOptimizedAt: new Date()
    });

    console.log(`✅ New optimized resume created successfully: ${optimizedResume._id} (optimized from ${resumeId})`);
    
    res.json({
      success: true,
      message: 'Resume optimized successfully for job posting',
      data: {
        optimizedResume: {
          _id: optimizedResume._id,
          userId: optimizedResume.userId,
          name: optimizedResume.name,
          markdownContent: optimizedResume.markdownContent,
          metadata: optimizedResume.metadata,
          format: optimizedResume.format,
          optimizationScore: optimizedResume.optimizationScore,
          isActive: optimizedResume.isActive,
          createdAt: optimizedResume.createdAt,
          updatedAt: optimizedResume.updatedAt,
          optimizedFrom: optimizedResume.optimizedFrom
        },
        jobDetails
      }
    });

  } catch (error) {
    console.error('❌ Error optimizing resume for job:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to optimize resume',
      error: error.message
    });
  }
};

// Create optimization prompt for job-specific resume
function createJobOptimizationPrompt(originalResume, jobDetails, userNote = '') {
  const prompt = `
You are an expert resume optimization specialist. Please optimize the following resume specifically for this job opportunity.

ORIGINAL RESUME:
${originalResume}

JOB DETAILS:
Title: ${jobDetails.title}
Company: ${jobDetails.company}
Location: ${jobDetails.location}
Description: ${jobDetails.description}

KEY REQUIREMENTS: ${jobDetails.requirements.join(', ')}
KEY SKILLS: ${jobDetails.skills.join(', ')}

${userNote ? `ADDITIONAL USER INSTRUCTIONS: ${userNote}` : ''}

OPTIMIZATION INSTRUCTIONS:
1. Keep the same overall structure and format as the original resume
2. Tailor the experience descriptions to highlight relevant skills for this specific job
3. Emphasize accomplishments that align with the job requirements
4. Use keywords from the job description naturally throughout the resume
5. Adjust the summary/objective to be specific to this role and company
6. Quantify achievements where possible with metrics and numbers
7. Ensure ATS compatibility by using standard formatting
8. Do not fabricate experience or skills not present in the original resume
9. Maintain professional formatting with proper headers and sections
10. Use action verbs that match the job posting's language

Please return the optimized resume in the same format as the original, ready for immediate use.
`;

  return prompt;
}

module.exports = {
  processSharedJob,
  scrapeJobById,
  optimizeResumeForJob
}; 