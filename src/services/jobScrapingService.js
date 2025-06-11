const puppeteer = require('puppeteer');
const axios = require('axios');

class JobScrapingService {
  constructor() {
    this.browser = null;
  }

  // Extract LinkedIn job ID from various URL formats
  extractLinkedInJobId(url) {
    try {
      // Handle different LinkedIn job URL formats
      const patterns = [
        /linkedin\.com\/jobs\/view\/(\d+)/,
        /linkedin\.com\/jobs\/collections\/recommended\/(\d+)/,
        /linkedin\.com\/jobs\/search\/.*\/(\d+)/
      ];

      for (const pattern of patterns) {
        const match = url.match(pattern);
        if (match) {
          return match[1];
        }
      }
      
      return null;
    } catch (error) {
      console.error('Error extracting job ID:', error);
      return null;
    }
  }

  // Extract job details from shared text (like "Check out this job at Company: https://...")
  extractJobInfoFromSharedText(sharedText) {
    try {
      // Extract URL from shared text
      const urlMatch = sharedText.match(/https?:\/\/[^\s]+/);
      if (!urlMatch) {
        throw new Error('No URL found in shared text');
      }

      const url = urlMatch[0];
      const jobId = this.extractLinkedInJobId(url);
      
      if (!jobId) {
        throw new Error('Could not extract job ID from URL');
      }

      // Extract company name from shared text if available
      const companyMatch = sharedText.match(/at\s+([^:]+):/i);
      const company = companyMatch ? companyMatch[1].trim() : null;

      return {
        url,
        jobId,
        company,
        originalText: sharedText
      };
    } catch (error) {
      console.error('Error extracting job info from shared text:', error);
      throw error;
    }
  }

  // Scrape job details from LinkedIn (using alternative methods)
  async scrapeJobDetails(jobId) {
    try {
      console.log(`🔍 Scraping job details for job ID: ${jobId}`);

      // Method 1: Try LinkedIn public API or RSS feeds (if available)
      const jobData = await this.tryLinkedInPublicData(jobId);
      if (jobData) {
        return jobData;
      }

      // Method 2: Use Puppeteer as fallback (more complex due to LinkedIn's anti-bot measures)
      return await this.scrapeWithPuppeteer(jobId);

    } catch (error) {
      console.error('Error scraping job details:', error);
      
      // Return a fallback structure if scraping fails
      return {
        jobId,
        title: 'Job Position',
        company: 'Company Name',
        description: 'Job description not available. Please copy and paste the job description manually.',
        location: 'Location not specified',
        requirements: [],
        skills: [],
        scrapingError: true,
        errorMessage: error.message
      };
    }
  }

  // Try to get job data from LinkedIn's public sources
  async tryLinkedInPublicData(jobId) {
    try {
      // Note: LinkedIn has strict policies, so this is a simplified approach
      // In a production environment, you'd want to use LinkedIn's official API
      
      const response = await axios.get(`https://www.linkedin.com/jobs/view/${jobId}`, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; JobOS/1.0; +https://jobos.app/bot)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate',
          'Cache-Control': 'no-cache'
        },
        timeout: 10000
      });

