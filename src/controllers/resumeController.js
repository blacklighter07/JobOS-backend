const Resume = require('../models/Resume');
const User = require('../../services/authentication/userModel');
// const Job = require('../models/Job'); // Job model not implemented yet
const { optimizeResumeWithAI, extractResumeMetadata } = require('../services/resumeService');
const { generateResumePDF } = require('../services/pdfService');
const llmService = require('../services/llmService');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit for PDFs
  },
  fileFilter: (req, file, cb) => {
    // Only accept PDF files
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are allowed. Please upload your resume as a PDF.'));
    }
  }
}).single('resume');

// Get user's resume
const getResume = async (req, res) => {
  try {
    console.log(`🔍 Getting resume for user: ${req.userId}`);
    const userId = req.userId;

    const resume = await Resume.findByUser(userId);
    if (!resume) {
      console.log(`❌ No resume found for user: ${userId}`);
      return res.status(404).json({
        success: false,
        error: 'Resume not found. Please create a resume first.'
      });
    }

    console.log(`✅ Found resume for user: ${userId}`);
    res.json({
      success: true,
      data: resume
    });

  } catch (error) {
    console.error('❌ Error fetching resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resume'
    });
  }
};

// Create or update resume
const createOrUpdateResume = async (req, res) => {
  try {
    const userId = req.userId;
    const { originalContent, markdownContent, format = 'modern' } = req.body;

    // Extract metadata from resume content and sanitize
    let metadata = await extractResumeMetadata(markdownContent);
    metadata = sanitizeMetadata(metadata);

    // Calculate initial optimization score
    const optimizationScore = calculateOptimizationScore(metadata, markdownContent);

    // Check if resume exists
    let resume = await Resume.findByUser(userId);

    if (resume) {
      // Update existing resume
      resume.originalContent = originalContent;
      resume.markdownContent = markdownContent;
      resume.metadata = metadata;
      resume.format = format;
      resume.optimizationScore = optimizationScore;
      resume.lastOptimizedAt = new Date();
      await resume.save();
    } else {
      // Create new resume
      resume = new Resume({
        userId,
        originalContent,
        markdownContent,
        metadata,
        format,
        optimizationScore
      });
      await resume.save();
    }

    res.json({
      success: true,
      message: resume.isNew ? 'Resume created successfully' : 'Resume updated successfully',
      data: resume
    });

  } catch (error) {
    console.error('Error creating/updating resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to save resume'
    });
  }
};

// Generate resume from prompt using AI
const generateFromPrompt = async (req, res) => {
  try {
    console.log(`🤖 Generating resume from prompt for user: ${req.userId}`);
    const userId = req.userId;
    const { prompt, jobDescription, userInfo, existingResume } = req.body;

    if (!prompt && !existingResume) {
      console.log(`❌ Missing prompt or existing resume for user: ${userId}`);
      return res.status(400).json({
        success: false,
        error: 'Either prompt or existing resume content is required'
      });
    }

    // Get user profile for context
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log(`👤 Found user: ${user.email} for resume generation`);

    let resumeData;

    if (existingResume) {
      // If existing resume provided, optimize it
      resumeData = {
        markdownContent: existingResume,
        metadata: await extractResumeMetadata(existingResume)
      };
    } else {
      // Generate new resume from prompt
      const userProfile = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        preferences: user.preferences || {}
      };

      // Merge with userInfo from request if provided
      if (userInfo) {
        userProfile.firstName = userInfo.name?.split(' ')[0] || userProfile.firstName;
        userProfile.lastName = userInfo.name?.split(' ').slice(1).join(' ') || userProfile.lastName;
        userProfile.email = userInfo.email || userProfile.email;
      }

      // Build enhanced prompt if job description provided
      let enhancedPrompt = prompt;
      if (jobDescription) {
        enhancedPrompt += `\n\nPlease tailor this resume for the following job description:\n${jobDescription}`;
      }

      // Generate resume using LLM service
      resumeData = await llmService.generateResumeFromPrompt(enhancedPrompt, userProfile);
    }

    // Extract metadata and calculate optimization score
    let metadata = resumeData.metadata || await extractResumeMetadata(resumeData.markdownContent);
    
    // Sanitize metadata to ensure correct structure
    metadata = sanitizeMetadata(metadata);
    
    const optimizationScore = calculateOptimizationScore(metadata, resumeData.markdownContent);

    // Generate a default name for the resume
    const resumeName = await generateResumeDefaultName(userId, metadata);

    // Always create new resume (don't overwrite existing ones)
    const resume = new Resume({
      userId,
      name: resumeName,
      originalContent: prompt || existingResume,
      markdownContent: resumeData.markdownContent,
      metadata,
      format: 'ats', // Use ATS-friendly format by default
      optimizationScore,
      isActive: true
    });
    await resume.save();

    // Prepare response in the format expected by frontend
    const response = {
      _id: resume._id,
      resumeId: resume._id.toString(),
      content: resumeData.markdownContent,
      markdownContent: resumeData.markdownContent,
      format: resume.format,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
      wordCount: resumeData.markdownContent.split(' ').length,
      sections: extractSections(resumeData.markdownContent),
      metadata: metadata,
      optimizationScore: optimizationScore
    };

    console.log(`✅ Resume generated successfully for user: ${userId}`);
    console.log(`📊 Optimization score: ${optimizationScore}%`);
    console.log(`📝 Word count: ${response.wordCount}`);

    res.json({
      success: true,
      message: 'Resume generated and saved successfully',
      data: response
    });

  } catch (error) {
    console.error('❌ Error generating resume from prompt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate resume'
    });
  }
};

