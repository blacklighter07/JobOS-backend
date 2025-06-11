# Mobile Authentication Implementation Guide

## Overview

This guide explains how to implement Google Sign-In authentication for iOS and Android mobile apps using the Job OS backend. The system uses proper Google ID token verification for secure mobile authentication.

## Backend Configuration

### Google OAuth Client IDs
- **iOS**: `642683193260-5qlobpsnkc7rrjh7kubcf4fbh3vekl41.apps.googleusercontent.com`
- **Android**: `642683193260-v2lk8mhfh0nsbrddqn0g3vlnhjiahj8j.apps.googleusercontent.com`

### API Endpoints

The mobile authentication system provides the following endpoints:

#### 1. Google Sign-In
```
POST /api/mobile/auth/google/signin
```

**Request Body:**
```json
{
  "idToken": "eyJhbGciOiJSUzI1NiIsImtpZCI6...",
  "platform": "ios" // or "android"
}
```

**Response (Success):**
```json
{
  "success": true,
  "message": "Authentication successful",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "user": {
    "id": "60f1b2b3b4f4c4001f0e1234",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "username": "john_doe",
    "profilePicture": "https://lh3.googleusercontent.com/...",
    "onboardingCompleted": false,
    "createdAt": "2024-01-15T10:30:00.000Z",
    "lastLoginAt": "2024-01-15T10:30:00.000Z"
  }
}
```

#### 2. Token Refresh
```
POST /api/mobile/auth/refresh
```

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
}
```

#### 3. Token Verification
```
POST /api/mobile/auth/verify
```

**Request Body:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6..."
}
```

#### 4. Sign Out
```
POST /api/mobile/auth/signout
```

## Frontend Implementation (React Native/Expo)

### 1. Install Required Dependencies

```bash
npx expo install expo-auth-session expo-crypto
```

### 2. Google Sign-In Component

```javascript
import React, { useState } from 'react';
import { Platform } from 'react-native';
import * as AuthSession from 'expo-auth-session';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';

const GoogleSignIn = ({ onAuthSuccess, onAuthError }) => {
  const [loading, setLoading] = useState(false);
  
  // Get client ID based on platform
  const getClientId = () => {
    const clientIds = Constants.expoConfig?.extra?.googleClientId;
    return Platform.OS === 'ios' ? clientIds.ios : clientIds.android;
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      
      // Configure the auth request
      const request = new AuthSession.AuthRequest({
        clientId: getClientId(),
        scopes: ['openid', 'profile', 'email'],
        responseType: AuthSession.ResponseType.IdToken,
        redirectUri: AuthSession.makeRedirectUri({
          useProxy: true,
        }),
        extraParams: {
          nonce: await Crypto.digestStringAsync(
            Crypto.CryptoDigestAlgorithm.SHA256,
            Math.random().toString(36),
            { encoding: Crypto.CryptoEncoding.HEX }
          ),
        },
      });

      // Execute the auth request
      const result = await request.promptAsync({
        authorizationEndpoint: 'https://accounts.google.com/oauth/authorize',
      });

      if (result.type === 'success') {
        const { id_token } = result.params;
        
        // Send the ID token to your backend
        await authenticateWithBackend(id_token);
      } else {
        onAuthError('Authentication was cancelled or failed');
      }
    } catch (error) {
      console.error('Google Sign-In error:', error);
      onAuthError('An error occurred during authentication');
    } finally {
      setLoading(false);
    }
  };

  const authenticateWithBackend = async (idToken) => {
    try {
      const apiUrl = Constants.expoConfig?.extra?.apiUrl;
      const response = await fetch(`${apiUrl}/mobile/auth/google/signin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          idToken: idToken,
          platform: Platform.OS,
        }),
      });

      const data = await response.json();

      if (data.success) {
        // Store the JWT token securely
        await SecureStore.setItemAsync('authToken', data.token);
        await SecureStore.setItemAsync('user', JSON.stringify(data.user));
        
        onAuthSuccess(data.user, data.token);
      } else {
        onAuthError(data.error || 'Authentication failed');
      }
    } catch (error) {
      console.error('Backend authentication error:', error);
      onAuthError('Failed to authenticate with server');
    }
  };

  return (
    <TouchableOpacity 
      style={styles.googleButton} 
      onPress={handleGoogleSignIn}
      disabled={loading}
    >
      <Text style={styles.buttonText}>
        {loading ? 'Signing in...' : 'Sign in with Google'}
      </Text>
    </TouchableOpacity>
  );
};
```

### 3. Authentication Service

```javascript
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';

const API_URL = Constants.expoConfig?.extra?.apiUrl;

class AuthService {
  async getStoredToken() {
    return await SecureStore.getItemAsync('authToken');
  }

