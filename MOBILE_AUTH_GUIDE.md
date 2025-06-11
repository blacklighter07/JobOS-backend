# Job OS Mobile Authentication Guide

This guide explains how to set up and troubleshoot authentication for the Job OS mobile app.

## 🔧 Backend Configuration

### 1. Environment Variables

Make sure your `.env` file contains:

```bash
# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key

# For development (optional legacy encryption)
JWT_ENCRYPTION_SECRET=your-encryption-secret
```

### 2. Google OAuth Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing one
3. Enable Google+ API and Google Identity API
4. Go to "Credentials" → "Create Credentials" → "OAuth 2.0 Client IDs"
5. Configure the OAuth consent screen first
6. Create credentials for:
   - **Web application** (for development callback)
   - **Android** (for mobile app)
   - **iOS** (for mobile app)

### 3. Authorized Redirect URIs

For the Web OAuth client, add these redirect URIs:

**Development:**
```
http://localhost:5001/api/passport/auth/google/callback
```

**Production:**
```
https://your-domain.com/api/passport/auth/google/callback
```

## 📱 Mobile App Integration

### Authentication Endpoints

#### 1. Google OAuth Web Flow (for development)
```
GET /api/passport/auth/google?platform=mobile
```

#### 2. Google OAuth Mobile (Direct Token Exchange)
```
POST /api/passport/auth/google/mobile
Content-Type: application/json

{
  "googleToken": "google-access-token",
  "userInfo": {
    "id": "google-user-id",
    "name": "User Name",
    "email": "user@example.com",
    "picture": "profile-picture-url"
  }
}
```

#### 3. Email/Password Registration
```
POST /api/users/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe",
  "username": "john_doe" // optional
}
```

#### 4. Email/Password Login
```
POST /api/users/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "password123"
}
```

#### 5. Get Current User
```
GET /api/users/me
Authorization: Bearer <jwt-token>
```

#### 6. Complete Onboarding
```
POST /api/users/complete-onboarding
Authorization: Bearer <jwt-token>
Content-Type: application/json

{
  "preferences": {
    "domains": ["technology", "finance"],
    "experience": "mid",
    "salaryRange": { "min": 80000, "max": 120000 },
    "locations": ["New York", "Remote"],
    "remotePreference": "hybrid",
    "jobTypes": ["full-time"],
    "specificSkills": ["React", "Node.js", "TypeScript"]
  },
  "applicationSettings": {
    "autoApply": true,
    "maxApplicationsPerDay": 10,
    "minJobMatchScore": 75
  }
}
```

## 🔍 Troubleshooting Common Issues

### Issue: "Access Blocked: Authorization Error"

**Causes & Solutions:**

1. **Incorrect Redirect URI**
   - Ensure redirect URI in Google Console matches exactly
   - For development: `http://localhost:5001/api/passport/auth/google/callback`
   - Check for trailing slashes and typos

2. **OAuth Consent Screen Not Configured**
   - Go to Google Console → OAuth consent screen
   - Fill in required fields (App name, User support email, Developer contact)
   - Add test users for development

3. **Missing Scopes**
   - Ensure your OAuth request includes `profile` and `email` scopes
   - Backend automatically requests: `["profile", "email"]`

4. **Client ID Mismatch**
   - Verify `GOOGLE_CLIENT_ID` in `.env` matches Google Console
   - Use Web OAuth Client ID, not Android/iOS client ID

### Issue: "Invalid Token" After Login

**Solutions:**

1. **Check JWT Secret**
   - Ensure `JWT_SECRET` is set in environment variables
   - Backend defaults to `'your-secret-key'` if not set

2. **Token Format Issues**
   - Backend supports both new simple JWT and legacy encrypted format
   - Use Authorization header: `Bearer <token>`

3. **User Not Found**
   - Check if user was created successfully in database
   - Verify user is marked as `isActive: true`

### Issue: Mobile App Can't Connect

**Solutions:**

1. **CORS Configuration**
   - Backend allows these origins by default:
     - `http://localhost:19006` (Expo dev server)
     - `exp://192.168.1.100:19000` (Expo local network)
   - Update IP address in CORS config if needed