// Get resume versions
const getVersions = async (req, res) => {
  try {
    const userId = req.userId;

    const resume = await Resume.findByUser(userId);
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    res.json({
      success: true,
      data: resume.versions
    });

  } catch (error) {
    console.error('Error fetching resume versions:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resume versions'
    });
  }
};

// Optimize resume with AI
const optimizeResume = async (req, res) => {
  try {
    const userId = req.userId;
    const { jobId, targetRole, targetSkills } = req.body;

    const resume = await Resume.findByUser(userId);
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    const user = await User.findById(userId);
    if (!user.hasPremiumAccess()) {
      return res.status(403).json({
        success: false,
        error: 'Premium subscription required for AI resume optimization'
      });
    }

    // Get job details if jobId is provided
    let jobDetails = null;
    if (jobId) {
      // jobDetails = await Job.findById(jobId); // Job model not implemented yet
      console.log('Job model not implemented yet - skipping job details lookup');
    }

    // Optimize resume with AI
    const optimizedContent = await optimizeResumeWithAI(
      resume.markdownContent,
      jobDetails,
      targetRole,
      targetSkills,
      user.preferences
    );

    // Extract new metadata and sanitize
    let newMetadata = await extractResumeMetadata(optimizedContent);
    newMetadata = sanitizeMetadata(newMetadata);
    const newOptimizationScore = calculateOptimizationScore(newMetadata, optimizedContent);

    // Update resume
    resume.markdownContent = optimizedContent;
    resume.metadata = newMetadata;
    resume.optimizationScore = newOptimizationScore;
    resume.lastOptimizedAt = new Date();

    // Add as new version if optimized for specific job
    if (jobId) {
      await resume.addVersion(optimizedContent, jobId, `Optimized for ${jobDetails?.title || 'specific role'}`);
    }

    await resume.save();

    res.json({
      success: true,
      message: 'Resume optimized successfully',
      data: {
        optimizationScore: newOptimizationScore,
        improvementSuggestions: generateImprovementSuggestions(newMetadata, optimizedContent)
      }
    });

  } catch (error) {
    console.error('Error optimizing resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize resume'
    });
  }
};

// Generate PDF
const generatePDF = async (req, res) => {
  try {
    const userId = req.userId;
    const { resumeId } = req.params;
    const { versionId } = req.body;

    let resume;
    if (resumeId) {
      // Use specific resume ID from URL params
      resume = await Resume.findOne({ _id: resumeId, userId, isActive: true });
    } else {
      // Fallback to finding by user (for backward compatibility)
      resume = await Resume.findByUser(userId);
    }

    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    // Get content to convert
    let content = resume.markdownContent;
    if (versionId) {
      const version = resume.versions.id(versionId);
      if (version) {
        content = version.content;
      }
    }

    // Generate PDF
    const pdfUrl = await generateResumePDF(content, resume.format, userId, resume._id, resume.name);

    // Update version with PDF URL if applicable
    if (versionId) {
      const version = resume.versions.id(versionId);
      if (version) {
        version.pdfUrl = pdfUrl;
        await resume.save();
      }
    }

    res.json({
      success: true,
      message: 'PDF generated successfully',
      data: {
        pdfUrl
      }
    });

  } catch (error) {
    console.error('Error generating PDF:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate PDF'
    });
  }
};