  async getStoredUser() {
    const userStr = await SecureStore.getItemAsync('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  async verifyToken(token) {
    try {
      const response = await fetch(`${API_URL}/mobile/auth/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();
      return data.success && data.valid;
    } catch (error) {
      console.error('Token verification error:', error);
      return false;
    }
  }

  async refreshToken(token) {
    try {
      const response = await fetch(`${API_URL}/mobile/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token }),
      });

      const data = await response.json();
      
      if (data.success) {
        await SecureStore.setItemAsync('authToken', data.token);
        await SecureStore.setItemAsync('user', JSON.stringify(data.user));
        return data.token;
      }
      
      return null;
    } catch (error) {
      console.error('Token refresh error:', error);
      return null;
    }
  }

  async signOut() {
    try {
      const token = await this.getStoredToken();
      
      if (token) {
        await fetch(`${API_URL}/mobile/auth/signout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
          },
        });
      }
    } catch (error) {
      console.error('Sign out error:', error);
    } finally {
      // Clear stored data regardless of API call success
      await SecureStore.deleteItemAsync('authToken');
      await SecureStore.deleteItemAsync('user');
    }
  }

  async makeAuthenticatedRequest(endpoint, options = {}) {
    const token = await this.getStoredToken();
    
    if (!token) {
      throw new Error('No authentication token found');
    }

    const isValid = await this.verifyToken(token);
    let currentToken = token;

    if (!isValid) {
      // Try to refresh the token
      currentToken = await this.refreshToken(token);
      if (!currentToken) {
        throw new Error('Authentication expired');
      }
    }

    return fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${currentToken}`,
        ...options.headers,
      },
    });
  }
}

export default new AuthService();
```

### 4. Authentication Context

```javascript
import React, { createContext, useContext, useEffect, useState } from 'react';
import AuthService from '../services/AuthService';

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
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthState();
  }, []);

  const checkAuthState = async () => {
    try {
      const storedToken = await AuthService.getStoredToken();
      const storedUser = await AuthService.getStoredUser();

      if (storedToken && storedUser) {
        const isValid = await AuthService.verifyToken(storedToken);
        
        if (isValid) {
          setToken(storedToken);
          setUser(storedUser);
        } else {
          // Try to refresh token
          const newToken = await AuthService.refreshToken(storedToken);
          if (newToken) {
            setToken(newToken);
            setUser(await AuthService.getStoredUser());
          } else {
            // Clear invalid data
            await AuthService.signOut();
          }
        }
      }
    } catch (error) {
      console.error('Auth state check error:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = (userData, authToken) => {
    setUser(userData);
    setToken(authToken);
  };

  const signOut = async () => {
    await AuthService.signOut();
    setUser(null);
    setToken(null);
  };

  const value = {
    user,
    token,
    loading,
    signIn,
    signOut,
    isAuthenticated: !!user && !!token,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
```

## Security Features

1. **ID Token Verification**: Google ID tokens are verified server-side using Google's official library
2. **Platform-Specific Client IDs**: Different client IDs for iOS and Android ensure proper security boundaries
3. **JWT Tokens**: Server issues JWT tokens for subsequent API calls
4. **Token Refresh**: Automatic token refresh to maintain user sessions
5. **Secure Storage**: Tokens stored using Expo SecureStore for encryption

## Error Handling

The system provides comprehensive error handling for:
- Invalid Google tokens
- Unverified email addresses
- Network connectivity issues
- Server errors
- Token expiration

## Migration from Web Authentication

If you have existing web-based authentication, users will be automatically linked when they sign in with the same email address. The system maintains backward compatibility while providing enhanced mobile security.

## Testing

To test the implementation:

1. Ensure the backend server is running on the correct port (5000)
2. Update the `apiUrl` in `app.json` if using a different server address
3. Test on both iOS and Android simulators/devices
4. Verify token persistence across app restarts
5. Test token refresh functionality

## Troubleshooting

### Common Issues:

1. **Invalid Client ID**: Ensure you're using the correct client ID for each platform
2. **Network Errors**: Check that the backend server is accessible from the mobile device
3. **Token Verification Failures**: Verify that the Google Auth Library is properly installed
4. **CORS Issues**: Ensure mobile schemes are included in CORS configuration

### Debug Mode:

Enable detailed logging by setting the debug flag in your development environment:

```javascript
// Add to your app's entry point
if (__DEV__) {
  global.XMLHttpRequest = global.originalXMLHttpRequest || global.XMLHttpRequest;
  global.FormData = global.originalFormData || global.FormData;
}
```

This implementation provides a robust, secure, and user-friendly authentication system specifically designed for mobile applications. 