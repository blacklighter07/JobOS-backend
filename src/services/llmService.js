const OpenAI = require('openai');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const Anthropic = require('@anthropic-ai/sdk');

class LLMService {
  constructor() {
    // Initialize OpenAI (if API key is available)
    if (process.env.OPENAI_API_KEY) {
      this.openai = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY
      });
    }
    
    // Initialize Gemini (required as default)
    if (!process.env.GEMINI_API_KEY) {
      console.error('❌ GEMINI_API_KEY is required in environment variables');
      throw new Error('GEMINI_API_KEY is required');
    }
    this.gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    
    // Initialize Anthropic (if API key is available)
    if (process.env.ANTHROPIC_API_KEY) {
      this.anthropic = new Anthropic({
        apiKey: process.env.ANTHROPIC_API_KEY
      });
    }
    
    // Switch to Gemini as default provider
    this.defaultProvider = process.env.DEFAULT_LLM_PROVIDER || 'gemini';
    
    console.log(`🤖 LLM Service initialized with provider: ${this.defaultProvider}`);
    console.log(`✅ Gemini API configured and ready`);
  }

  async generateResumeFromPrompt(userInput, userProfile) {
    try {
      const prompt = this.buildResumeGenerationPrompt(userInput, userProfile);
      
      let response;
      try {
        switch (this.defaultProvider) {
          case 'openai':
            if (!this.openai) throw new Error('OpenAI not configured');
            response = await this.callOpenAI(prompt);
            break;
          case 'gemini':
            response = await this.callGemini(prompt);
            break;
          case 'anthropic':
            if (!this.anthropic) throw new Error('Anthropic not configured');
            response = await this.callAnthropic(prompt);
            break;
          default:
            // Default to Gemini if no specific provider or if provider is not available
            response = await this.callGemini(prompt);
        }
      } catch (apiError) {
        console.error('❌ LLM API Error:', apiError.message);
        
        // Try Gemini as fallback if another provider fails
        if (this.defaultProvider !== 'gemini') {
          try {
            console.log('🔄 Trying Gemini as fallback...');
            response = await this.callGemini(prompt);
          } catch (geminiError) {
            console.error('❌ Gemini fallback also failed:', geminiError.message);
            console.log('🔄 Generating fallback resume due to all LLM API errors');
            response = this.generateFallbackResume(userInput, userProfile);
          }
        } else {
          // If Gemini itself failed, go straight to fallback
          console.log('🔄 Generating fallback resume due to Gemini API error');
          response = this.generateFallbackResume(userInput, userProfile);
        }
      }
      
      return this.parseResumeResponse(response);
    } catch (error) {
      console.error('❌ Error generating resume:', error);
      throw new Error('Failed to generate resume. Please try again.');
    }
  }

  async tailorResumeToJob(resumeContent, jobDescription, userProfile) {
    try {
      const prompt = this.buildResumeTailoringPrompt(resumeContent, jobDescription, userProfile);
      
      const response = await this.callOpenAI(prompt);
      const tailoredResume = this.parseResumeResponse(response);
      
      // Calculate match score
      const matchScore = await this.calculateJobMatch(tailoredResume.markdownContent, jobDescription);
      
      return {
        markdownContent: tailoredResume.markdownContent,
        matchScore
      };
    } catch (error) {
      console.error('Error tailoring resume:', error);
      throw new Error('Failed to tailor resume');
    }
  }

  async extractSkillsFromResume(resumeContent) {
    try {
      const prompt = `
        Extract all technical skills, soft skills, and tools mentioned in this resume.
        Return a JSON object with categorized skills:
        
        Resume:
        ${resumeContent}
        
        Return format:
        {
          "technical": ["skill1", "skill2"],
          "soft": ["skill1", "skill2"],
          "tools": ["tool1", "tool2"],
          "languages": ["lang1", "lang2"],
          "frameworks": ["framework1", "framework2"]
        }
      `;
      
      const response = await this.callOpenAI(prompt, 'gpt-3.5-turbo');
      return JSON.parse(response);
    } catch (error) {
      console.error('Error extracting skills:', error);
      return {
        technical: [],
        soft: [],
        tools: [],
        languages: [],
        frameworks: []
      };
    }
  }

  async calculateJobMatch(resumeContent, jobDescription) {
    try {
      const prompt = `
        Analyze the match between this resume and job description.
        Provide a detailed scoring breakdown and overall match percentage.
        
        Resume:
        ${resumeContent}
        
        Job Description:
        ${jobDescription}
        
        Return a JSON object with:
        {
          "overallMatch": 85,
          "skillsMatch": 90,
          "experienceMatch": 80,
          "educationMatch": 95,
          "matchingSkills": ["skill1", "skill2"],
          "missingSkills": ["skill3", "skill4"],
          "strongPoints": ["point1", "point2"],
          "improvementAreas": ["area1", "area2"],
          "confidenceScore": 78,
          "reasoning": "Detailed explanation of the match analysis"
        }
      `;
      
      const response = await this.callOpenAI(prompt);
      return JSON.parse(response);
    } catch (error) {
      console.error('Error calculating job match:', error);
      return {
        overallMatch: 0,
        skillsMatch: 0,
        experienceMatch: 0,
        educationMatch: 0,
        matchingSkills: [],
        missingSkills: [],
        strongPoints: [],
        improvementAreas: [],
        confidenceScore: 0,
        reasoning: 'Unable to analyze match'
      };
    }
  }

  async generateCoverLetter(resumeContent, jobDescription, company) {
    try {
      const prompt = `
        Generate a personalized cover letter based on the resume and job description.
        Make it professional, engaging, and specifically tailored to the role and company.
        
        Resume:
        ${resumeContent}
        
        Job Description:
        ${jobDescription}
        
        Company: ${company}
        
        Return a well-formatted cover letter that:
        - Addresses the specific role and company
        - Highlights relevant experience and skills
        - Shows enthusiasm for the position
        - Is professional yet personable
        - Is approximately 300-400 words
      `;
      
      const response = await this.callOpenAI(prompt);
      return response;
    } catch (error) {
      console.error('Error generating cover letter:', error);
      throw new Error('Failed to generate cover letter');
    }
  }

  async optimizeResumeForATS(resumeContent) {
    try {
      const prompt = `
        Optimize this resume for ATS (Applicant Tracking Systems) while maintaining its content and impact.
        
        Resume:
        ${resumeContent}
        
        Improvements to make:
        - Use standard section headers
        - Include more relevant keywords
        - Improve formatting for ATS readability
        - Optimize bullet points for impact
        - Ensure proper formatting
        
        Return the optimized resume in markdown format.
      `;
      
      const response = await this.callOpenAI(prompt);
      return response;
    } catch (error) {
      console.error('Error optimizing resume for ATS:', error);
      throw new Error('Failed to optimize resume');
    }
  }

  async generateInterviewQuestions(jobDescription, resumeContent) {
    try {
      const prompt = `
        Generate potential interview questions for this job based on the description and candidate's resume.
        Include behavioral, technical, and situational questions.
        
        Job Description:
        ${jobDescription}
        
        Resume:
        ${resumeContent}
        
        Return a JSON object with:
        {
          "behavioral": ["question1", "question2"],
          "technical": ["question1", "question2"],
          "situational": ["question1", "question2"],
          "companySpecific": ["question1", "question2"]
        }
      `;
      
      const response = await this.callOpenAI(prompt);
      return JSON.parse(response);
    } catch (error) {
      console.error('Error generating interview questions:', error);
      return {
        behavioral: [],
        technical: [],
        situational: [],
        companySpecific: []
      };
    }
  }

  // Private helper methods
  buildResumeGenerationPrompt(userInput, userProfile) {
    return `
      Generate a professional, ATS-optimized resume based on the following information:
      
      User Input: ${userInput}
      
      User Profile:
      - Name: ${userProfile.firstName} ${userProfile.lastName}
      - Email: ${userProfile.email}
      - Experience Level: ${userProfile.preferences?.experience || 'mid'}
      - Target Domains: ${userProfile.preferences?.domains?.join(', ') || 'Various'}
      - Skills: ${userProfile.preferences?.specificSkills?.join(', ') || 'To be determined'}
      
      IMPORTANT FORMATTING REQUIREMENTS:
      - Use the EXACT format structure shown below
      - Start with the person's full name as H1
      - Follow with contact information on separate lines
      - Use standard section headers (Professional Summary, Experience, Education, Skills)
      - Include quantified achievements in bullet points
      - Use action verbs (Developed, Managed, Implemented, Led, etc.)
      - Make it ATS-friendly with proper keywords
      - Ensure proper markdown formatting
      
      FORMAT TEMPLATE:
      
      # [First Name Last Name]
      
      ### [Professional Title]
      [Email] | [Phone] | [Location] | [LinkedIn URL]
      
      ## Professional Summary
      
      [2-3 lines highlighting key qualifications, years of experience, and value proposition]
      
      ## Experience
      
      ### [Job Title] | [Company Name]
      **[Start Date] - [End Date]** | [Location]
      
      - [Achievement with quantified result using numbers/percentages]
      - [Another achievement showing impact and skills used]
      - [Responsibility demonstrating relevant expertise]
      
      ### [Previous Job Title] | [Previous Company]
      **[Start Date] - [End Date]** | [Location]
      
      - [Achievement with quantified result]
      - [Another achievement or responsibility]
      
      ## Education
      
      ### [Degree] | [University/Institution]
      **[Graduation Year]** | [Location]
      
      - [Relevant coursework, honors, GPA if notable, or achievements]
      
      ## Skills
      
      **Technical Skills:** [List relevant technical skills, tools, programming languages]
      **Soft Skills:** [Communication, Leadership, Problem-solving, etc.]
      **Tools & Technologies:** [Software, platforms, frameworks used]
      
      ## Projects (if applicable)
      
      ### [Project Name]
      **[Technologies Used]** | [Date]
      
      - [Brief description of project and your role]
      - [Impact or results achieved]
      
      Create a comprehensive resume following this EXACT structure. Include realistic but impressive achievements with specific numbers where possible.
      
      Return ONLY the resume content in clean markdown format, following the exact template structure above. Do not include any JSON wrapping or metadata - just the raw markdown content.
    `;
  }

  buildResumeTailoringPrompt(resumeContent, jobDescription, userProfile) {
    return `
      Tailor this resume to match the job description while maintaining truthfulness.
      Focus on highlighting relevant experience and skills.
      
      Current Resume:
      ${resumeContent}
      
      Job Description:
      ${jobDescription}
      
      Instructions:
      - Reorder sections to highlight most relevant experience first
      - Emphasize skills and keywords from the job description
      - Quantify achievements where possible
      - Maintain all factual information
      - Optimize for ATS scanning
      
      Return ONLY the tailored resume content in clean markdown format. Do not include any JSON wrapping or explanations - just the raw markdown content.
    `;
  }

  async callOpenAI(prompt, model = 'gpt-4') {
    const response = await this.openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: 'system',
          content: 'You are an expert resume writer and career coach. Provide professional, accurate, and helpful responses.'
        },
        {
          role: 'user',
          content: prompt
        }
      ],
      temperature: 0.7,
      max_tokens: 4000
    });
    
    return response.choices[0].message.content;
  }

  async callGemini(prompt) {
    try {
      console.log('🔮 Calling Gemini API...');
      
      // Use the latest Gemini model
      const model = this.gemini.getGenerativeModel({ 
        model: 'gemini-1.5-flash', // Latest Gemini model
        generationConfig: {
          temperature: 0.7,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 4096,
        },
      });
      
      const result = await model.generateContent(prompt);
      
      const response = await result.response;
      const text = response.text();
      
      console.log('✅ Gemini API call successful');
      return text;
    } catch (error) {
      console.error('❌ Gemini API error:', error.message);
      throw error;
    }
  }

  async callAnthropic(prompt) {
    const response = await this.anthropic.messages.create({
      model: 'claude-3-sonnet-20240229',
      max_tokens: 4000,
      messages: [
        {
          role: 'user',
          content: prompt
        }
      ]
    });
    
    return response.content[0].text;
  }

  parseResumeResponse(response) {
    try {
      const parsed = JSON.parse(response);
      // If it's a parsed JSON with markdownContent, return just the markdownContent
      if (parsed.markdownContent) {
        return {
          markdownContent: parsed.markdownContent
        };
      }
      // If it's a different structure, treat it as markdown content
      return {
        markdownContent: response
      };
    } catch (error) {
      // If JSON parsing fails, return the response as clean markdown content
      return {
        markdownContent: response
      };
    }
  }

  generateFallbackResume(userInput, userProfile) {
    console.log('📝 Creating fallback resume template');
    
    const name = `${userProfile.firstName || 'John'} ${userProfile.lastName || 'Doe'}`;
    const email = userProfile.email || 'john.doe@email.com';
    
    // Extract basic info from user input
    const skills = this.extractSkillsFromText(userInput);
    const experience = this.extractExperienceFromText(userInput);
    
    const resumeContent = `# ${name}

### Professional
[${email}] | [Your Phone] | [Your Location] | [LinkedIn Profile]

## Professional Summary

Motivated professional with experience in ${experience.field || 'various fields'}. Demonstrated ability to ${experience.achievements || 'deliver results and contribute to team success'}. Seeking to leverage skills and experience in a challenging new role.

## Experience

### ${experience.title || 'Professional Role'} | ${experience.company || 'Previous Company'}
**${experience.duration || '2020 - Present'}** | [Location]

- Successfully ${experience.accomplishment1 || 'managed projects and delivered quality results'}
- Collaborated with cross-functional teams to ${experience.accomplishment2 || 'achieve business objectives'}
- Developed and implemented ${experience.accomplishment3 || 'process improvements that increased efficiency'}

## Education

### [Your Degree] | [University Name]
**[Graduation Year]** | [Location]

- Relevant coursework in [Field of Study]
- [Honors, GPA, or relevant achievements]

## Skills

**Technical Skills:** ${skills.technical.join(', ') || 'Microsoft Office, Project Management, Data Analysis'}
**Soft Skills:** ${skills.soft.join(', ') || 'Communication, Leadership, Problem-solving, Team Collaboration'}
**Tools & Technologies:** ${skills.tools.join(', ') || 'Various software applications and tools'}

## Projects

### [Project Name]
**[Technologies Used]** | [Date]

- [Brief description of project and your role]
- [Impact or results achieved]

---
*This resume was generated using Job OS. Please review and customize with your specific details.*`;

    return {
      markdownContent: resumeContent
    };
  }

  extractSkillsFromText(text) {
    const commonSkills = {
      technical: ['JavaScript', 'Python', 'SQL', 'Excel', 'PowerPoint'],
      soft: ['Communication', 'Leadership', 'Problem-solving', 'Team Collaboration'],
      tools: ['Microsoft Office', 'Google Workspace', 'Project Management Tools']
    };

    // Simple keyword extraction (can be enhanced)
    const lowerText = text.toLowerCase();
    
    const foundTechnical = [];
    const foundSoft = [];
    const foundTools = [];

    // Add more sophisticated extraction logic here
    if (lowerText.includes('javascript') || lowerText.includes('js')) foundTechnical.push('JavaScript');
    if (lowerText.includes('python')) foundTechnical.push('Python');
    if (lowerText.includes('sql') || lowerText.includes('database')) foundTechnical.push('SQL');
    if (lowerText.includes('excel')) foundTools.push('Excel');
    if (lowerText.includes('management') || lowerText.includes('lead')) foundSoft.push('Leadership');
    if (lowerText.includes('communication')) foundSoft.push('Communication');

    return {
      technical: foundTechnical.length > 0 ? foundTechnical : commonSkills.technical,
      soft: foundSoft.length > 0 ? foundSoft : commonSkills.soft,
      tools: foundTools.length > 0 ? foundTools : commonSkills.tools
    };
  }

  extractExperienceFromText(text) {
    const lowerText = text.toLowerCase();
    
    let field = 'Technology';
    let title = 'Software Developer';
    let company = 'Tech Company';
    
    // Simple field detection
    if (lowerText.includes('marketing')) {
      field = 'Marketing';
      title = 'Marketing Specialist';
      company = 'Marketing Agency';
    } else if (lowerText.includes('sales')) {
      field = 'Sales';
      title = 'Sales Representative';
      company = 'Sales Organization';
    } else if (lowerText.includes('design')) {
      field = 'Design';
      title = 'Designer';
      company = 'Design Studio';
    } else if (lowerText.includes('finance')) {
      field = 'Finance';
      title = 'Financial Analyst';
      company = 'Financial Services';
    }

    return {
      field,
      title,
      company,
      duration: '2021 - Present',
      achievements: 'deliver innovative solutions',
      accomplishment1: 'led successful projects',
      accomplishment2: 'improve team productivity',
      accomplishment3: 'streamline processes'
    };
  }
}

// Export both class and instance
const llmServiceInstance = new LLMService();

// Legacy function for backward compatibility
const generateLLMResponse = async (prompt, type = 'general') => {
  try {
    console.log(`🤖 Generating LLM response for type: ${type} using Gemini`);
    const response = await llmServiceInstance.callGemini(prompt);
    console.log(`✅ LLM response generated successfully with Gemini`);
    return response;
  } catch (error) {
    console.error('❌ Error generating LLM response with Gemini:', error);
    throw error;
  }
};

module.exports = llmServiceInstance;
module.exports.LLMService = LLMService;
module.exports.generateLLMResponse = generateLLMResponse; 