// Tailor resume for specific job
const tailorResumeForJob = async (req, res) => {
  try {
    const userId = req.userId;
    const { jobId } = req.params;

    const user = await User.findById(userId);
    if (!user.hasPremiumAccess()) {
      return res.status(403).json({
        success: false,
        error: 'Premium subscription required for job-specific resume tailoring'
      });
    }

    const resume = await Resume.findByUser(userId);
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    // const job = await Job.findById(jobId); // Job model not implemented yet
    const job = null; // Temporary placeholder
    if (!job) {
      return res.status(404).json({
        success: false,
        error: 'Job functionality not implemented yet'
      });
    }

    // Check if version already exists for this job
    const existingVersion = resume.getVersionByJob(jobId);
    if (existingVersion) {
      return res.json({
        success: true,
        message: 'Resume version for this job already exists',
        data: existingVersion
      });
    }

    // Tailor resume for this specific job
    const tailoredContent = await optimizeResumeWithAI(
      resume.markdownContent,
      job,
      job.title,
      job.skills,
      user.preferences
    );

    // Add tailored version
    await resume.addVersion(tailoredContent, jobId, `Tailored for ${job.title} at ${job.company}`);

    res.json({
      success: true,
      message: 'Resume tailored for job successfully',
      data: {
        versionId: resume.versions[resume.versions.length - 1]._id,
        tailoredFor: `${job.title} at ${job.company}`
      }
    });

  } catch (error) {
    console.error('Error tailoring resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to tailor resume for job'
    });
  }
};

// Helper function to calculate optimization score
const calculateOptimizationScore = (metadata, content) => {
  let score = 0;
  
  // Contact information (20 points)
  if (metadata.contact?.email) score += 5;
  if (metadata.contact?.phone) score += 5;
  if (metadata.contact?.location) score += 5;
  if (metadata.contact?.linkedin) score += 5;

  // Skills (25 points)
  const skillsCount = metadata.skills?.length || 0;
  score += Math.min(skillsCount * 2, 25);

  // Experience (25 points)
  const experienceCount = metadata.experience?.positions?.length || 0;
  score += Math.min(experienceCount * 8, 25);

  // Education (10 points)
  if (metadata.education?.length > 0) score += 10;

  // Content quality (20 points)
  const wordCount = content.split(' ').length;
  if (wordCount > 300) score += 10;
  if (wordCount > 500) score += 5;
  
  // Check for quantified achievements
  const numbers = content.match(/\d+/g);
  if (numbers && numbers.length >= 3) score += 5;

  return Math.min(score, 100);
};

// Helper function to extract sections from markdown content
const extractSections = (markdownContent) => {
  const sections = [];
  const lines = markdownContent.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)[0].length;
      const title = line.replace(/^#+\s*/, '');
      sections.push({
        title: title,
        level: level,
        type: getSectionType(title)
      });
    }
  }
  
  return sections;
};

// Helper function to determine section type
const getSectionType = (title) => {
  const lowerTitle = title.toLowerCase();
  if (lowerTitle.includes('summary') || lowerTitle.includes('objective')) return 'summary';
  if (lowerTitle.includes('experience') || lowerTitle.includes('work')) return 'experience';
  if (lowerTitle.includes('education')) return 'education';
  if (lowerTitle.includes('skill')) return 'skills';
  if (lowerTitle.includes('project')) return 'projects';
  if (lowerTitle.includes('certification')) return 'certifications';
  return 'other';
};

// Helper function to generate improvement suggestions
const generateImprovementSuggestions = (metadata, content) => {
  const suggestions = [];

  if (!metadata.contact.phone) {
    suggestions.push('Add your phone number to contact information');
  }

  if (metadata.skills.length < 8) {
    suggestions.push('Add more relevant skills to showcase your expertise');
  }

  if (metadata.experience.positions.length < 3) {
    suggestions.push('Include more work experience or relevant projects');
  }

  const numbers = content.match(/\d+/g);
  if (!numbers || numbers.length < 3) {
    suggestions.push('Add quantified achievements (e.g., "Increased sales by 25%")');
  }

  if (content.length < 500) {
    suggestions.push('Expand your resume with more detailed descriptions');
  }

  return suggestions;
};

// Helper function to generate a default resume name
const generateResumeDefaultName = async (userId, metadata) => {
  try {
    // Get existing resume count for this user
    const resumeCount = await Resume.countDocuments({ userId, isActive: true });
    
    // Try to create a meaningful name based on metadata
    let baseName = 'My Resume';
    
    // If we have experience, use the most recent position
    if (metadata?.experience?.positions?.length > 0) {
      const latestPosition = metadata.experience.positions[0];
      if (latestPosition?.title) {
        baseName = `${latestPosition.title} Resume`;
      }
    }
    
    // If no experience but have skills, use primary skill
    else if (metadata?.skills?.length > 0) {
      const primarySkill = metadata.skills[0];
      baseName = `${primarySkill} Resume`;
    }
    
    // Add number if not first resume
    if (resumeCount > 0) {
      baseName += ` ${resumeCount + 1}`;
    }
    
    return baseName;
  } catch (error) {
    console.error('Error generating resume name:', error);
    // Fallback to simple naming
    const timestamp = new Date().toISOString().slice(0, 10);
    return `Resume ${timestamp}`;
  }
};