2. **Network Issues**
   - Ensure backend is running on correct port (5001)
   - Check if mobile device can reach backend server
   - For Expo: Use your local IP instead of localhost

## 🧪 Testing Authentication

### 1. Test Backend Health
```bash
curl http://localhost:5001/api/health
```

### 2. Test Google OAuth Initiation
```bash
curl -i "http://localhost:5001/api/passport/auth/google?platform=mobile"
```
Should return 302 redirect to Google OAuth

### 3. Test Registration
```bash
curl -X POST http://localhost:5001/api/users/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### 4. Test Login
```bash
curl -X POST http://localhost:5001/api/users/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

### 5. Test Protected Endpoint
```bash
curl http://localhost:5001/api/users/test-auth \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## 📋 Mobile Implementation Checklist

### React Native/Expo Setup

1. **Install Dependencies**
   ```bash
   npm install @react-native-google-signin/google-signin
   # or for Expo
   expo install expo-google-sign-in
   ```

2. **Configure Google Sign-In**
   ```javascript
   import { GoogleSignin } from '@react-native-google-signin/google-signin';

   GoogleSignin.configure({
     webClientId: 'YOUR_WEB_CLIENT_ID', // from Google Console
     androidClientId: 'YOUR_ANDROID_CLIENT_ID', // optional
     iosClientId: 'YOUR_IOS_CLIENT_ID', // optional
   });
   ```

3. **Implement Sign-In**
   ```javascript
   const signInWithGoogle = async () => {
     try {
       await GoogleSignin.hasPlayServices();
       const userInfo = await GoogleSignin.signIn();
       
       // Send to backend
       const response = await fetch('http://YOUR_BACKEND_URL/api/passport/auth/google/mobile', {
         method: 'POST',
         headers: { 'Content-Type': 'application/json' },
         body: JSON.stringify({
           googleToken: userInfo.idToken,
           userInfo: {
             id: userInfo.user.id,
             name: userInfo.user.name,
             email: userInfo.user.email,
             picture: userInfo.user.photo
           }
         })
       });
       
       const result = await response.json();
       
       if (result.success) {
         // Store JWT token
         await AsyncStorage.setItem('authToken', result.token);
         // Navigate to app or onboarding
       }
     } catch (error) {
       console.error('Google Sign-In Error:', error);
     }
   };
   ```

4. **Handle Authentication State**
   ```javascript
   const checkAuthState = async () => {
     const token = await AsyncStorage.getItem('authToken');
     if (token) {
       // Verify token with backend
       const response = await fetch('http://YOUR_BACKEND_URL/api/users/me', {
         headers: { 'Authorization': `Bearer ${token}` }
       });
       
       if (response.ok) {
         const user = await response.json();
         // User is authenticated
         if (!user.user.onboardingCompleted) {
           // Navigate to onboarding
         } else {
           // Navigate to main app
         }
       } else {
         // Token invalid, redirect to login
         await AsyncStorage.removeItem('authToken');
       }
     }
   };
   ```

## 🚀 Quick Fix for Current Issue

If you're getting "Access Blocked: Authorization Error" right now:

1. **Check Google Console Settings:**
   - Go to your Google Cloud Project
   - Navigate to Credentials
   - Click on your OAuth 2.0 Client ID
   - Under "Authorized redirect URIs", add:
     ```
     http://localhost:5001/api/passport/auth/google/callback
     ```

2. **Verify Environment Variables:**
   ```bash
   # In backend/.env
   GOOGLE_CLIENT_ID=your-actual-client-id
   GOOGLE_CLIENT_SECRET=your-actual-client-secret
   ```

3. **Test the Flow:**
   - Open browser: `http://localhost:5001/api/passport/auth/google?platform=mobile`
   - Should redirect to Google OAuth consent screen
   - After consent, should redirect back with token

4. **Update Mobile App:**
   - Use the backend URL: `http://localhost:5001` (not 5000)
   - For Expo: Use your computer's IP address instead of localhost

## 📞 Support

If issues persist:
1. Check backend logs: `docker-compose logs -f job-os-backend`
2. Verify Google Console configuration
3. Test each endpoint individually
4. Check network connectivity between mobile app and backend 