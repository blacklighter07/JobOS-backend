const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const User = require('../../services/authentication/userModel');

class NotificationService {
  constructor() {
    this.firebaseAvailable = false;
    this.emailAvailable = false;
    
    // Initialize Firebase Admin for push notifications (optional)
    try {
      if (!admin.apps.length && 
          process.env.FIREBASE_PROJECT_ID && 
          process.env.FIREBASE_CLIENT_EMAIL && 
          process.env.FIREBASE_PRIVATE_KEY) {
        admin.initializeApp({
          credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
          })
        });
        this.firebaseAvailable = true;
        console.log('Firebase Admin initialized successfully');
      } else {
        console.warn('Firebase credentials not found. Push notifications will be disabled.');
      }
    } catch (error) {
      console.warn('Firebase initialization failed. Push notifications will be disabled:', error.message);
    }

    // Initialize email transporter (optional)
    try {
      if (process.env.EMAIL_USER && process.env.EMAIL_APP_PASSWORD) {
        this.emailTransporter = nodemailer.createTransporter({
          service: 'gmail',
          auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_APP_PASSWORD
          }
        });
        this.emailAvailable = true;
        console.log('Email service initialized successfully');
      } else {
        console.warn('Email credentials not found. Email notifications will be disabled.');
      }
    } catch (error) {
      console.warn('Email service initialization failed:', error.message);
    }

    this.notificationTypes = {
      APPLICATION_CONFIRMATION: 'application_confirmation',
      APPLICATION_SUMMARY: 'application_summary',
      JOB_RECOMMENDATION: 'job_recommendation',
      STATUS_UPDATE: 'status_update',
      INTERVIEW_REMINDER: 'interview_reminder',
      SUBSCRIPTION_REMINDER: 'subscription_reminder',
      WELCOME: 'welcome'
    };
  }

  async sendPushNotification(userId, notification) {
    if (!this.firebaseAvailable) {
      console.log('Firebase not available. Skipping push notification.');
      return false;
    }
    
    try {
      // Get user's FCM token from database
      const user = await User.findById(userId);
      
      if (!user || !user.fcmToken) {
        console.log('No FCM token found for user:', userId);
        return false;
      }

      const message = {
        token: user.fcmToken,
        notification: {
          title: notification.title,
          body: notification.body
        },
        data: {
          type: notification.type,
          ...notification.data
        },
        apns: {
          payload: {
            aps: {
              badge: notification.badge || 0,
              sound: 'default'
            }
          }
        }
      };

      const response = await admin.messaging().send(message);
      console.log('Push notification sent successfully:', response);
      return true;

    } catch (error) {
      console.error('Error sending push notification:', error);
      return false;
    }
  }

  async sendEmail(to, subject, htmlContent, textContent) {
    if (!this.emailAvailable) {
      console.log('Email service not available. Skipping email notification.');
      return false;
    }
    
    try {
      const mailOptions = {
        from: `"Job OS" <${process.env.EMAIL_USER}>`,
        to: to,
        subject: subject,
        html: htmlContent,
        text: textContent
      };

      const result = await this.emailTransporter.sendMail(mailOptions);
      console.log('Email sent successfully:', result.messageId);
      return true;

    } catch (error) {
      console.error('Error sending email:', error);
      return false;
    }
  }

  async sendApplicationConfirmation(userId, job, application) {
    try {
      const user = await User.findById(userId);
      
      if (!user) return false;

      // Send push notification
      const pushNotification = {
        title: '✅ Application Submitted!',
        body: `Your application to ${job.title} at ${job.company} has been submitted successfully.`,
        type: this.notificationTypes.APPLICATION_CONFIRMATION,
        data: {
          jobId: job._id.toString(),
          applicationId: application._id.toString(),
          company: job.company,
          title: job.title
        },
        badge: 1
      };

      await this.sendPushNotification(userId, pushNotification);

      // Send email confirmation
      const emailSubject = `Application Confirmed: ${job.title} at ${job.company}`;
      const emailHtml = this.generateApplicationConfirmationEmail(user, job, application);
      const emailText = `Your application to ${job.title} at ${job.company} has been submitted successfully. Match score: ${application.aiConfidenceScore}%. You can track your application status in the Job OS app.`;

      await this.sendEmail(user.email, emailSubject, emailHtml, emailText);

      return true;
    } catch (error) {
      console.error('Error sending application confirmation:', error);
      return false;
    }
  }

  async sendApplicationSummary(userId, results) {
    try {
      const user = await User.findById(userId);
      
      if (!user) return false;

      const pushNotification = {
        title: '📊 Job Application Summary',
        body: `Applied to ${results.successful} jobs successfully. ${results.failed} applications failed.`,
        type: this.notificationTypes.APPLICATION_SUMMARY,
        data: {
          successful: results.successful.toString(),
          failed: results.failed.toString(),
          total: results.processed.toString()
        }
      };

      await this.sendPushNotification(userId, pushNotification);

      // Send detailed email summary
      const emailSubject = `Job Application Summary - ${results.successful} Applications Submitted`;
      const emailHtml = this.generateApplicationSummaryEmail(user, results);
      const emailText = `Summary: Applied to ${results.successful} jobs successfully. ${results.failed} applications failed out of ${results.processed} total attempts.`;

      await this.sendEmail(user.email, emailSubject, emailHtml, emailText);

      return true;
    } catch (error) {
      console.error('Error sending application summary:', error);
      return false;
    }
  }

  async sendJobRecommendations(userId, recommendations) {
    try {
      const user = await User.findById(userId);
      
      if (!user || recommendations.length === 0) return false;

      const pushNotification = {
        title: '🎯 New Job Recommendations',
        body: `Found ${recommendations.length} jobs matching your profile. Best match: ${recommendations[0].matchScore}%`,
        type: this.notificationTypes.JOB_RECOMMENDATION,
        data: {
          count: recommendations.length.toString(),
          bestMatch: recommendations[0].matchScore.toString(),
          topJobId: recommendations[0].job._id.toString()
        }
      };

      await this.sendPushNotification(userId, pushNotification);

      return true;
    } catch (error) {
      console.error('Error sending job recommendations:', error);
      return false;
    }
  }

  async sendStatusUpdate(userId, application, oldStatus, newStatus) {
    try {
      const Job = require('../models/Job');
      
      const [user, job] = await Promise.all([
        User.findById(userId),
        Job.findById(application.jobId)
      ]);
      
      if (!user || !job) return false;

      const statusEmojis = {
        applied: '📤',
        viewed: '👀',
        in_review: '📋',
        phone_screen: '📞',
        interview_scheduled: '📅',
        interview_completed: '✅',
        offer_received: '🎉',
        rejected: '❌',
        withdrawn: '↩️',
        accepted: '🎊'
      };

      const pushNotification = {
        title: `${statusEmojis[newStatus]} Application Status Update`,
        body: `Your application to ${job.title} at ${job.company} is now: ${newStatus.replace('_', ' ')}`,
        type: this.notificationTypes.STATUS_UPDATE,
        data: {
          applicationId: application._id.toString(),
          oldStatus: oldStatus,
          newStatus: newStatus,
          jobTitle: job.title,
          company: job.company
        }
      };

      await this.sendPushNotification(userId, pushNotification);

      // Send email for important status changes
      const importantStatuses = ['interview_scheduled', 'offer_received', 'rejected', 'accepted'];
      if (importantStatuses.includes(newStatus)) {
        const emailSubject = `Application Update: ${job.title} at ${job.company}`;
        const emailHtml = this.generateStatusUpdateEmail(user, job, application, newStatus);
        const emailText = `Your application status has been updated to: ${newStatus.replace('_', ' ')}`;

        await this.sendEmail(user.email, emailSubject, emailHtml, emailText);
      }

      return true;
    } catch (error) {
      console.error('Error sending status update:', error);
      return false;
    }
  }

  async sendWelcomeNotification(userId) {
    try {
      const user = await User.findById(userId);
      
      if (!user) return false;

      const pushNotification = {
        title: '🎉 Welcome to Job OS!',
        body: 'Your AI job application assistant is ready. Start by uploading your resume!',
        type: this.notificationTypes.WELCOME,
        data: {
          action: 'open_resume_builder'
        }
      };

      await this.sendPushNotification(userId, pushNotification);

      // Send welcome email
      const emailSubject = 'Welcome to Job OS - Your AI Job Application Assistant';
      const emailHtml = this.generateWelcomeEmail(user);
      const emailText = 'Welcome to Job OS! Start by uploading your resume and setting your job preferences.';

      await this.sendEmail(user.email, emailSubject, emailHtml, emailText);

      return true;
    } catch (error) {
      console.error('Error sending welcome notification:', error);
      return false;
    }
  }

  async sendSubscriptionReminder(userId, daysRemaining) {
    try {
      const user = await User.findById(userId);
      
      if (!user) return false;

      const pushNotification = {
        title: '⏰ Subscription Reminder',
        body: `Your premium subscription expires in ${daysRemaining} days. Renew to continue unlimited applications.`,
        type: this.notificationTypes.SUBSCRIPTION_REMINDER,
        data: {
          daysRemaining: daysRemaining.toString(),
          action: 'open_subscription'
        }
      };

      await this.sendPushNotification(userId, pushNotification);

      return true;
    } catch (error) {
      console.error('Error sending subscription reminder:', error);
      return false;
    }
  }

  generateApplicationConfirmationEmail(user, job, application) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .job-details { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; }
            .score { font-size: 24px; font-weight: bold; color: #059669; }
            .cta { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Application Submitted Successfully!</h1>
            </div>
            <div class="content">
              <p>Hi ${user.firstName},</p>
              <p>Great news! Your application has been successfully submitted.</p>
              
              <div class="job-details">
                <h2>${job.title}</h2>
                <p><strong>Company:</strong> ${job.company}</p>
                <p><strong>Location:</strong> ${job.location?.city || 'Remote'}</p>
                <p><strong>AI Match Score:</strong> <span class="score">${application.aiConfidenceScore}%</span></p>
              </div>
              
              <p>Your resume has been automatically tailored for this position to maximize your chances of getting noticed.</p>
              
              <a href="${process.env.FRONTEND_URL}/applications" class="cta">Track Your Applications</a>
              
              <p>We'll notify you of any status updates. Good luck!</p>
              
              <p>Best regards,<br>The Job OS Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  generateApplicationSummaryEmail(user, results) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .stats { display: flex; justify-content: space-around; margin: 20px 0; }
            .stat { text-align: center; background: white; padding: 15px; border-radius: 8px; flex: 1; margin: 0 5px; }
            .stat-number { font-size: 32px; font-weight: bold; color: #2563eb; }
            .cta { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>📊 Job Application Summary</h1>
            </div>
            <div class="content">
              <p>Hi ${user.firstName},</p>
              <p>Here's a summary of your recent job application session:</p>
              
              <div class="stats">
                <div class="stat">
                  <div class="stat-number">${results.successful}</div>
                  <div>Successful Applications</div>
                </div>
                <div class="stat">
                  <div class="stat-number">${results.failed}</div>
                  <div>Failed Applications</div>
                </div>
                <div class="stat">
                  <div class="stat-number">${results.processed}</div>
                  <div>Total Processed</div>
                </div>
              </div>
              
              <p>Your applications have been submitted and we'll monitor them for status updates.</p>
              
              <a href="${process.env.FRONTEND_URL}/applications" class="cta">View All Applications</a>
              
              <p>Keep up the great work!</p>
              
              <p>Best regards,<br>The Job OS Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  generateStatusUpdateEmail(user, job, application, newStatus) {
    const statusMessages = {
      interview_scheduled: 'Congratulations! You have an interview scheduled.',
      offer_received: '🎉 Amazing news! You\'ve received a job offer!',
      rejected: 'Unfortunately, this application was not successful.',
      accepted: '🎊 Congratulations on your new job!'
    };

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .status { background: white; padding: 15px; border-radius: 8px; margin: 15px 0; text-align: center; }
            .cta { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>Application Status Update</h1>
            </div>
            <div class="content">
              <p>Hi ${user.firstName},</p>
              
              <div class="status">
                <h2>${job.title} at ${job.company}</h2>
                <p><strong>Status:</strong> ${newStatus.replace('_', ' ').toUpperCase()}</p>
                <p>${statusMessages[newStatus] || 'Your application status has been updated.'}</p>
              </div>
              
              <a href="${process.env.FRONTEND_URL}/applications/${application._id}" class="cta">View Application Details</a>
              
              <p>Thank you for using Job OS!</p>
              
              <p>Best regards,<br>The Job OS Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }

  generateWelcomeEmail(user) {
    return `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            .container { max-width: 600px; margin: 0 auto; font-family: Arial, sans-serif; }
            .header { background: #2563eb; color: white; padding: 20px; text-align: center; }
            .content { padding: 20px; background: #f9fafb; }
            .feature { background: white; padding: 15px; border-radius: 8px; margin: 10px 0; }
            .cta { background: #2563eb; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; display: inline-block; margin: 15px 0; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🎉 Welcome to Job OS!</h1>
            </div>
            <div class="content">
              <p>Hi ${user.firstName},</p>
              <p>Welcome to Job OS - your AI-powered job application assistant!</p>
              
              <h3>Here's what you can do:</h3>
              
              <div class="feature">
                <h4>📄 Smart Resume Builder</h4>
                <p>Create and optimize your resume with AI assistance</p>
              </div>
              
              <div class="feature">
                <h4>🎯 Automated Job Applications</h4>
                <p>Let our AI apply to jobs that match your preferences</p>
              </div>
              
              <div class="feature">
                <h4>📊 Application Tracking</h4>
                <p>Monitor all your applications in one place</p>
              </div>
              
              <a href="${process.env.FRONTEND_URL}/onboarding" class="cta">Get Started</a>
              
              <p>We're here to help you land your dream job!</p>
              
              <p>Best regards,<br>The Job OS Team</p>
            </div>
          </div>
        </body>
      </html>
    `;
  }
}

module.exports = new NotificationService(); 