// Helper function to sanitize metadata structure
const sanitizeMetadata = (metadata) => {
  if (!metadata || typeof metadata !== 'object') {
    metadata = {};
  }

  // Ensure skills is an array
  if (!Array.isArray(metadata.skills)) {
    metadata.skills = [];
  }

  // Ensure experience has the correct structure
  if (!metadata.experience || typeof metadata.experience !== 'object') {
    metadata.experience = {
      totalYears: 0,
      positions: []
    };
  } else {
    // Handle case where experience is a string (LLM parsing error)
    if (typeof metadata.experience === 'string') {
      console.log('⚠️ Experience metadata is string, converting to object structure');
      metadata.experience = {
        totalYears: 0,
        positions: []
      };
    } else {
      // Ensure required fields exist
      if (typeof metadata.experience.totalYears !== 'number') {
        metadata.experience.totalYears = 0;
      }
      if (!Array.isArray(metadata.experience.positions)) {
        metadata.experience.positions = [];
      }
    }
  }

  // Ensure education is an array
  if (!Array.isArray(metadata.education)) {
    metadata.education = [];
  }

  // Ensure contact has the correct structure
  if (!metadata.contact || typeof metadata.contact !== 'object') {
    metadata.contact = {
      email: null,
      phone: null,
      location: null,
      linkedin: null,
      github: null,
      portfolio: null
    };
  }

  // Ensure other arrays exist
  if (!Array.isArray(metadata.certifications)) {
    metadata.certifications = [];
  }
  if (!Array.isArray(metadata.languages)) {
    metadata.languages = [];
  }
  if (!Array.isArray(metadata.projects)) {
    metadata.projects = [];
  }

  return metadata;
};

// Helper function to format extracted text as basic resume
const formatExtractedTextAsResume = (extractedText, userProfile) => {
  const name = `${userProfile.firstName || 'John'} ${userProfile.lastName || 'Doe'}`;
  const email = userProfile.email || 'your.email@email.com';
  
  return `# ${name}

**Professional** | ${email} | [Your Phone] | [Your Location]

## Extracted Resume Content

${extractedText}

---
*This resume was processed from your uploaded PDF. Please review and edit as needed.*`;
};

