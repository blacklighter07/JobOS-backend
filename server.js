require("dotenv").config(); // don't delete it
const express = require("express");
const mongoose = require("mongoose");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const { MongoURI } = require("./config/config");
// Bot and chat services not implemented yet
// const botRouter = require("./services/bot/botRouter");
// const chatRouter = require("./services/chat/chatRouter");
const authRouter = require("./services/authentication/userRouter");
const passportAuth = require("./services/authentication/passportAuth");
const mobileAuth = require("./services/authentication/mobileAuth");
const resumeGenerator = require("./services/resume/resumeGenerator");
const dashboardService = require("./services/dashboard/dashboardService");

const mobileRoutes = require("./src/routes/mobileRoutes");
const User = require("./services/authentication/userModel");
const session = require("express-session");
const app = express();
const PORT = process.env.PORT || 5000;
const passport = require("passport");
const GoogleStrategy = require("passport-google-oauth20").Strategy;

// Connect to MongoDB
mongoose
  .connect(MongoURI)
  .then(() => console.log("MongoDB Connected"))
  .catch((err) => console.log(err));

// Middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

// Configure maximum request size
app.use((req, res, next) => {
  // Set higher limits for the /mobile/knowledgeBase endpoint
  if (req.url.includes('/mobile/knowledgeBase')) {
    bodyParser.json({ limit: '50mb' })(req, res, (err) => {
      if (err) {
        return res.status(413).json({
          success: false,
          error: 'Request entity too large. Maximum size is 50MB'
        });
      }
      next();
    });
  } else {
    next();
  }
});

// CORS configuration
app.use(
  cors({
    origin: [
      "https://smartchat.tech", 
      "https://www.smartchat.tech", 
      "http://localhost:3000",
      "http://localhost:19006", // Expo dev server
      "exp://192.168.1.100:19000", // Expo local network
      "exp://job-os", // Expo scheme
      "jobos://", // Custom scheme for mobile deep linking
    ],
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Access-Control-Allow-Origin",
    ],
  })
);

// Serve static files for uploads
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Express session
app.use(
  session({
    secret: "your-secret-key",
    resave: false,
    saveUninitialized: true,
  })
);

// Passport initialization
app.use(passport.initialize());
app.use(passport.session());

// Routes
app.use("/api/users", authRouter);

// Passport and google auth api routes (for web)
app.use("/api/passport", passportAuth);

// Mobile authentication routes
app.use("/api/mobile/auth", mobileAuth);

// Resume generator routes
app.use("/api/resume", resumeGenerator);

// Dashboard routes
app.use("/api/dashboard", dashboardService);



// Base Route for bot services - not implemented yet
// app.use("/api/bot", botRouter);

// Base Route for chat services - not implemented yet
// app.use("/api/chat", chatRouter);

// Mobile API routes
app.use("/api/mobile", mobileRoutes);

// Job optimization routes
app.use("/api/jobs", require("./src/routes/jobRoutes"));

// Health check route
app.get("/api/health", (req, res) => {
  res.status(200).json({ 
    status: "OK", 
    message: "Server is running",
    timestamp: new Date().toISOString(),
    version: "1.0.0"
  });
});

// API info endpoint
app.get("/api", (req, res) => {
  res.json({
    success: true,
    message: "Job OS API Server",
    version: "1.0.0",
    endpoints: {
      health: "/api/health",
      mobile: "/api/mobile/*",
      auth: "/api/users/*",
      passport: "/api/passport/*",
      resume: "/api/resume/*",
      dashboard: "/api/dashboard/*",

      // bot: "/api/bot/*", // Not implemented yet
      // chat: "/api/chat/*" // Not implemented yet
    }
  });
});

const generateUsername = async (fullName) => {
  if (!fullName) return "";

  // Remove extra spaces, convert to lowercase, and replace spaces with underscores
  let username = fullName
    .trim() // Remove leading and trailing spaces
    .toLowerCase() // Convert to lowercase
    .replace(/[^a-zA-Z0-9 ]/g, "") // Remove special characters
    .replace(/\s+/g, "_"); // Replace spaces with underscores

  // Get current time in "hh:mm" format
  const now = new Date();
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const timeString = `${hours}:${minutes}`;

  // Check if the username already exists in the database
  const existingUser = await User.findOne({ username });

  if (existingUser) {
    // If the username exists, append the time string to make it unique
    username = `${username}_${timeString}`;
  }

  return username;
};

// Passport authentication with google auth 2.0
passport.use(
  new GoogleStrategy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: process.env.NODE_ENV === 'production' 
        ? "https://smartchat.tech/api/passport/auth/google/callback"
        : "http://localhost:5001/api/passport/auth/google/callback",
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const fullName = profile.displayName;
        const email = profile.emails[0].value;
        // Check if user already exists in the database
        let user = await User.findOne({ googleId: profile.id });

        if (!user) {
          // Create a new user if not found
          user = await User.findOne({ email });
          if (user) {
            // Link Google account to the existing user
            user.googleId = profile.id;
          } else {
            const username = await generateUsername(fullName);
            const [firstName, ...lastNameParts] = fullName.split(' ');
            user = new User({
              googleId: profile.id,
              username: username, // Generated username
              email: profile.emails[0].value,
              firstName: firstName || '',
              lastName: lastNameParts.join(' ') || '',
              profilePicture: profile.photos?.[0]?.value || null,
              onboardingCompleted: false, // Set to false for new users
              isActive: true
            });
          }

          await user.save();
        }
        return done(null, user);
      } catch (err) {
        console.error('Google OAuth error:', err);
        return done(err, null);
      }
    }
  )
);

// Serialize user info into the session
passport.serializeUser(function (user, done) {
  done(null, user);
});

// Deserialize user info from the session
passport.deserializeUser(function (user, done) {
  done(null, user);
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    success: false,
    error: "Something went wrong!",
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
    path: req.originalUrl
  });
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Job OS Server started on port ${PORT}`);
  console.log(`📱 Mobile API available at: http://localhost:${PORT}/api/mobile`);
  console.log(`📋 API Documentation: http://localhost:${PORT}/api`);
});
