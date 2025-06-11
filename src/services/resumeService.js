const { generateLLMResponse } = require('./llmService');

// Extract metadata from resume content
const extractResumeMetadata = async (markdownContent) => {
  try {
    const metadata = {
      skills: [],
      experience: {
        totalYears: 0,
        positions: []
      },
      education: [],
      contact: {
        email: null,
        phone: null,
        location: null,
        linkedin: null,
        github: null,
        portfolio: null
      },
      certifications: [],
      languages: [],
      projects: []
    };

    // Extract contact information
    metadata.contact = extractContactInfo(markdownContent);

    // Extract skills
    metadata.skills = extractSkills(markdownContent);

    // Extract experience
    metadata.experience = extractExperience(markdownContent);

    // Extract education
    metadata.education = extractEducation(markdownContent);

    // Extract certifications
    metadata.certifications = extractCertifications(markdownContent);

    // Extract projects
    metadata.projects = extractProjects(markdownContent);

    return metadata;

  } catch (error) {
    console.error('Error extracting resume metadata:', error);
    return getDefaultMetadata();
  }
};

// Optimize resume content with AI
const optimizeResumeWithAI = async (resumeContent, jobDetails = null, targetRole = null, targetSkills = [], userPreferences = {}) => {
  try {
    let prompt = `Please optimize the following resume to make it more ATS-friendly and compelling. Focus on:
1. Adding quantified achievements where possible
2. Using strong action verbs
3. Optimizing keywords for applicant tracking systems
4. Improving formatting and readability
5. Highlighting relevant skills and experience

Resume Content:
${resumeContent}`;

    // Add job-specific optimization if job details provided
    if (jobDetails) {
      prompt += `

Job Details to optimize for:
- Title: ${jobDetails.title}
- Company: ${jobDetails.company}
- Required Skills: ${jobDetails.skills?.join(', ') || 'N/A'}
- Experience Level: ${jobDetails.experienceLevel || 'N/A'}
- Job Description: ${jobDetails.description || 'N/A'}

Please tailor the resume specifically for this job by:
- Emphasizing relevant skills and experience
- Using keywords from the job description
- Adjusting the focus to match the role requirements`;
    }

    // Add target role optimization
    if (targetRole) {
      prompt += `

Target Role: ${targetRole}
Please optimize the resume for this specific role type.`;
    }

    // Add target skills optimization
    if (targetSkills.length > 0) {
      prompt += `

Target Skills to emphasize: ${targetSkills.join(', ')}
Please ensure these skills are prominently featured where relevant.`;
    }

    prompt += `

Please return the optimized resume in markdown format, maintaining the original structure but improving the content.`;

    const optimizedContent = await generateLLMResponse(prompt, 'resume-optimization');

    return optimizedContent || resumeContent;

  } catch (error) {
    console.error('Error optimizing resume with AI:', error);
    return resumeContent; // Return original content if optimization fails
  }
};