// Upload resume file
const uploadResume = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Multer upload error:', err);
      return res.status(400).json({
        success: false,
        error: err.message
      });
    }

    if (!req.file) {
      console.error('No file uploaded in request');
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    console.log('📁 Starting resume upload process...');
    console.log(`📄 File: ${req.file.originalname} (${req.file.size} bytes)`);

    try {
      const userId = req.userId;
      const file = req.file;

      // Only accept PDF files
      if (file.mimetype !== 'application/pdf') {
        console.error(`❌ Invalid file type: ${file.mimetype}`);
        return res.status(400).json({
          success: false,
          error: 'Only PDF files are allowed. Please upload your resume as a PDF.'
        });
      }

      console.log('🔍 Extracting text from PDF...');
      // Extract text from PDF
      const pdfParse = require('pdf-parse');
      const pdfBuffer = file.buffer;
      const pdfData = await pdfParse(pdfBuffer);
      const extractedText = pdfData.text;

      console.log(`📝 Extracted ${extractedText.length} characters from PDF`);

      if (!extractedText || extractedText.trim().length < 50) {
        console.error(`❌ Insufficient text extracted: ${extractedText.trim().length} characters`);
        return res.status(400).json({
          success: false,
          error: 'Could not extract sufficient text from the PDF. Please ensure the PDF contains readable text.'
        });
      }

      console.log('👤 Fetching user profile...');
      // Get user profile for context
      const user = await User.findById(userId);
      if (!user) {
        console.error(`❌ User not found: ${userId}`);
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      console.log('🤖 Processing resume with AI...');
      // Generate new resume using LLM from extracted text
      const userProfile = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        preferences: user.preferences || {}
      };

      // Build prompt for resume regeneration
      const prompt = `Please take this existing resume content and reformat it into a professional, ATS-optimized resume structure. Maintain all the original information but improve the formatting, structure, and presentation:

${extractedText}`;

      let resumeData;
      try {
        resumeData = await llmService.generateResumeFromPrompt(prompt, userProfile);
        console.log('✅ AI processing complete');
      } catch (llmError) {
        console.log('⚠️ AI processing failed, using extracted text as fallback');
        // If AI processing fails, use the extracted text in a basic format
                 resumeData = {
           markdownContent: formatExtractedTextAsResume(extractedText, userProfile),
           metadata: null
         };
      }

      console.log('📊 Extracting metadata and calculating optimization score...');
      // Extract metadata and calculate optimization score
      let metadata = resumeData.metadata || await extractResumeMetadata(resumeData.markdownContent);
      
      // Sanitize metadata to ensure correct structure
      metadata = sanitizeMetadata(metadata);
      
      const optimizationScore = calculateOptimizationScore(metadata, resumeData.markdownContent);

      console.log('💾 Saving resume to database...');
      // Use custom name if provided, otherwise generate default name
      let resumeName = req.body.resumeName;
      if (!resumeName || !resumeName.trim()) {
        resumeName = await generateResumeDefaultName(userId, metadata);
      } else {
        resumeName = resumeName.trim();
      }

      console.log('➕ Creating new resume');
      // Always create new resume (don't overwrite existing ones)
      const resume = new Resume({
        userId,
        name: resumeName,
        originalContent: extractedText,
        markdownContent: resumeData.markdownContent,
        metadata,
        format: 'ats',
        optimizationScore,
        isActive: true
      });
      await resume.save();

      console.log('🎉 Resume upload and processing completed successfully!');
      console.log(`📈 Optimization Score: ${optimizationScore}%`);
      console.log(`📝 Word Count: ${resumeData.markdownContent.split(' ').length}`);

      res.json({
        success: true,
        message: 'Resume uploaded and processed successfully',
        data: {
          extractedText: extractedText,
          filename: file.originalname,
          size: file.size,
          resume: {
            _id: resume._id,
            content: resumeData.markdownContent,
            markdownContent: resumeData.markdownContent,
            format: resume.format,
            optimizationScore: optimizationScore,
            wordCount: resumeData.markdownContent.split(' ').length,
            sections: extractSections(resumeData.markdownContent)
          }
        }
      });

    } catch (error) {
      console.error('❌ Error processing uploaded resume:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to process uploaded resume'
      });
    }
  });
};

// Modify resume based on user prompt
const modifyResumeWithPrompt = async (req, res) => {
  try {
    console.log(`✏️ Modifying resume for user: ${req.userId}`);
    const userId = req.userId;
    const { resumeId } = req.params;
    const { prompt } = req.body;

    if (!prompt || !prompt.trim()) {
      console.log(`❌ Missing modification prompt for user: ${userId}`);
      return res.status(400).json({
        success: false,
        error: 'Modification prompt is required'
      });
    }

    console.log(`📝 Modification prompt: ${prompt.substring(0, 100)}...`);

    // Find specific resume by ID if provided, otherwise find by user
    let resume;
    if (resumeId) {
      console.log(`🔍 Looking for specific resume: ${resumeId}`);
      resume = await Resume.findOne({ _id: resumeId, userId, isActive: true });
      if (!resume) {
        console.log(`❌ Specific resume not found: ${resumeId} for user: ${userId}`);
        return res.status(404).json({
          success: false,
          error: 'Resume not found'
        });
      }
    } else {
      // Fallback to finding any resume by user (for backward compatibility)
      resume = await Resume.findByUser(userId);
      if (!resume) {
        console.log(`❌ No resume found for modification for user: ${userId}`);
        return res.status(404).json({
          success: false,
          error: 'Resume not found. Please create or upload a resume first.'
        });
      }
    }

    console.log(`📄 Found resume to modify: ${resume._id}`);

    // Get user profile for context
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Build modification prompt
    const modificationPrompt = `Please modify the following resume based on this user request: "${prompt}"

Current Resume:
${resume.markdownContent}

User Request: ${prompt}

Instructions:
- Make the requested changes while maintaining the professional ATS-friendly format
- Keep all existing information unless specifically asked to remove it
- If adding skills, integrate them naturally into the existing skills section
- If adding experience, follow the existing format and structure
- Maintain the same markdown formatting and structure
- Only make changes related to the user's request

Return ONLY the modified resume content in clean markdown format. Do not include any JSON wrapping or metadata - just the raw markdown content.`;

    const userProfile = {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      preferences: user.preferences || {}
    };

    // Generate modified resume using LLM
    const modifiedData = await llmService.generateResumeFromPrompt(modificationPrompt, userProfile);

    // Extract metadata and calculate optimization score
    let metadata = await extractResumeMetadata(modifiedData.markdownContent);
    
    // Sanitize metadata to ensure correct structure
    metadata = sanitizeMetadata(metadata);
    
    const optimizationScore = calculateOptimizationScore(metadata, modifiedData.markdownContent);

    // Update resume in database
    resume.markdownContent = modifiedData.markdownContent;
    resume.metadata = metadata;
    resume.optimizationScore = optimizationScore;
    resume.lastOptimizedAt = new Date();
    await resume.save();

    // Add modification as a new version
    await resume.addVersion(
      modifiedData.markdownContent, 
      null, 
      `Modified: ${prompt.substring(0, 50)}${prompt.length > 50 ? '...' : ''}`
    );

    console.log(`✅ Resume modified successfully for user: ${userId}`);
    console.log(`📊 New optimization score: ${optimizationScore}%`);

    res.json({
      success: true,
      message: 'Resume modified successfully',
      data: {
        _id: resume._id,
        content: modifiedData.markdownContent,
        markdownContent: modifiedData.markdownContent,
        format: resume.format,
        optimizationScore: optimizationScore,
        wordCount: modifiedData.markdownContent.split(' ').length,
        sections: extractSections(modifiedData.markdownContent),
        changes: `Applied modification: ${prompt}`,
        metadata: metadata
      }
    });

  } catch (error) {
    console.error('❌ Error modifying resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to modify resume'
    });
  }
};

