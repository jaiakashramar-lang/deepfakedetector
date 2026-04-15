# 🎭 Audio-Visual Deepfake Detection System for Messaging Environment

> **Real-time deepfake detection in messaging apps using deep learning with PostgreSQL storage**

## 👥 Authors
- **Jai Akash R**
- **Vignesh V.S**
- **Kabilan K**
- **Pranav Nathan M.B**

---

## 📋 Table of Contents
1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Features](#features)
4. [Tech Stack](#tech-stack)
5. [Database Schema](#database-schema)
6. [Project Structure](#project-structure)
7. [Installation](#installation)
8. [Model Details](#model-details)
9. [API Endpoints](#api-endpoints)
10. [Usage](#usage)
11. [Performance Metrics](#performance-metrics)
12. [Future Enhancements](#future-enhancements)

---

## 🔍 Overview

This project presents an end-to-end **Audio-Visual Deepfake Detection System** integrated into a real-time messaging environment. When users share voice notes or video messages, the system automatically analyzes them using state-of-the-art deep learning models (Wav2Vec2, ASVspoof, FakeAVCeleb) to detect manipulated content. All data is persistently stored in PostgreSQL for audit trails and credibility scoring.

### Problem Statement
Deepfakes pose significant threats to digital communication integrity. This system helps messaging platforms identify and flag synthetic audio and video content before it can be used for misinformation, fraud, or identity theft.

---

## 🏗️ System Architecture

---

## ✨ Features

### Core Functionality
- ✅ **Real-time Audio Deepfake Detection** - Voice note analysis using Wav2Vec2 + ASVspoof 2021
- ✅ **Audio-Visual Sync Detection** - Lip movement vs audio alignment using FakeAVCeleb trained model
- ✅ **Automatic Media Scanning** - Every shared audio/video is analyzed
- ✅ **Credibility Scoring System** - Per-user trust scores based on detection history
- ✅ **PostgreSQL Persistent Storage** - All messages, users, and detection logs stored reliably
- ✅ **Real-time WebSocket Communication** - Instant message delivery and detection alerts
- ✅ **Ensemble Voting** - Combines multiple models for higher accuracy

### Detection Capabilities
| Media Type | Detection Method | Output |
|------------|-----------------|--------|
| Audio Only | Wav2Vec2 + ASVspoof | Bonafide / Spoof (0-100%) |
| Video | FakeAVCeleb (Audio-Visual) | Real / Fake / Mismatch |
| Voice Note | Ensemble Model | Deepfake Confidence Score |

---

## 🛠️ Tech Stack

### Backend Detection (Python - FastAPI)
- fastapi, uvicorn - API framework
- transformers (HuggingFace) - Wav2Vec2 model
- torch, torchaudio - PyTorch backend
- librosa - Audio processing
- opencv-python - Video frame extraction
- asyncpg - PostgreSQL async driver
- python-multipart - File upload handling

### Messaging Server (Node.js)
- express, socket.io - Real-time communication
- pg, sequelize - PostgreSQL ORM
- axios, multer - API calls & file handling
- bcrypt, jsonwebtoken - Authentication

### Frontend (React.js)
- react, socket.io-client - UI & real-time updates
- react-player - Media playback
- recorder.js - Audio/video recording
- tailwindcss / Material-UI - Styling
- axios - HTTP requests

### Database (PostgreSQL)
- PostgreSQL 15+ - Primary database
- Sequelize ORM - Node.js ORM
- asyncpg - Python async driver

---

## 🗄️ Database Schema (PostgreSQL)

```sql
-- Users Table
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    credibility_score DECIMAL(5,2) DEFAULT 100.00,
    total_messages INT DEFAULT 0,
    flagged_messages INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_active TIMESTAMP
);

-- Messages Table
CREATE TABLE messages (
    id SERIAL PRIMARY KEY,
    sender_id INT REFERENCES users(id),
    receiver_id INT REFERENCES users(id),
    message_type VARCHAR(20) CHECK (message_type IN ('text', 'audio', 'video', 'image')),
    content TEXT,
    media_url TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_deleted BOOLEAN DEFAULT FALSE
);

-- Detection Logs Table
CREATE TABLE detection_logs (
    id SERIAL PRIMARY KEY,
    message_id INT REFERENCES messages(id),
    detection_type VARCHAR(20) CHECK (detection_type IN ('audio', 'video', 'audiovisual')),
    is_deepfake BOOLEAN,
    confidence_score DECIMAL(5,2),
    model_used VARCHAR(50),
    wav2vec2_score DECIMAL(5,2),
    asvspoof_score DECIMAL(5,2),
    fakeavceleb_score DECIMAL(5,2),
    processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    processing_time_ms INT
);

-- Conversations Table
CREATE TABLE conversations (
    id SERIAL PRIMARY KEY,
    participant1_id INT REFERENCES users(id),
    participant2_id INT REFERENCES users(id),
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_message_at TIMESTAMP
);

-- Flagged Content Table
CREATE TABLE flagged_content (
    id SERIAL PRIMARY KEY,
    message_id INT REFERENCES messages(id),
    flagged_by INT REFERENCES users(id),
    reason TEXT,
    severity VARCHAR(20) CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    reviewed BOOLEAN DEFAULT FALSE,
    flagged_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_detection_logs_message ON detection_logs(message_id);
CREATE INDEX idx_users_credibility ON users(credibility_score);