      // Parse the HTML response for job details
      return this.parseJobFromHTML(response.data, jobId);

    } catch (error) {
      console.log('Public data fetch failed, will try alternative methods');
      return null;
    }
  }

  // Parse job details from HTML
  parseJobFromHTML(html, jobId) {
    try {
      // Extract title from multiple possible locations
      let title = 'Job Position';
      
      // Try different title patterns
      const titlePatterns = [
        /<h1[^>]*class="[^"]*job-title[^"]*"[^>]*>([^<]+)<\/h1>/i,
        /<h1[^>]*class="[^"]*top-card-layout__title[^"]*"[^>]*>([^<]+)<\/h1>/i,
        /<title[^>]*>([^<]+)<\/title>/i,
        /hiring ([^"]+) in/i,
        /hiring a[^,]*,([^"]+) to/i
      ];

      for (const pattern of titlePatterns) {
        const match = html.match(pattern);
        if (match) {
          title = match[1].replace(' | LinkedIn', '').replace('hiring ', '').trim();
          break;
        }
      }

      // Extract company name
      let company = 'Company Name';
      
      const companyPatterns = [
        /at ([^:]{2,50}):/i,  // "at Company:"
        /hiring for this role[^>]*>([^<]+)</i,
        /"companyName":"([^"]+)"/i,
        /class="[^"]*company[^"]*"[^>]*>([^<]+)</i
      ];

      for (const pattern of companyPatterns) {
        const match = html.match(pattern);
        if (match) {
          company = match[1].trim();
          break;
        }
      }

      // Extract job description with better patterns for LinkedIn's current structure
      let description = 'Job description not available';
      
      const descriptionPatterns = [
        // LinkedIn's current structure with show-more-less-html
        /class="show-more-less-html__markup[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        // Alternative description containers
        /class="description__text[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        /class="[^"]*job-description[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
        // Fallback patterns
        /<section[^>]*description[^>]*>([\s\S]*?)<\/section>/i
      ];

      for (const pattern of descriptionPatterns) {
        const match = html.match(pattern);
        if (match) {
          description = match[1]
            .replace(/<[^>]*>/g, ' ')  // Remove HTML tags
            .replace(/\s+/g, ' ')      // Normalize whitespace
            .replace(/&[^;]+;/g, ' ')  // Remove HTML entities
            .trim();
          
          if (description.length > 50) { // Only use if we got substantial content
            break;
          }
        }
      }

      // Extract location if available
      let location = 'Location not specified';
      const locationPatterns = [
        /class="[^"]*location[^"]*"[^>]*>([^<]+)</i,
        /"location":"([^"]+)"/i
      ];

      for (const pattern of locationPatterns) {
        const match = html.match(pattern);
        if (match) {
          location = match[1].trim();
          break;
        }
      }

      // Clean up extracted data
      if (description === 'Job description not available' || description.length < 50) {
        // Try to extract at least some content from paragraphs
        const paragraphMatches = html.match(/<p[^>]*>([^<]+)<\/p>/gi);
        if (paragraphMatches && paragraphMatches.length > 0) {
          description = paragraphMatches
            .slice(0, 3) // Take first 3 paragraphs
            .map(p => p.replace(/<[^>]*>/g, '').trim())
            .filter(p => p.length > 20)
            .join(' ');
        }
      }

      console.log('📋 Parsed job details:', {
        title: title.substring(0, 100),
        company: company.substring(0, 50),
        description: description.substring(0, 200) + '...',
        location
      });

      return {
        jobId,
        title,
        company,
        description,
        location,
        requirements: this.extractRequirements(description),
        skills: this.extractSkills(description),
        scrapingError: false
      };

    } catch (error) {
      console.error('Error parsing job from HTML:', error);
      return null;
    }
  }

  // Use Puppeteer for more advanced scraping (use carefully due to LinkedIn's policies)
  async scrapeWithPuppeteer(jobId) {
    let browser = null;
    try {
      console.log('🤖 Using Puppeteer for job scraping');
      
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=VizDisplayCompositor'
        ]
      });

      const page = await browser.newPage();
      
      // Set user agent to appear more like a regular browser
      await page.setUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      
      const url = `https://www.linkedin.com/jobs/view/${jobId}`;
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });

      // Wait for content to load
      await page.waitForTimeout(3000);

      // Extract job details
      const jobData = await page.evaluate(() => {
        const getTextContent = (selector) => {
          const element = document.querySelector(selector);
          return element ? element.textContent.trim() : '';
        };

        // More comprehensive selectors for LinkedIn's current structure
        const titleSelectors = [
          'h1[data-test-id="job-title"]',
          'h1.top-card-layout__title',
          '.jobs-unified-top-card__job-title h1',
          '.job-details-jobs-unified-top-card__job-title h1',
          'h1'
        ];

        const companySelectors = [
          '[data-test-id="job-details-company-name"]',
          '.top-card-layout__entity-info h3',
          '.jobs-unified-top-card__company-name',
          '.job-details-jobs-unified-top-card__company-name',
          'h3'
        ];

        const locationSelectors = [
          '[data-test-id="job-details-location"]',
          '.top-card-layout__entity-info h4',
          '.jobs-unified-top-card__bullet',
          '.job-details-jobs-unified-top-card__primary-description-container span'
        ];

        const descriptionSelectors = [
          '.show-more-less-html__markup',
          '.description__text--rich .show-more-less-html__markup',
          '[data-test-id="job-details-description"]',
          '.description__text',
          '.job-description',
          '.jobs-description-content__text'
        ];

        let title = '';
        let company = '';
        let location = '';
        let description = '';

        // Try each selector until we find content
        for (const selector of titleSelectors) {
          title = getTextContent(selector);
          if (title && title.length > 5) break;
        }

        for (const selector of companySelectors) {
          company = getTextContent(selector);
          if (company && company.length > 2) break;
        }

        for (const selector of locationSelectors) {
          location = getTextContent(selector);
          if (location && location.length > 3) break;
        }

        for (const selector of descriptionSelectors) {
          description = getTextContent(selector);
          if (description && description.length > 100) break;
        }

        // If description is still empty, try to get any paragraph content
        if (!description || description.length < 50) {
          const paragraphs = document.querySelectorAll('.description__text p, .show-more-less-html__markup p');
          if (paragraphs.length > 0) {
            description = Array.from(paragraphs)
              .slice(0, 5)
              .map(p => p.textContent.trim())
              .filter(text => text.length > 20)
              .join(' ');
          }
        }

        return {
          title: title || 'Job Position',
          company: company || 'Company Name',
          location: location || 'Location not specified',
          description: description || 'Job description not available'
        };
      });

      await browser.close();

      return {
        jobId,
        title: jobData.title || 'Job Position',
        company: jobData.company || 'Company Name',
        description: jobData.description || 'Job description not available',
        location: jobData.location || 'Location not specified',
        requirements: this.extractRequirements(jobData.description),
        skills: this.extractSkills(jobData.description),
        scrapingError: false
      };

    } catch (error) {
      if (browser) {
        await browser.close();
      }
      console.error('Puppeteer scraping failed:', error);
      throw error;
    }
  }

  // Extract requirements from job description
  extractRequirements(description) {
    if (!description) return [];

    const requirements = [];
    const text = description.toLowerCase();

    // Common requirement patterns
    const patterns = [
      /(\d+)\+?\s*years?\s+of\s+experience/g,
      /bachelor'?s?\s+degree/g,
      /master'?s?\s+degree/g,
      /phd/g,
      /experience\s+with\s+([^.,\n]{5,40})/g,
      /knowledge\s+of\s+([^.,\n]{5,40})/g,
      /proficiency\s+in\s+([^.,\n]{5,40})/g,
      /familiar\s+with\s+([^.,\n]{5,40})/g,
      /hands-on\s+experience\s+([^.,\n]{5,40})/g,
      /strong\s+([^.,\n]{5,40})\s+skills/g,
      /must\s+have\s+([^.,\n]{5,40})/g,
      /required:\s*([^.,\n]{5,40})/g,
      /minimum\s+(\d+)\s+years/g,
      /proven\s+experience\s+([^.,\n]{5,40})/g
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const requirement = match[1] ? match[1].trim() : match[0].trim();
        if (requirement.length > 4 && requirement.length < 100) {
          requirements.push(requirement);
        }
      }
    });

    // Remove duplicates and clean up
    const uniqueRequirements = [...new Set(requirements)]
      .map(req => req.charAt(0).toUpperCase() + req.slice(1))
      .filter(req => req.length > 4);

    return uniqueRequirements.slice(0, 15); // Limit to top 15 requirements
  }

  // Extract skills from job description
  extractSkills(description) {
    if (!description) return [];

    const skills = [];
    const text = description.toLowerCase();

    // Comprehensive tech skills database
    const techSkills = [
      // Programming Languages
      'javascript', 'python', 'java', 'typescript', 'c++', 'c#', 'go', 'rust', 'swift', 'kotlin',
      'php', 'ruby', 'scala', 'r', 'matlab', 'perl',
      
      // Web Technologies
      'react', 'angular', 'vue', 'node.js', 'express', 'html', 'css', 'sass', 'less',
      'jquery', 'bootstrap', 'tailwind', 'webpack', 'vite',
      
      // Backend & Databases
      'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'elasticsearch', 'firebase',
      'dynamodb', 'cassandra', 'oracle', 'sqlite',
      
      // Cloud & DevOps
      'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'terraform', 'ansible',
      'jenkins', 'gitlab', 'github actions', 'circleci',
      
      // AI/ML
      'machine learning', 'deep learning', 'ai', 'artificial intelligence', 'tensorflow',
      'pytorch', 'scikit-learn', 'pandas', 'numpy', 'jupyter', 'llm', 'nlp', 'computer vision',
      'neural networks', 'data science', 'statistics',
      
      // APIs & Integration
      'rest api', 'graphql', 'microservices', 'api design', 'webhooks', 'grpc',
      
      // Tools & Frameworks
      'git', 'jira', 'confluence', 'slack', 'linux', 'unix', 'bash', 'powershell',
      'agile', 'scrum', 'kanban', 'project management',
      
      // Mobile
      'ios', 'android', 'react native', 'flutter', 'xamarin',
      
      // Other
      'data analysis', 'business intelligence', 'etl', 'reporting', 'testing',
      'debugging', 'optimization', 'security', 'encryption'
    ];

    // Also look for skill patterns in the text
    const skillPatterns = [
      /proficient\s+in\s+([a-zA-Z\s.+#-]{3,25})/g,
      /experience\s+with\s+([a-zA-Z\s.+#-]{3,25})/g,
      /knowledge\s+of\s+([a-zA-Z\s.+#-]{3,25})/g,
      /skilled\s+in\s+([a-zA-Z\s.+#-]{3,25})/g,
      /familiar\s+with\s+([a-zA-Z\s.+#-]{3,25})/g
    ];

    // Find exact skill matches
    techSkills.forEach(skill => {
      if (text.includes(skill.toLowerCase())) {
        skills.push(skill);
      }
    });

    // Extract skills from patterns
    skillPatterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const potentialSkill = match[1].trim().toLowerCase();
        // Check if it's a known tech skill or looks like a technology
        if (techSkills.includes(potentialSkill) || 
            potentialSkill.match(/^[a-z]+(\.[a-z]+)?(\s+[a-z]+)?$/)) {
          skills.push(potentialSkill);
        }
      }
    });

    // Remove duplicates and clean up
    const uniqueSkills = [...new Set(skills)]
      .map(skill => skill.charAt(0).toUpperCase() + skill.slice(1))
      .filter(skill => skill.length > 1 && skill.length < 30);

    return uniqueSkills.slice(0, 20); // Limit to top 20 skills
  }

  // Clean up resources
  async cleanup() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

module.exports = new JobScrapingService(); 