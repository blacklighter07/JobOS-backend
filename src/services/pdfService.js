let puppeteer;
try {
  puppeteer = require('puppeteer');
} catch (error) {
  console.warn('Puppeteer not available. PDF generation features will be disabled.');
  puppeteer = null;
}
const { marked } = require('marked');
const path = require('path');
const fs = require('fs').promises;

// Generate PDF from resume content
const generateResumePDF = async (markdownContent, format = 'ats', userId, resumeId, resumeName) => {
  if (!puppeteer) {
    throw new Error('PDF generation is not available. Puppeteer is not installed.');
  }
  
  let browser;
  try {
    // Convert markdown to HTML and enhance structure
    let htmlContent = marked(markdownContent);
    
    // Enhance HTML structure for better ATS compatibility
    htmlContent = enhanceResumeHTML(htmlContent);
    
    // Get CSS styles based on format
    const styles = getResumeStyles(format);
    
    // Create complete HTML document
    const fullHtml = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Resume</title>
    <style>
        ${styles}
    </style>
</head>
<body>
    <div class="resume-container">
        ${htmlContent}
    </div>
</body>
</html>`;

    // Launch puppeteer
    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor',
        '--disable-gpu',
        '--no-first-run',
        '--no-zygote'
      ],
      executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || (process.env.NODE_ENV === 'production' ? '/usr/bin/chromium' : undefined)
    });
    
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    
    // Generate PDF
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });

    await browser.close();

    // Save PDF to storage with better naming
    const timestamp = Date.now();
    const sanitizedName = resumeName ? resumeName.toLowerCase().replace(/[^a-z0-9]/g, '_') : 'resume';
    const fileName = `${sanitizedName}_${resumeId || userId}_${timestamp}.pdf`;
    const filePath = await savePDFToStorage(pdfBuffer, fileName);
    
    return filePath;

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('Error in PDF generation service:', error);
    throw new Error('Failed to generate PDF');
  }
};

// Enhance HTML structure for better ATS compatibility
const enhanceResumeHTML = (htmlContent) => {
  // Wrap contact info in a proper structure - handle new format with H3 profession title
  htmlContent = htmlContent.replace(
    /(<h1[^>]*>.*?<\/h1>)([\s\S]*?)(?=<h2|$)/i,
    (match, h1, content) => {
      // Check if there's an H3 (profession title) in the content
      const h3Match = content.match(/(<h3[^>]*>.*?<\/h3>)([\s\S]*)/);
      
      if (h3Match) {
        // We have H3 profession title
        const h3Element = h3Match[1];
        const afterH3Content = h3Match[2];
        
                 // Extract contact info from content after H3
         const contactText = afterH3Content.replace(/<[^>]*>/g, '').trim();
         const lines = contactText.split('\n').filter(line => line.trim() && !line.match(/^\s*$/));
         const contactInfo = lines.length > 0 ? lines.join(' | ') : '';
        
                 return `
           <div class="header">
             ${h1}
             <div class="profession-title">
               ${h3Element}
             </div>
             ${contactInfo ? `<div class="contact-info"><p>${contactInfo}</p></div>` : ''}
           </div>
         `;
      } else {
        // Original format without H3 profession title
        const contactMatch = content.match(/(.*?)(?=<h2|$)/s);
        if (contactMatch) {
          const contactText = contactMatch[1].trim();
                     if (contactText) {
             const lines = contactText.replace(/<[^>]*>/g, '').split('\n').filter(line => line.trim() && !line.match(/^\s*$/));
             const contactInfo = lines.length > 0 ? lines.join(' | ') : '';
            
                         return `
               <div class="header">
                 ${h1}
                 ${contactInfo ? `<div class="contact-info"><p>${contactInfo}</p></div>` : ''}
               </div>
             `;
          }
        }
        return `<div class="header">${h1}</div>`;
      }
    }
  );

  // Wrap each major section
  htmlContent = htmlContent.replace(
    /<h2[^>]*>(.*?)<\/h2>([\s\S]*?)(?=<h2|$)/gi,
    '<div class="section"><h2>$1</h2>$2</div>'
  );

  // Enhance job entries for better structure
  htmlContent = htmlContent.replace(
    /<h3[^>]*>(.*?)<\/h3>/gi,
    '<div class="job-entry"><h3>$1</h3></div>'
  );

  // Fix nested job entries
  htmlContent = htmlContent.replace(
    /<div class="job-entry"><h3>(.*?)<\/h3><\/div>([\s\S]*?)(?=<div class="job-entry">|<\/div>|$)/gi,
    '<div class="job-entry"><h3>$1</h3>$2</div>'
  );

  return htmlContent;
};

// Save PDF buffer to storage
const savePDFToStorage = async (buffer, fileName) => {
  try {
    // In production, save to cloud storage (AWS S3, GCS, etc.)
    // For now, save to local uploads directory
    const uploadsDir = path.join(__dirname, '../../uploads/resumes');
    
    // Ensure directory exists
    try {
      await fs.access(uploadsDir);
    } catch {
      await fs.mkdir(uploadsDir, { recursive: true });
    }

    const filePath = path.join(uploadsDir, fileName);
    await fs.writeFile(filePath, buffer);

    // Return URL or file path
    const baseUrl = process.env.BASE_URL || 'http://localhost:5001';
    return `${baseUrl}/uploads/resumes/${fileName}`;

  } catch (error) {
    console.error('Error saving PDF to storage:', error);
    throw new Error('Failed to save PDF');
  }
};

// Get CSS styles for different resume formats
const getResumeStyles = (format) => {
  const baseStyles = `
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    
    body {
      font-family: 'Arial', 'Helvetica', sans-serif;
      line-height: 1.4;
      color: #000;
      font-size: 11pt;
      background: white;
    }
    
    .resume-container {
      max-width: 100%;
      margin: 0;
      padding: 0.5in;
      background: white;
    }
    
    /* Header/Name Section */
    .header {
      text-align: center;
      margin-bottom: 0.3in;
      border-bottom: 1px solid #000;
      padding-bottom: 10pt;
    }
    
    h1 {
      font-size: 18pt;
      font-weight: bold;
      margin-bottom: 8pt;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 1pt;
      text-align: center;
      border: none;
    }
    
    .profession-title {
      text-align: center;
      margin: 8pt 0;
    }
    
    .profession-title h3 {
      font-size: 12pt;
      font-weight: bold;
      color: #000;
      margin: 0;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
    }
    
    .contact-info {
      font-size: 10pt;
      text-align: center;
      margin-bottom: 0;
      background: none;
      padding: 0;
      border-radius: 0;
    }
    
    .contact-info p {
      margin: 2pt 0;
      display: inline-block;
    }
    
    .contact-info p:not(:last-child):after {
      content: " | ";
      margin: 0 5pt;
    }
    
    /* Section Headers */
    h2 {
      font-size: 12pt;
      font-weight: bold;
      margin: 16pt 0 8pt 0;
      color: #000;
      text-transform: uppercase;
      letter-spacing: 0.5pt;
      border-bottom: 1px solid #000;
      padding-bottom: 2pt;
      background: none;
      border-radius: 0;
    }
    
    /* Sub-sections */
    h3 {
      font-size: 11pt;
      font-weight: bold;
      margin: 8pt 0 4pt 0;
      color: #000;
    }
    
    /* Profession title in header should override general H3 styles */
    .profession-title h3 {
      font-size: 12pt !important;
      margin: 0 !important;
      text-transform: uppercase !important;
      letter-spacing: 0.5pt !important;
    }
    
    h4 {
      font-size: 10pt;
      font-weight: normal;
      font-style: italic;
      margin: 2pt 0;
      color: #333;
    }
    
    p {
      margin-bottom: 6pt;
      font-size: 11pt;
      line-height: 1.3;
    }
    
    ul {
      margin: 4pt 0 8pt 0;
      padding-left: 16pt;
    }
    
    li {
      margin-bottom: 3pt;
      font-size: 10pt;
      line-height: 1.3;
    }
    
    /* Job Entry Styling */
    .job-entry {
      margin-bottom: 12pt;
    }
    
    .job-title {
      font-weight: bold;
      font-size: 11pt;
      color: #000;
      display: inline;
    }
    
    .company {
      font-weight: bold;
      font-size: 11pt;
      color: #000;
      display: inline;
    }
    
    .date {
      float: right;
      font-size: 10pt;
      color: #000;
      font-weight: normal;
    }
    
    /* Education Entry */
    .education-entry {
      margin-bottom: 8pt;
    }
    
    .degree {
      font-weight: bold;
      font-size: 11pt;
    }
    
    .institution {
      font-size: 10pt;
      color: #333;
    }
    
    /* Skills Section */
    .skills-section {
      margin-bottom: 12pt;
    }
    
    .skills {
      display: block;
      line-height: 1.4;
    }
    
    .skill-category {
      margin-bottom: 4pt;
    }
    
    .skill-category strong {
      font-weight: bold;
      font-size: 10pt;
    }
    
    .skill-list {
      font-size: 10pt;
      margin-left: 0;
    }
    
    /* Section spacing */
    .section {
      margin-bottom: 16pt;
      page-break-inside: avoid;
    }
    
    /* Professional Summary */
    .summary {
      margin-bottom: 16pt;
      font-size: 11pt;
      line-height: 1.4;
      text-align: justify;
    }
    
    /* Ensure no background colors for ATS compatibility */
    * {
      background-color: transparent !important;
      background-image: none !important;
    }
    
    body, .resume-container {
      background: white !important;
    }
    
    /* Table styling for consistent alignment */
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 8pt;
    }
    
    td {
      padding: 2pt 0;
      vertical-align: top;
    }
    
    .table-date {
      text-align: right;
      width: 100pt;
      font-size: 10pt;
    }
    
    /* Print optimizations */
    @media print {
      body {
        font-size: 10pt;
      }
      
      .resume-container {
        padding: 0.4in;
      }
      
      h1 {
        font-size: 16pt;
      }
      
      h2 {
        font-size: 11pt;
      }
    }
  `;

  const formatStyles = {
    modern: `
      ${baseStyles}
      
      h1 {
        font-family: 'Arial', sans-serif;
        color: #000;
        border: none;
        background: none;
      }
      
      h2 {
        color: #000;
        background: none;
        border-bottom: 2px solid #000;
      }
      
      .resume-container {
        border: none;
        box-shadow: none;
        background: white;
      }
    `,
    
    classic: `
      ${baseStyles}
      body {
        font-family: 'Times New Roman', serif;
      }
      
      h1 {
        font-variant: small-caps;
        border-bottom: 2px solid #000;
        text-align: center;
      }
      
      h2 {
        border-bottom: 1px solid #000;
        text-transform: none;
        letter-spacing: normal;
      }
    `,
    
    ats: `
      ${baseStyles}
      
      /* Extra ATS optimizations */
      h1, h2, h3, h4, h5, h6 {
        font-family: 'Arial', sans-serif;
        color: #000;
        background: none;
      }
      
      /* Remove any decorative elements */
      .resume-container {
        border: none;
        box-shadow: none;
        background: white;
      }
      
      /* Ensure consistent spacing */
      .section {
        margin-bottom: 0.2in;
      }
      
      /* Make sure bullet points are simple */
      ul {
        list-style-type: disc;
      }
      
      li {
        margin-bottom: 0.05in;
      }
    `,
    
    minimal: `
      ${baseStyles}
      
      h1 {
        font-size: 16pt;
        font-weight: 300;
        border: none;
        margin-bottom: 8pt;
      }
      
      h2 {
        font-size: 12pt;
        font-weight: 400;
        margin: 12pt 0 6pt 0;
        text-transform: none;
        letter-spacing: normal;
        border-bottom: 1px solid #000;
        padding-bottom: 1pt;
      }
      
      .contact-info {
        background: none;
        text-align: left;
        padding: 0;
      }
    `
  };

  return formatStyles[format] || formatStyles.ats;
};

// Generate PDF from job application (with cover letter)
const generateApplicationPDF = async (resumeContent, coverLetter, jobDetails, userId) => {
  let browser;
  try {
    const resumeHtml = marked(resumeContent);
    const coverLetterHtml = marked(coverLetter);
    
    const styles = getResumeStyles('modern');
    
    const fullHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Job Application</title>
    <style>
        ${styles}
        .cover-letter {
          page-break-after: always;
          margin-bottom: 40px;
        }
        .job-details {
          background-color: #f8f9fa;
          padding: 15px;
          border-radius: 5px;
          margin-bottom: 20px;
        }
    </style>
</head>
<body>
    <div class="resume-container">
        <div class="cover-letter">
            <h1>Cover Letter</h1>
            <div class="job-details">
                <h3>Position: ${jobDetails?.title || 'N/A'}</h3>
                <p>Company: ${jobDetails?.company || 'N/A'}</p>
            </div>
            ${coverLetterHtml}
        </div>
        
        <div class="resume">
            <h1>Resume</h1>
            ${resumeHtml}
        </div>
    </div>
</body>
</html>`;

    browser = await puppeteer.launch({
      headless: 'new',
      args: [
        '--no-sandbox', 
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=VizDisplayCompositor'
      ],
      executablePath: process.env.NODE_ENV === 'production' ? '/usr/bin/google-chrome-stable' : undefined
    });
    
    const page = await browser.newPage();
    await page.setContent(fullHtml, { waitUntil: 'networkidle0' });
    
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: {
        top: '0.5in',
        right: '0.5in',
        bottom: '0.5in',
        left: '0.5in'
      }
    });

    await browser.close();

    const fileName = `application_${userId}_${Date.now()}.pdf`;
    const filePath = await savePDFToStorage(pdfBuffer, fileName);
    
    return filePath;

  } catch (error) {
    if (browser) {
      await browser.close();
    }
    console.error('Error generating application PDF:', error);
    throw new Error('Failed to generate application PDF');
  }
};

// Clean up old PDF files
const cleanupOldPDFs = async (olderThanDays = 30) => {
  try {
    const uploadsDir = path.join(__dirname, '../../uploads/resumes');
    const files = await fs.readdir(uploadsDir);
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);
    
    for (const file of files) {
      const filePath = path.join(uploadsDir, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime < cutoffDate) {
        await fs.unlink(filePath);
        console.log(`Cleaned up old PDF: ${file}`);
      }
    }
    
  } catch (error) {
    console.error('Error cleaning up old PDFs:', error);
  }
};

// Schedule cleanup every day at 3 AM
const cron = require('node-cron');
cron.schedule('0 3 * * *', () => {
  cleanupOldPDFs();
});

module.exports = {
  generateResumePDF,
  generateApplicationPDF,
  cleanupOldPDFs,
  getResumeStyles
}; 