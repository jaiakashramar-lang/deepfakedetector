// App.js
import React, { useState, useEffect } from 'react';
import Home from './components/Home';
import Login from './components/Login';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Check if user is already logged in
  useEffect(() => {
    const checkLoggedIn = async () => {
      const token = localStorage.getItem('token');
      const savedUser = localStorage.getItem('user');
      
      if (token && savedUser) {
        try {
          // Verify token with backend
          const response = await fetch('http://localhost:5000/api/verify-token', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            }
          });
          
          const data = await response.json();
          
          if (data.valid) {
            setUser(JSON.parse(savedUser));
          } else {
            // Token invalid, clear storage
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            localStorage.removeItem('deviceId');
          }
        } catch (error) {
          console.error('Token verification failed:', error);
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          localStorage.removeItem('deviceId');
        }
      }
      setLoading(false);
    };

    checkLoggedIn();
  }, []);

  // Generate device ID on first load
  useEffect(() => {
    if (!localStorage.getItem('deviceId')) {
      localStorage.setItem('deviceId', Math.random().toString(36).substring(7));
    }
  }, []);

  const handleLogin = (userData) => {
    setUser(userData);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="loading-spinner"></div>
        <p>Loading WhatsApp...</p>
      </div>
    );
  }

  return (
    <div className="App">
      {user ? (
        <Home user={user} setUser={setUser} />
      ) : (
        <Login onLogin={handleLogin} />
      )}
    </div>
  );
}

export default App;