// Get user's resumes (list endpoint for mobile)
const getUserResumes = async (req, res) => {
  try {
    console.log(`🔍 Getting resumes for user: ${req.userId}`);
    const userId = req.userId;

    const resumes = await Resume.find({ userId, isActive: true })
      .populate('optimizedFrom', 'name _id')
      .sort({ updatedAt: -1 });
    
    console.log(`📋 Found ${resumes.length} resumes for user ${userId}`);
    
    res.json({
      success: true,
      data: resumes
    });

  } catch (error) {
    console.error('❌ Error fetching user resumes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resumes'
    });
  }
};

// Get specific resume by ID
const getResumeById = async (req, res) => {
  try {
    console.log(`🔍 Getting resume by ID: ${req.params.resumeId} for user: ${req.userId}`);
    const { resumeId } = req.params;
    const userId = req.userId;

    const resume = await Resume.findOne({ _id: resumeId, userId, isActive: true })
      .populate('optimizedFrom', 'name _id');
    
    if (!resume) {
      console.log(`❌ Resume not found: ${resumeId} for user: ${userId}`);
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    console.log(`✅ Found resume: ${resumeId}`);
    res.json({
      success: true,
      data: resume
    });

  } catch (error) {
    console.error('❌ Error fetching resume by ID:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch resume'
    });
  }
};

// Update specific resume by ID
const updateResumeById = async (req, res) => {
  try {
    console.log(`🔄 Updating resume: ${req.params.resumeId} for user: ${req.userId}`);
    const { resumeId } = req.params;
    const userId = req.userId;
    const { content, versionNote } = req.body;

    const resume = await Resume.findOne({ _id: resumeId, userId, isActive: true });
    
    if (!resume) {
      console.log(`❌ Resume not found for update: ${resumeId}`);
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    // Update the resume content
    resume.markdownContent = content;
    resume.lastOptimizedAt = new Date();
    
    // Add as new version if versionNote provided
    if (versionNote) {
      await resume.addVersion(content, null, versionNote);
    }

    // Extract new metadata and sanitize
    let newMetadata = await extractResumeMetadata(content);
    newMetadata = sanitizeMetadata(newMetadata);
    const newOptimizationScore = calculateOptimizationScore(newMetadata, content);
    
    resume.metadata = newMetadata;
    resume.optimizationScore = newOptimizationScore;
    
    await resume.save();

    console.log(`✅ Resume updated successfully: ${resumeId}`);
    res.json({
      success: true,
      message: 'Resume updated successfully',
      data: resume
    });

  } catch (error) {
    console.error('❌ Error updating resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update resume'
    });
  }
};

