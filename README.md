# Job OS Backend

A comprehensive backend API for the Job OS mobile application, providing automated job application, resume optimization, and career management features.

## 🚀 Quick Start

### Using Docker (Recommended)

1. **Start the backend:**
   ```bash
   ./start-docker.sh
   ```

2. **Access the API:**
   - Backend: http://localhost:5001
   - Mobile API: http://localhost:5001/api/mobile
   - API Documentation: http://localhost:5001/api

### Manual Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   Copy `.env.example` to `.env` and configure your settings.

3. **Start services:**
   ```bash
   # Start MongoDB and Redis first
   npm start
   ```

## 📋 Features

### Core Services
- **Authentication & Authorization** - JWT-based auth with Google OAuth
- **Job Management** - Search, filtering, and recommendations
- **Application Automation** - AI-powered job applications
- **Resume Builder** - Create, optimize, and tailor resumes
- **LLM Integration** - Multiple AI providers (OpenAI, Claude, Gemini)
- **Notifications** - Push notifications and email alerts
- **Payment Processing** - Stripe integration for subscriptions

### Mobile API Endpoints

#### Dashboard
- `GET /api/mobile/dashboard/stats` - User statistics
- `POST /api/mobile/dashboard/automation/start` - Start automation
- `POST /api/mobile/dashboard/automation/stop` - Stop automation

#### Jobs
- `GET /api/mobile/jobs/search` - Search jobs with filters
- `GET /api/mobile/jobs/recommendations` - Personalized recommendations
- `GET /api/mobile/jobs/:id` - Get job details
- `POST /api/mobile/jobs/:id/apply` - Apply to job
- `POST /api/mobile/jobs/:id/view` - Track job view

#### Applications
- `GET /api/mobile/applications` - List applications
- `GET /api/mobile/applications/:id` - Get application details
- `PUT /api/mobile/applications/:id` - Update application
- `DELETE /api/mobile/applications/:id` - Withdraw application

#### Resume
- `GET /api/mobile/resume` - Get user resumes
- `POST /api/mobile/resume` - Create resume
- `PUT /api/mobile/resume/:id` - Update resume
- `POST /api/mobile/resume/:id/optimize` - AI optimization
- `POST /api/mobile/resume/:id/pdf` - Generate PDF
- `POST /api/mobile/resume/:id/tailor` - Tailor to job

#### Profile
- `GET /api/mobile/profile` - Get user profile
- `PUT /api/mobile/profile` - Update profile
- `GET /api/mobile/profile/preferences` - Get preferences
- `PUT /api/mobile/profile/preferences` - Update preferences

## 🏗️ Architecture

### Database Models
- **User** - User profiles and preferences
- **Job** - Job listings and metadata
- **JobApplication** - Application records and status
- **Resume** - Resume versions and content
- **Subscription** - Payment and feature access

### Services
- **Automation Service** - Cron-based job application worker
- **Matching Service** - AI-powered job matching algorithm
- **PDF Service** - Resume and document generation
- **LLM Service** - Multi-provider AI integration
- **Notification Service** - Push and email notifications
- **Job Scraping Service** - External job board integration

## 🔧 Configuration

### Environment Variables

```bash
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/job-os
REDIS_HOST=localhost
REDIS_PORT=6379

# Authentication
JWT_SECRET=your-secret-key
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# AI Services
OPENAI_API_KEY=your-openai-key
ANTHROPIC_API_KEY=your-anthropic-key
GOOGLE_API_KEY=your-google-ai-key

# Notifications (Optional)
FIREBASE_PROJECT_ID=your-firebase-project
FIREBASE_CLIENT_EMAIL=your-firebase-email
FIREBASE_PRIVATE_KEY=your-firebase-key
EMAIL_USER=your-email@gmail.com
EMAIL_APP_PASSWORD=your-app-password

# Payments
STRIPE_SECRET_KEY=your-stripe-secret
STRIPE_WEBHOOK_SECRET=your-webhook-secret
```

## 🐳 Docker Setup

The backend runs in a containerized environment with:
- **Job OS Backend** - Main API server (Port 5001)
- **MongoDB** - Document database (Port 27017)
- **Redis** - Queue and caching (Port 6379)

### Docker Commands

```bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f job-os-backend

# Stop services
docker-compose down

# Rebuild containers
docker-compose up --build -d
```

## 🔐 Authentication

The API uses JWT tokens for authentication. Mobile clients need to:

1. Register/login via `/api/users/` endpoints
2. Include JWT token in Authorization header: `Bearer <token>`
3. Premium features require active subscription

## 🤖 AI Features

### Job Matching Algorithm
- Skills compatibility analysis
- Experience level matching
- Location and salary preferences
- Industry domain expertise
- Custom scoring weights

### Resume Optimization
- Content analysis and suggestions
- ATS compatibility improvements
- Job-specific tailoring
- Professional formatting
- Skills enhancement recommendations

### Automated Applications
- AI-powered application logic
- Cover letter generation
- Resume customization
- Application tracking
- Success rate analytics

## 📊 Monitoring

### Health Checks
- `GET /api/health` - Server health status
- Database connectivity
- Redis queue status
- External service availability

### Logging
- Application logs via Docker
- Error tracking and alerts
- Performance monitoring
- Usage analytics

## 🔄 Job Queue System

Uses Bull queue with Redis for:
- Automated job applications
- Resume processing
- PDF generation
- Email notifications
- Scheduled job scraping

## 🚦 Rate Limiting

API endpoints are rate-limited based on:
- User subscription level
- Endpoint type
- Resource intensity
- Daily/monthly quotas

## 📈 Scaling Considerations

### Performance Optimizations
- Database indexing
- Redis caching
- Queue-based processing
- Horizontal scaling ready
- Load balancer compatible

### Security Features
- JWT authentication
- Input validation
- CORS configuration
- Helmet security headers
- Environment-based configs

## 🛠️ Development

### Adding New Features
1. Create model in `/src/models/`
2. Add service logic in `/src/services/`
3. Create controller in `/src/controllers/`
4. Add routes in `/src/routes/`
5. Update mobile routes in `/src/routes/mobileRoutes.js`

### Testing
```bash
# Run tests (when available)
npm test

# Development mode with auto-reload
npm run dev
```

## 📝 API Documentation

Full API documentation is available at:
- Development: http://localhost:5001/api
- Interactive docs with request/response examples
- Authentication requirements
- Rate limiting information

## 🐛 Troubleshooting

### Common Issues

1. **Port conflicts**: Change port in docker-compose.yml
2. **Database connection**: Check MongoDB service status
3. **Redis connection**: Verify Redis container health
4. **Missing environment variables**: Check .env file
5. **Puppeteer issues**: PDF generation may be disabled

### Debugging

```bash
# View container logs
docker-compose logs job-os-backend

# Access container shell
docker-compose exec job-os-backend sh

# Check container status
docker-compose ps
```

## 📞 Support

For issues and questions:
- Check logs: `docker-compose logs -f job-os-backend`
- Review environment configuration
- Verify external service availability
- Check rate limiting and quotas

## 🔄 Updates

To update the backend:
1. Pull latest changes
2. Rebuild containers: `docker-compose up --build -d`
3. Check migration requirements
4. Verify service health # JobOS-backend
