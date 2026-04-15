// src/components/Login.js
import React, { useState } from 'react';
import './Login.css';

function Login({ onLogin }) {
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const endpoint = isLogin ? 'login' : 'register';
    
    try {
      const response = await fetch(`http://localhost:5000/api/auth/${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        localStorage.setItem('token', data.token);
        onLogin(data.user);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Connection error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-box">
        <h2>{isLogin ? 'Welcome Back' : 'Create Account'}</h2>
        <p className="subtitle">
          {isLogin ? 'Please enter your details to sign in' : 'Fill in the information below to get started'}
        </p>
        
        <form onSubmit={handleSubmit}>
          {!isLogin && (
            <div className="input-group">
              <label htmlFor="username">Username</label>
              <div className="input-wrapper">
                <i className="icon user-icon">👤</i>
                <input
                  type="text"
                  id="username"
                  name="username"
                  placeholder="Enter your username"
                  value={formData.username}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="email">Email</label>
            <div className="input-wrapper">
              <i className="icon email-icon">📧</i>
              <input
                type="email"
                id="email"
                name="email"
                placeholder="Enter your email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-wrapper">
              <i className="icon password-icon">🔒</i>
              <input
                type={showPassword ? 'text' : 'password'}
                id="password"
                name="password"
                placeholder="Enter your password"
                value={formData.password}
                onChange={handleChange}
                required
              />
              <button 
                type="button"
                className="password-toggle"
                onClick={togglePasswordVisibility}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '👁️' : '👁️‍🗨️'}
              </button>
            </div>
          </div>

          {error && <div className="error-message">{error}</div>}

          <button type="submit" className="submit-btn" disabled={loading}>
            {loading ? (
              <div className="spinner-container">
                <div className="spinner"></div>
                <span>Processing...</span>
              </div>
            ) : (
              isLogin ? 'Sign In' : 'Create Account'
            )}
          </button>
        </form>

        <div className="toggle-auth">
          <p>
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button 
              type="button"
              className="toggle-btn"
              onClick={() => setIsLogin(!isLogin)}
            >
              {isLogin ? 'Sign up' : 'Sign in'}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
}

export default Login;