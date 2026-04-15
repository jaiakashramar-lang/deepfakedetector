# 🎭 Audio-Visual Deepfake Detection System for Messaging Environment

> **Real-time deepfake detection in messaging apps using deep learning with PostgreSQL storage**

## 👥 Authors
- **Jai Akash R**
- **Vignesh V.S**
- **Kabilan K**
- **Pranav Nathan M.B**

---

## 📖 Explanation

### What is this project?
This system detects fake audio and video content (deepfakes) shared in messaging apps. When a user sends a voice note or video message, the system automatically analyzes it using deep learning models to check if it's real or AI-generated.

### How it works?

**1. User sends a message**
- User records voice note or video in React.js messenger
- Message sent to Node.js chat server via WebSocket

**2. Automatic deepfake detection**
- Chat server forwards media to FastAPI detection API
- Python backend runs three deep learning models:
  - **Wav2Vec2 + ASVspoof** - Analyzes audio for synthetic patterns
  - **FakeAVCeleb** - Checks if lip movements match audio
  - **Ensemble** - Combines all results for final verdict

**3. Results shown to users**
- Real content → Delivered normally
- Deepfake detected → Warning shown to receiver
- User credibility score decreases in PostgreSQL

### Technology Stack

| Component | Technology | Purpose |
|-----------|------------|---------|
| Frontend | React.js | Messenger UI with audio/video recording |
| Chat Server | Node.js + Socket.io | Real-time message handling |
| Detection API | Python FastAPI | Deepfake detection models |
| Database | PostgreSQL | Store users, messages, detection logs |
| ML Models | Wav2Vec2, ASVspoof, FakeAVCeleb | Audio and video deepfake detection |

### Database Storage (PostgreSQL)

The system stores:
- **Users** - Username, email, credibility score (100 = trustworthy)
- **Messages** - Text, audio, video messages between users
- **Detection Logs** - Every detection result with confidence scores
- **Flagged Content** - Messages identified as deepfakes

When a deepfake is detected:
- The message is flagged in database
- Sender's credibility score decreases
- Detection result stored for audit trail

### Model Training Details

| Model | Trained On | Detects |
|-------|-----------|---------|
| Wav2Vec2 + ASVspoof | ASVspoof 2021 dataset | AI-generated audio |
| FakeAVCeleb | FakeAVCeleb dataset | Mismatched lip movements |
| Ensemble | Combined predictions | Final decision with confidence |

### Message Flow Example
