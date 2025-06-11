# Job OS Mobile App Integration Example

This guide shows how to integrate Google OAuth authentication in your Job OS mobile app.

## 🔧 Google Console Setup (Critical Step)

### Step 1: Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Go to **APIs & Services → Credentials**
4. Click **Create Credentials → OAuth 2.0 Client IDs**

### Step 2: Configure OAuth Consent Screen

1. Go to **OAuth consent screen** (do this FIRST)
2. Select **External** (for testing) or **Internal**
3. Fill required fields:
   - **App name**: Job OS
   - **User support email**: your-email@example.com
   - **Developer contact**: your-email@example.com
4. Add test users (your email) for development
5. **SAVE AND CONTINUE**

### Step 3: Create OAuth Client IDs

Create **THREE** separate OAuth clients:

#### 1. Web Application (for callback)
- **Application type**: Web application
- **Name**: Job OS Web
- **Authorized redirect URIs**:
  ```
  http://localhost:5001/api/passport/auth/google/callback
  ```

#### 2. Android (for mobile app)
- **Application type**: Android
- **Name**: Job OS Android
- **Package name**: com.jobos.mobile (or your package name)
- **SHA-1 certificate fingerprint**: (get from your app)

#### 3. iOS (for mobile app)
- **Application type**: iOS
- **Name**: Job OS iOS
- **Bundle ID**: com.jobos.mobile (or your bundle ID)

## 📱 Mobile App Implementation

### React Native/Expo Setup

```bash
# Install Google Sign-In
npm install @react-native-google-signin/google-signin

# For Expo (alternative)
npx expo install expo-auth-session expo-crypto
```

### Configuration

```javascript
// config/auth.js
import { GoogleSignin } from '@react-native-google-signin/google-signin';

export const configureGoogleSignIn = () => {
  GoogleSignin.configure({
    webClientId: 'YOUR_WEB_CLIENT_ID_FROM_GOOGLE_CONSOLE', // Web OAuth client ID
    androidClientId: 'YOUR_ANDROID_CLIENT_ID', // Android OAuth client ID
    iosClientId: 'YOUR_IOS_CLIENT_ID', // iOS OAuth client ID
    offlineAccess: true,
  });
};

export const API_BASE_URL = __DEV__ 
  ? 'http://localhost:5001' // Development
  : 'https://your-production-domain.com'; // Production
```

### Authentication Service

```javascript
// services/authService.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import { API_BASE_URL } from '../config/auth';

class AuthService {
  
  // Google Sign-In
  async signInWithGoogle() {
    try {
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      
      // Send to backend for token exchange
      const response = await fetch(`${API_BASE_URL}/api/passport/auth/google/mobile`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          googleToken: userInfo.idToken,
          userInfo: {
            id: userInfo.user.id,
            name: userInfo.user.name,
            email: userInfo.user.email,
            picture: userInfo.user.photo,
          },
        }),
      });

      const result = await response.json();

      if (result.success) {
        // Store token
        await AsyncStorage.setItem('authToken', result.token);
        await AsyncStorage.setItem('userData', JSON.stringify(result.user));
        return result.user;
      } else {
        throw new Error(result.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      throw error;
    }
  }

  // Email/Password Registration
  async register(email, password, firstName, lastName) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
          firstName,
          lastName,
        }),
      });

      const result = await response.json();

      if (result.success) {
        await AsyncStorage.setItem('authToken', result.token);
        await AsyncStorage.setItem('userData', JSON.stringify(result.user));
        return result.user;
      } else {
        throw new Error(result.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration Error:', error);
      throw error;
    }
  }

  // Email/Password Login
  async login(email, password) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/users/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const result = await response.json();

      if (result.success) {
        await AsyncStorage.setItem('authToken', result.token);
        await AsyncStorage.setItem('userData', JSON.stringify(result.user));
        return result.user;
      } else {
        throw new Error(result.error || 'Login failed');
      }
    } catch (error) {
      console.error('Login Error:', error);
      throw error;
    }
  }

  // Get current user
  async getCurrentUser() {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return null;

      const response = await fetch(`${API_BASE_URL}/api/users/me`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        await AsyncStorage.setItem('userData', JSON.stringify(result.user));
        return result.user;
      } else {
        // Token invalid, clear storage
        await this.logout();
        return null;
      }
    } catch (error) {
      console.error('Get Current User Error:', error);
      return null;
    }
  }

  // Complete onboarding
  async completeOnboarding(preferences, applicationSettings) {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const response = await fetch(`${API_BASE_URL}/api/users/complete-onboarding`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          preferences,
          applicationSettings,
        }),
      });

      const result = await response.json();

      if (result.success) {
        await AsyncStorage.setItem('userData', JSON.stringify(result.user));
        return result.user;
      } else {
        throw new Error(result.error || 'Onboarding failed');
      }
    } catch (error) {
      console.error('Onboarding Error:', error);
      throw error;
    }
  }

  // Logout
  async logout() {
    try {
      await AsyncStorage.multiRemove(['authToken', 'userData']);
      await GoogleSignin.signOut();
    } catch (error) {
      console.error('Logout Error:', error);
    }
  }

  // Check auth status
  async isAuthenticated() {
    const token = await AsyncStorage.getItem('authToken');
    return !!token;
  }
}

export default new AuthService();
```