// Extract contact information from resume
const extractContactInfo = (content) => {
  const contact = {
    email: null,
    phone: null,
    location: null,
    linkedin: null,
    github: null,
    portfolio: null
  };

  // Email regex
  const emailMatch = content.match(/[\w\.-]+@[\w\.-]+\.\w+/);
  if (emailMatch) contact.email = emailMatch[0];

  // Phone regex (various formats)
  const phoneMatch = content.match(/(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})/);
  if (phoneMatch) contact.phone = phoneMatch[0];

  // LinkedIn
  const linkedinMatch = content.match(/(?:linkedin\.com\/in\/|linkedin\.com\/profile\/view\?id=)([\w\-]+)/i);
  if (linkedinMatch) contact.linkedin = `https://linkedin.com/in/${linkedinMatch[1]}`;

  // GitHub
  const githubMatch = content.match(/(?:github\.com\/)([\w\-]+)/i);
  if (githubMatch) contact.github = `https://github.com/${githubMatch[1]}`;

  // Portfolio/Website
  const websiteMatch = content.match(/(?:https?:\/\/)?(?:www\.)?[\w\-]+\.[\w\-]+(?:\.[\w\-]+)*(?:\/[\w\-._~:/?#[\]@!$&'()*+,;=]*)?/g);
  if (websiteMatch) {
    const portfolio = websiteMatch.find(url => 
      !url.includes('linkedin.com') && 
      !url.includes('github.com') && 
      !url.includes('email')
    );
    if (portfolio) contact.portfolio = portfolio;
  }

  return contact;
};

// Extract skills from resume
const extractSkills = (content) => {
  const skills = [];
  const skillPatterns = [
    /(?:skills?|technologies?|tools?|programming languages?)[:\s\n]+([^#\n]*)/gi,
    /(?:technical skills?|core competencies)[:\s\n]+([^#\n]*)/gi
  ];

  for (const pattern of skillPatterns) {
    const matches = content.match(pattern);
    if (matches) {
      matches.forEach(match => {
        const skillsText = match.replace(/(?:skills?|technologies?|tools?|programming languages?|technical skills?|core competencies)[:\s\n]+/gi, '');
        const extractedSkills = skillsText
          .split(/[,\n•\-\|]/)
          .map(skill => skill.trim())
          .filter(skill => skill.length > 1 && skill.length < 30);
        skills.push(...extractedSkills);
      });
    }
  }

  // Remove duplicates and return unique skills
  return [...new Set(skills)];
};

// Extract work experience from resume
const extractExperience = (content) => {
  const experience = {
    totalYears: 0,
    positions: []
  };

  // Look for experience sections
  const experiencePattern = /(?:experience|work history|employment)[:\s\n]+([\s\S]*?)(?:\n\n|\n#|$)/gi;
  const matches = content.match(experiencePattern);

  if (matches) {
    matches.forEach(match => {
      // Extract individual positions
      const positionPattern = /([^\n]+)\s*\n([^\n]+)\s*\n([^\n]*)/g;
      let positionMatch;
      
      while ((positionMatch = positionPattern.exec(match)) !== null) {
        const [, title, company, duration] = positionMatch;
        
        if (title && company) {
          experience.positions.push({
            title: title.trim(),
            company: company.trim(),
            duration: duration ? duration.trim() : '',
            description: ''
          });
        }
      }
    });
  }

  // Calculate total years (simplified)
  experience.totalYears = Math.max(experience.positions.length * 1.5, 0);

  return experience;
};

// Extract education from resume
const extractEducation = (content) => {
  const education = [];
  const educationPattern = /(?:education|academic background)[:\s\n]+([\s\S]*?)(?:\n\n|\n#|$)/gi;
  const matches = content.match(educationPattern);

  if (matches) {
    matches.forEach(match => {
      const degreePattern = /([^\n]+)\s*\n([^\n]+)\s*\n?([^\n]*)/g;
      let degreeMatch;
      
      while ((degreeMatch = degreePattern.exec(match)) !== null) {
        const [, degree, institution, yearGpa] = degreeMatch;
        
        if (degree && institution) {
          const yearMatch = yearGpa?.match(/\d{4}/);
          const gpaMatch = yearGpa?.match(/GPA[:\s]*(\d+\.?\d*)/i);
          
          education.push({
            degree: degree.trim(),
            institution: institution.trim(),
            year: yearMatch ? parseInt(yearMatch[0]) : null,
            gpa: gpaMatch ? gpaMatch[1] : null
          });
        }
      }
    });
  }

  return education;
};

// Extract certifications from resume
const extractCertifications = (content) => {
  const certifications = [];
  const certPattern = /(?:certifications?|licenses?)[:\s\n]+([\s\S]*?)(?:\n\n|\n#|$)/gi;
  const matches = content.match(certPattern);

  if (matches) {
    matches.forEach(match => {
      const certs = match
        .replace(/(?:certifications?|licenses?)[:\s\n]+/gi, '')
        .split(/[\n•\-]/)
        .map(cert => cert.trim())
        .filter(cert => cert.length > 3);
      certifications.push(...certs);
    });
  }

  return [...new Set(certifications)];
};

// Extract projects from resume
const extractProjects = (content) => {
  const projects = [];
  const projectPattern = /(?:projects?|portfolio)[:\s\n]+([\s\S]*?)(?:\n\n|\n#|$)/gi;
  const matches = content.match(projectPattern);

  if (matches) {
    matches.forEach(match => {
      const projectsText = match.replace(/(?:projects?|portfolio)[:\s\n]+/gi, '');
      const projectLines = projectsText.split('\n').filter(line => line.trim());
      
      projectLines.forEach(line => {
        const projectMatch = line.match(/([^-•]+)(?:-(.*))?/);
        if (projectMatch) {
          const [, name, description] = projectMatch;
          projects.push({
            name: name.trim(),
            description: description ? description.trim() : '',
            technologies: [],
            url: null
          });
        }
      });
    });
  }

  return projects;
};

// Get default metadata structure
const getDefaultMetadata = () => ({
  skills: [],
  experience: {
    totalYears: 0,
    positions: []
  },
  education: [],
  contact: {
    email: null,
    phone: null,
    location: null,
    linkedin: null,
    github: null,
    portfolio: null
  },
  certifications: [],
  languages: [],
  projects: []
});

// Generate resume insights and suggestions
const generateResumeInsights = async (resumeContent, metadata) => {
  try {
    const prompt = `Analyze the following resume and provide insights and improvement suggestions:

Resume Content:
${resumeContent}

Please provide:
1. Overall assessment of the resume quality
2. Specific areas for improvement
3. Missing elements that should be added
4. ATS optimization suggestions
5. Industry-specific recommendations

Please be constructive and specific in your feedback.`;

    const insights = await generateLLMResponse(prompt, 'resume-analysis');
    
    return {
      overall_score: calculateOverallScore(metadata),
      suggestions: parseInsightsSuggestions(insights),
      strengths: parseInsightsStrengths(insights),
      improvements: parseInsightsImprovements(insights)
    };

  } catch (error) {
    console.error('Error generating resume insights:', error);
    return {
      overall_score: 70,
      suggestions: ['Consider adding more quantified achievements'],
      strengths: ['Well-structured format'],
      improvements: ['Add more specific skills and technologies']
    };
  }
};

// Calculate overall resume score
const calculateOverallScore = (metadata) => {
  let score = 0;
  
  // Contact information (20 points)
  if (metadata.contact.email) score += 10;
  if (metadata.contact.phone) score += 5;
  if (metadata.contact.linkedin) score += 5;

  // Skills (30 points)
  if (metadata.skills.length > 8) score += 30;
  else if (metadata.skills.length > 4) score += 20;
  else if (metadata.skills.length > 0) score += 10;

  // Experience (30 points)
  if (metadata.experience.positions.length > 2) score += 30;
  else if (metadata.experience.positions.length > 0) score += 15;

  // Education (10 points)
  if (metadata.education.length > 0) score += 10;

  // Projects (10 points)
  if (metadata.projects.length > 0) score += 10;

  return Math.min(100, score);
};

// Parse suggestions from AI insights
const parseInsightsSuggestions = (insights) => {
  // Simple parsing - in production, use more sophisticated NLP
  const suggestions = [];
  const lines = insights.split('\n');
  
  for (const line of lines) {
    if (line.includes('suggest') || line.includes('recommend') || line.includes('add')) {
      suggestions.push(line.trim());
    }
  }
  
  return suggestions.slice(0, 5); // Limit to 5 suggestions
};

// Parse strengths from AI insights
const parseInsightsStrengths = (insights) => {
  const strengths = [];
  const lines = insights.split('\n');
  
  for (const line of lines) {
    if (line.includes('strength') || line.includes('good') || line.includes('well')) {
      strengths.push(line.trim());
    }
  }
  
  return strengths.slice(0, 3); // Limit to 3 strengths
};

// Parse improvements from AI insights
const parseInsightsImprovements = (insights) => {
  const improvements = [];
  const lines = insights.split('\n');
  
  for (const line of lines) {
    if (line.includes('improve') || line.includes('enhance') || line.includes('better')) {
      improvements.push(line.trim());
    }
  }
  
  return improvements.slice(0, 5); // Limit to 5 improvements
};

module.exports = {
  extractResumeMetadata,
  optimizeResumeWithAI,
  generateResumeInsights,
  extractContactInfo,
  extractSkills,
  extractExperience,
  extractEducation,
  extractCertifications,
  extractProjects,
  calculateOverallScore
}; 