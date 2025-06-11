const express = require("express");
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const OpenAI = require('openai');
const { v4: uuidv4 } = require('uuid');
const router = express.Router();

// Initialize OpenAI
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || 'your-openai-api-key-here'
});

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    const uploadPath = path.join(__dirname, '../../uploads/resumes');
    try {
      await fs.mkdir(uploadPath, { recursive: true });
      cb(null, uploadPath);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    const uniqueName = `${Date.now()}-${uuidv4()}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.pdf', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only PDF, DOC, DOCX, and TXT files are allowed.'));
    }
  }
});

// Mock user/resume database (replace with actual database)
const userResumes = new Map();

// Generate resume from prompt
router.post("/generate", async (req, res) => {
  try {
    const { prompt, jobDescription, userInfo, existingResume } = req.body;
    
    if (!prompt && !existingResume) {
      return res.status(400).json({
        success: false,
        error: 'Either prompt or existing resume is required'
      });
    }

    // Build the system prompt for resume generation
    const systemPrompt = `You are an expert resume writer and career coach. Generate a professional, ATS-friendly resume in markdown format.

REQUIREMENTS:
- Use clean markdown formatting with proper headers
- Include sections: Summary, Experience, Education, Skills, Projects (if applicable)
- Use bullet points for achievements with quantifiable results when possible
- Optimize for ATS (Applicant Tracking Systems)
- Keep it concise but comprehensive
- Use action verbs and industry keywords
- Make it relevant to the target job description if provided

FORMAT EXAMPLE:
# [Full Name]
**[Title/Role]** | [Email] | [Phone] | [Location] | [LinkedIn]

## Professional Summary
[2-3 lines highlighting key qualifications and experience]

## Experience
### [Job Title] | [Company] | [Date Range]
- [Achievement with quantifiable result]
- [Another achievement]
- [Relevant responsibility]

## Education
### [Degree] | [University] | [Year]
- [Relevant coursework, honors, or achievements]

## Skills
**Technical:** [List technical skills]
**Soft Skills:** [List soft skills]

## Projects (if applicable)
### [Project Name] | [Technologies Used]
- [Brief description and impact]

Return ONLY the markdown content, no explanations or additional text.`;

    let userPrompt = '';
    
    if (existingResume) {
      userPrompt = `Please optimize and improve this existing resume:\n\n${existingResume}`;
      if (jobDescription) {
        userPrompt += `\n\nTarget job description:\n${jobDescription}`;
      }
    } else {
      userPrompt = `Generate a professional resume based on this information:\n\n${prompt}`;
      if (jobDescription) {
        userPrompt += `\n\nTarget job description:\n${jobDescription}`;
      }
      if (userInfo) {
        userPrompt += `\n\nUser information:\n${JSON.stringify(userInfo, null, 2)}`;
      }
    }

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.7,
    });

    const generatedResume = completion.choices[0].message.content;
    
    // Generate unique ID for this resume
    const resumeId = uuidv4();
    
    // Store resume data
    const resumeData = {
      id: resumeId,
      content: generatedResume,
      format: 'markdown',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      prompt: prompt || 'Resume optimization',
      jobDescription: jobDescription || null,
      userInfo: userInfo || null,
      versions: [
        {
          id: uuidv4(),
          content: generatedResume,
          createdAt: new Date().toISOString(),
          type: 'ai-generated'
        }
      ]
    };

    // Store in memory (replace with database)
    const userId = req.user?.id || 'demo-user';
    if (!userResumes.has(userId)) {
      userResumes.set(userId, []);
    }
    userResumes.get(userId).push(resumeData);

    res.json({
      success: true,
      message: 'Resume generated successfully',
      data: {
        resumeId: resumeId,
        content: generatedResume,
        format: 'markdown',
        createdAt: resumeData.createdAt,
        wordCount: generatedResume.split(' ').length,
        sections: extractSections(generatedResume)
      }
    });

  } catch (error) {
    console.error('Resume generation error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate resume. Please try again.'
    });
  }
});

// Upload and parse existing resume
router.post("/upload", upload.single('resume'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded'
      });
    }

    const filePath = req.file.path;
    const fileExtension = path.extname(req.file.originalname).toLowerCase();
    
    let extractedText = '';
    
    // Extract text based on file type
    if (fileExtension === '.txt') {
      extractedText = await fs.readFile(filePath, 'utf-8');
    } else if (fileExtension === '.pdf') {
      // For PDF parsing, you'd need a library like pdf-parse
      extractedText = 'PDF parsing not implemented - please use text file for now';
    } else {
      extractedText = 'File type not fully supported yet - please use text file';
    }

    // Clean up uploaded file
    await fs.unlink(filePath);

    res.json({
      success: true,
      message: 'Resume uploaded and parsed successfully',
      data: {
        extractedText,
        filename: req.file.originalname,
        size: req.file.size
      }
    });

  } catch (error) {
    console.error('Resume upload error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process uploaded resume'
    });
  }
});

// Get user's resumes
router.get("/list", async (req, res) => {
  try {
    const userId = req.user?.id || 'demo-user';
    const resumes = userResumes.get(userId) || [];
    
    res.json({
      success: true,
      data: resumes.map(resume => ({
        id: resume.id,
        createdAt: resume.createdAt,
        updatedAt: resume.updatedAt,
        prompt: resume.prompt,
        wordCount: resume.content.split(' ').length,
        sections: extractSections(resume.content),
        versionsCount: resume.versions.length
      }))
    });

  } catch (error) {
    console.error('Get resumes error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve resumes'
    });
  }
});

// Get specific resume
router.get("/:resumeId", async (req, res) => {
  try {
    const { resumeId } = req.params;
    const userId = req.user?.id || 'demo-user';
    const userResumeList = userResumes.get(userId) || [];
    
    const resume = userResumeList.find(r => r.id === resumeId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    res.json({
      success: true,
      data: resume
    });

  } catch (error) {
    console.error('Get resume error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve resume'
    });
  }
});

// Update resume content
router.put("/:resumeId", async (req, res) => {
  try {
    const { resumeId } = req.params;
    const { content, versionNote } = req.body;
    const userId = req.user?.id || 'demo-user';
    const userResumeList = userResumes.get(userId) || [];
    
    const resumeIndex = userResumeList.findIndex(r => r.id === resumeId);
    
    if (resumeIndex === -1) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    const resume = userResumeList[resumeIndex];
    
    // Add new version
    resume.versions.push({
      id: uuidv4(),
      content: content,
      createdAt: new Date().toISOString(),
      type: 'user-edited',
      note: versionNote || 'Manual edit'
    });
    
    // Update current content
    resume.content = content;
    resume.updatedAt = new Date().toISOString();
    
    userResumeList[resumeIndex] = resume;

    res.json({
      success: true,
      message: 'Resume updated successfully',
      data: {
        resumeId: resume.id,
        content: resume.content,
        updatedAt: resume.updatedAt,
        versionsCount: resume.versions.length
      }
    });

  } catch (error) {
    console.error('Update resume error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update resume'
    });
  }
});

// Download resume in different formats
router.get("/:resumeId/download/:format", async (req, res) => {
  try {
    const { resumeId, format } = req.params;
    const userId = req.user?.id || 'demo-user';
    const userResumeList = userResumes.get(userId) || [];
    
    const resume = userResumeList.find(r => r.id === resumeId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    const content = resume.content;
    const timestamp = new Date().toISOString().split('T')[0];
    
    switch (format.toLowerCase()) {
      case 'markdown':
      case 'md':
        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', `attachment; filename="resume-${timestamp}.md"`);
        res.send(content);
        break;
        
      case 'txt':
        // Convert markdown to plain text (basic conversion)
        const plainText = content
          .replace(/#{1,6}\s+/g, '') // Remove headers
          .replace(/\*\*(.*?)\*\*/g, '$1') // Remove bold
          .replace(/\*(.*?)\*/g, '$1') // Remove italics
          .replace(/`(.*?)`/g, '$1') // Remove code
          .replace(/^\s*-\s+/gm, '• '); // Convert bullets
          
        res.setHeader('Content-Type', 'text/plain');
        res.setHeader('Content-Disposition', `attachment; filename="resume-${timestamp}.txt"`);
        res.send(plainText);
        break;
        
      default:
        res.status(400).json({
          success: false,
          error: 'Unsupported format. Available formats: markdown, txt'
        });
    }

  } catch (error) {
    console.error('Download resume error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to download resume'
    });
  }
});

// Optimize resume for specific job
router.post("/:resumeId/optimize", async (req, res) => {
  try {
    const { resumeId } = req.params;
    const { jobDescription, targetRole, company } = req.body;
    const userId = req.user?.id || 'demo-user';
    const userResumeList = userResumes.get(userId) || [];
    
    const resume = userResumeList.find(r => r.id === resumeId);
    
    if (!resume) {
      return res.status(404).json({
        success: false,
        error: 'Resume not found'
      });
    }

    if (!jobDescription) {
      return res.status(400).json({
        success: false,
        error: 'Job description is required for optimization'
      });
    }

    const optimizationPrompt = `Optimize this resume for the specific job opportunity. 
    
Current Resume:
${resume.content}

Target Job Description:
${jobDescription}

${targetRole ? `Target Role: ${targetRole}` : ''}
${company ? `Company: ${company}` : ''}

Instructions:
- Tailor the resume to match the job requirements
- Include relevant keywords from the job description
- Highlight the most relevant experience and skills
- Optimize for ATS compatibility
- Maintain truthfulness - only emphasize existing experience
- Keep the same markdown format
- Return ONLY the optimized resume content`;

    const completion = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [
        { role: "user", content: optimizationPrompt }
      ],
      max_tokens: 2000,
      temperature: 0.3,
    });

    const optimizedContent = completion.choices[0].message.content;
    
    // Create new version
    resume.versions.push({
      id: uuidv4(),
      content: optimizedContent,
      createdAt: new Date().toISOString(),
      type: 'ai-optimized',
      note: `Optimized for: ${targetRole || 'Job opportunity'}${company ? ` at ${company}` : ''}`
    });

    res.json({
      success: true,
      message: 'Resume optimized successfully',
      data: {
        originalContent: resume.content,
        optimizedContent,
        changes: calculateChanges(resume.content, optimizedContent),
        versionId: resume.versions[resume.versions.length - 1].id
      }
    });

  } catch (error) {
    console.error('Resume optimization error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to optimize resume'
    });
  }
});

// Helper function to extract sections from markdown resume
function extractSections(content) {
  const sections = [];
  const lines = content.split('\n');
  
  for (const line of lines) {
    if (line.startsWith('#')) {
      const level = line.match(/^#+/)[0].length;
      const title = line.replace(/^#+\s*/, '').trim();
      sections.push({ level, title });
    }
  }
  
  return sections;
}

// Helper function to calculate changes between two versions
function calculateChanges(original, updated) {
  const originalLines = original.split('\n').length;
  const updatedLines = updated.split('\n').length;
  
  return {
    lineChanges: updatedLines - originalLines,
    wordChanges: updated.split(' ').length - original.split(' ').length,
    sectionChanges: extractSections(updated).length - extractSections(original).length
  };
}

module.exports = router; 