### Auth Context (React Context)

```javascript
// context/AuthContext.js
import React, { createContext, useContext, useEffect, useState } from 'react';
import AuthService from '../services/authService';
import { configureGoogleSignIn } from '../config/auth';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Configure Google Sign-In
    configureGoogleSignIn();
    
    // Check if user is already authenticated
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const currentUser = await AuthService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      console.error('Auth check error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const signInWithGoogle = async () => {
    try {
      setIsLoading(true);
      const userData = await AuthService.signInWithGoogle();
      setUser(userData);
      return userData;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (email, password, firstName, lastName) => {
    try {
      setIsLoading(true);
      const userData = await AuthService.register(email, password, firstName, lastName);
      setUser(userData);
      return userData;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      setIsLoading(true);
      const userData = await AuthService.login(email, password);
      setUser(userData);
      return userData;
    } catch (error) {
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const completeOnboarding = async (preferences, applicationSettings) => {
    try {
      const userData = await AuthService.completeOnboarding(preferences, applicationSettings);
      setUser(userData);
      return userData;
    } catch (error) {
      throw error;
    }
  };

  const logout = async () => {
    try {
      await AuthService.logout();
      setUser(null);
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const value = {
    user,
    isLoading,
    signInWithGoogle,
    register,
    login,
    completeOnboarding,
    logout,
    isAuthenticated: !!user,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
```

### Usage in Components

```javascript
// screens/LoginScreen.js
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useAuth } from '../context/AuthContext';

const LoginScreen = ({ navigation }) => {
  const { signInWithGoogle, login, isLoading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleGoogleSignIn = async () => {
    try {
      const user = await signInWithGoogle();
      
      if (!user.onboardingCompleted) {
        navigation.navigate('Onboarding');
      } else {
        navigation.navigate('Home');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  const handleEmailLogin = async () => {
    try {
      const user = await login(email, password);
      
      if (!user.onboardingCompleted) {
        navigation.navigate('Onboarding');
      } else {
        navigation.navigate('Home');
      }
    } catch (error) {
      Alert.alert('Error', error.message);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
      <Text style={{ fontSize: 24, textAlign: 'center', marginBottom: 30 }}>
        Welcome to Job OS
      </Text>
      
      {/* Google Sign-In Button */}
      <TouchableOpacity
        onPress={handleGoogleSignIn}
        disabled={isLoading}
        style={{
          backgroundColor: '#4285F4',
          padding: 15,
          borderRadius: 8,
          alignItems: 'center',
          marginBottom: 20,
        }}
      >
        <Text style={{ color: 'white', fontSize: 16, fontWeight: 'bold' }}>
          {isLoading ? 'Signing in...' : 'Continue with Google'}
        </Text>
      </TouchableOpacity>

      {/* Email/Password form would go here */}
      
    </View>
  );
};

export default LoginScreen;
```

## 🔧 Environment Variables

Create a `.env` file in your backend directory:

```bash
# Google OAuth (from Google Console)
GOOGLE_CLIENT_ID=your-web-client-id-from-google-console
GOOGLE_CLIENT_SECRET=your-client-secret-from-google-console

# JWT Secret (generate a random string)
JWT_SECRET=your-super-secret-jwt-key-here

# Database
REACT_APP_MONGO_URI=mongodb://admin:password@localhost:27017/jobosmobile?authSource=admin

# Optional: Legacy encryption (can be any hex string)
JWT_ENCRYPTION_SECRET=your-encryption-secret-hex-string
```

## 🚨 Common Issues & Solutions

### 1. "Access Blocked: Authorization Error"

**Problem**: Google OAuth redirect URI mismatch

**Solution**:
- Go to Google Console → Credentials → Your Web OAuth Client
- Add: `http://localhost:5001/api/passport/auth/google/callback`
- Make sure there are no typos or extra spaces

### 2. "Network Error" in Mobile App

**Problem**: Mobile app can't reach backend

**Solution**:
- Use your computer's IP address instead of `localhost`
- Example: `http://192.168.1.100:5001` (find your IP with `ipconfig` or `ifconfig`)
- Make sure backend is running on port 5001

### 3. "Invalid Token" Error

**Problem**: JWT token issues

**Solution**:
- Check that `JWT_SECRET` is set in backend `.env`
- Verify token is being sent with `Bearer ` prefix
- Check token expiration (30 days by default)

## 🧪 Testing Your Setup

1. **Start Backend**:
   ```bash
   cd backend
   docker-compose up -d
   ```

2. **Test Google OAuth**:
   Open in browser: `http://localhost:5001/api/passport/auth/google?platform=mobile`

3. **Test Registration**:
   ```bash
   curl -X POST http://localhost:5001/api/users/register \
     -H "Content-Type: application/json" \
     -d '{"email": "test@example.com", "password": "password123", "firstName": "Test"}'
   ```

4. **Test Protected Route**:
   ```bash
   curl http://localhost:5001/api/users/me \
     -H "Authorization: Bearer YOUR_TOKEN_HERE"
   ```

## 📞 Need Help?

If you're still getting the authorization error:

1. Double-check your Google Console OAuth setup
2. Verify redirect URIs match exactly
3. Make sure OAuth consent screen is configured
4. Add your email as a test user
5. Check backend logs: `docker-compose logs -f job-os-backend` 