// Optimize specific resume by ID
const optimizeResumeById = async (req, res) => {
  try {
    console.log(`🚀 Optimizing resume: ${req.params.resumeId} for user: ${req.userId}`);
    const { resumeId } = req.params;
    const userId = req.userId;
    const { jobDescription, targetRole, company, optimizedName } = req.body;

    const resume = await Resume.findOne({ _id: resumeId, userId, isActive: true });
    
    if (!resume) {
      console.log(`❌ Resume not found for optimization: ${resumeId}`);
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    const user = await User.findById(userId);
    if (!user.hasPremiumAccess()) {
      console.log(`❌ Premium access required for user: ${userId}`);
      return res.status(403).json({
        success: false,
        error: 'Premium subscription required for AI resume optimization'
      });
    }

    // Create job details object for optimization
    const jobDetails = jobDescription ? {
      title: targetRole || 'Target Role',
      company: company || 'Target Company',
      description: jobDescription,
      skills: []
    } : null;

    // Optimize resume with AI
    const optimizedContent = await optimizeResumeWithAI(
      resume.markdownContent,
      jobDetails,
      targetRole,
      [],
      user.preferences
    );

    // Extract new metadata and sanitize
    let newMetadata = await extractResumeMetadata(optimizedContent);
    newMetadata = sanitizeMetadata(newMetadata);
    const newOptimizationScore = calculateOptimizationScore(newMetadata, optimizedContent);

    // Create new optimized resume instead of updating existing one
    const versionNote = `Optimized for ${targetRole || 'general improvement'}${company ? ` at ${company}` : ''}`;
    
    // Use provided name or generate default name for optimized resume
    const optimizedResumeName = optimizedName?.trim() || await generateResumeDefaultName(userId, newMetadata);
    
    const newResume = new Resume({
      userId,
      name: optimizedResumeName,
      originalContent: `Optimization of resume ${resumeId}: ${versionNote}`,
      markdownContent: optimizedContent,
      metadata: newMetadata,
      format: resume.format, // Keep same format as original
      optimizationScore: newOptimizationScore,
      isActive: true,
      lastOptimizedAt: new Date(),
      optimizedFrom: resumeId
    });
    
    await newResume.save();

    console.log(`✅ New optimized resume created successfully: ${newResume._id} (optimized from ${resumeId})`);
    res.json({
      success: true,
      message: 'New optimized resume created successfully',
      data: {
        _id: newResume._id,
        userId: newResume.userId,
        markdownContent: newResume.markdownContent,
        metadata: newResume.metadata,
        format: newResume.format,
        optimizationScore: newResume.optimizationScore,
        isActive: newResume.isActive,
        createdAt: newResume.createdAt,
        updatedAt: newResume.updatedAt,
        versions: []
      }
    });

  } catch (error) {
    console.error('❌ Error optimizing resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize resume'
    });
  }
};

// Download resume in specified format
const downloadResume = async (req, res) => {
  try {
    console.log(`📥 Downloading resume: ${req.params.resumeId} in format: ${req.params.format}`);
    const { resumeId, format } = req.params;
    const userId = req.userId;

    const resume = await Resume.findOne({ _id: resumeId, userId, isActive: true });
    
    if (!resume) {
      console.log(`❌ Resume not found for download: ${resumeId}`);
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    let content = resume.markdownContent;
    let contentType = 'text/plain';
    let filename = `resume_${resumeId}`;

    switch (format) {
      case 'markdown':
        contentType = 'text/markdown';
        filename += '.md';
        break;
      case 'txt':
        contentType = 'text/plain';
        filename += '.txt';
        // Convert markdown to plain text (basic conversion)
        content = content.replace(/[#*`]/g, '').replace(/\n\n+/g, '\n\n');
        break;
      default:
        contentType = 'text/markdown';
        filename += '.md';
    }

    console.log(`✅ Resume download ready: ${filename}`);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(content);

  } catch (error) {
    console.error('❌ Error downloading resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download resume'
    });
  }
};

// Create resume with custom name
const createResumeWithName = async (req, res) => {
  try {
    console.log(`📝 Creating resume with custom name for user: ${req.userId}`);
    const userId = req.userId;
    const { name, prompt, jobDescription, userInfo, existingResume } = req.body;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Resume name is required'
      });
    }

    if (!prompt && !existingResume) {
      return res.status(400).json({
        success: false,
        error: 'Either prompt or existing resume content is required'
      });
    }

    // Get user profile for context
    const user = await User.findById(userId);
    if (!user) {
      console.log(`❌ User not found: ${userId}`);
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    console.log(`👤 Found user: ${user.email} for resume generation`);

    let resumeData;

    if (existingResume) {
      // If existing resume provided, optimize it
      resumeData = {
        markdownContent: existingResume,
        metadata: await extractResumeMetadata(existingResume)
      };
    } else {
      // Generate new resume from prompt
      const userProfile = {
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        preferences: user.preferences || {}
      };

      // Merge with userInfo from request if provided
      if (userInfo) {
        userProfile.firstName = userInfo.name?.split(' ')[0] || userProfile.firstName;
        userProfile.lastName = userInfo.name?.split(' ').slice(1).join(' ') || userProfile.lastName;
        userProfile.email = userInfo.email || userProfile.email;
      }

      // Build enhanced prompt if job description provided
      let enhancedPrompt = prompt;
      if (jobDescription) {
        enhancedPrompt += `\n\nPlease tailor this resume for the following job description:\n${jobDescription}`;
      }

      // Generate resume using LLM service
      resumeData = await llmService.generateResumeFromPrompt(enhancedPrompt, userProfile);
    }

    // Extract metadata and calculate optimization score
    let metadata = resumeData.metadata || await extractResumeMetadata(resumeData.markdownContent);
    
    // Sanitize metadata to ensure correct structure
    metadata = sanitizeMetadata(metadata);
    
    const optimizationScore = calculateOptimizationScore(metadata, resumeData.markdownContent);

    // Create new resume with custom name
    const resume = new Resume({
      userId,
      name: name.trim(),
      originalContent: prompt || existingResume,
      markdownContent: resumeData.markdownContent,
      metadata,
      format: 'ats', // Use ATS-friendly format by default
      optimizationScore,
      isActive: true
    });
    await resume.save();

    // Prepare response in the format expected by frontend
    const response = {
      _id: resume._id,
      resumeId: resume._id.toString(),
      name: resume.name,
      content: resumeData.markdownContent,
      markdownContent: resumeData.markdownContent,
      format: resume.format,
      createdAt: resume.createdAt,
      updatedAt: resume.updatedAt,
      wordCount: resumeData.markdownContent.split(' ').length,
      sections: extractSections(resumeData.markdownContent),
      metadata: metadata,
      optimizationScore: optimizationScore
    };

    console.log(`✅ Resume "${name}" created successfully for user: ${userId}`);
    console.log(`📊 Optimization score: ${optimizationScore}%`);
    console.log(`📝 Word count: ${response.wordCount}`);

    res.json({
      success: true,
      message: 'Resume created successfully',
      data: response
    });

  } catch (error) {
    console.error('❌ Error creating resume with custom name:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to create resume'
    });
  }
};

