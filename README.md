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