// Rename resume
const renameResume = async (req, res) => {
  try {
    console.log(`📝 Renaming resume: ${req.params.resumeId} for user: ${req.userId}`);
    const { resumeId } = req.params;
    const { name } = req.body;
    const userId = req.userId;

    if (!name || name.trim() === '') {
      return res.status(400).json({
        success: false,
        error: 'Resume name is required'
      });
    }

    const resume = await Resume.findOne({ _id: resumeId, userId, isActive: true });
    
    if (!resume) {
      console.log(`❌ Resume not found for renaming: ${resumeId}`);
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    resume.name = name.trim();
    await resume.save();

    console.log(`✅ Resume renamed successfully: ${resumeId} -> "${name}"`);
    res.json({
      success: true,
      message: 'Resume renamed successfully',
      data: {
        _id: resume._id,
        name: resume.name
      }
    });

  } catch (error) {
    console.error('❌ Error renaming resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to rename resume'
    });
  }
};

// Delete resume by ID
const deleteResume = async (req, res) => {
  try {
    console.log(`🗑️ Deleting resume: ${req.params.resumeId} for user: ${req.userId}`);
    const { resumeId } = req.params;
    const userId = req.userId;

    const resume = await Resume.findOne({ _id: resumeId, userId, isActive: true });
    
    if (!resume) {
      console.log(`❌ Resume not found for deletion: ${resumeId}`);
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    // Hard delete - completely remove from database
    await Resume.findByIdAndDelete(resumeId);

    // Also clean up any resumes that were optimized from this deleted resume
    // by setting their optimizedFrom field to null
    const optimizedResumes = await Resume.updateMany(
      { optimizedFrom: resumeId },
      { $unset: { optimizedFrom: 1 } }
    );

    if (optimizedResumes.modifiedCount > 0) {
      console.log(`🔗 Cleaned up ${optimizedResumes.modifiedCount} optimized resumes that referenced deleted resume: ${resumeId}`);
    }

    console.log(`✅ Resume permanently deleted from database: ${resumeId}`);
    res.json({
      success: true,
      message: 'Resume deleted successfully'
    });

  } catch (error) {
    console.error('❌ Error deleting resume:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete resume'
    });
  }
};

module.exports = {
  getResume,
  createOrUpdateResume,
  getVersions,
  optimizeResume,
  generatePDF,
  tailorResumeForJob,
  generateFromPrompt,
  createResumeWithName,
  uploadResume,
  modifyResumeWithPrompt,
  getUserResumes,
  getResumeById,
  updateResumeById,
  optimizeResumeById,
  downloadResume,
  renameResume,
  deleteResume
}; 