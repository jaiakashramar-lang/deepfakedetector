import os
import time
import shutil
import subprocess
import numpy as np
import torch
import torchaudio
import onnxruntime as ort

import cv2
import tensorflow as tf
import os
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "3"

import logging
logging.getLogger("tensorflow").setLevel(logging.ERROR)

import warnings
warnings.filterwarnings("ignore")
import json
import base64
import asyncio
import queue
import threading
from portable_ffmpeg import get_ffmpeg, add_to_path
from pydub import AudioSegment
from tqdm import tqdm
from transformers import AutoFeatureExtractor, AutoModelForAudioClassification
from moviepy.editor import VideoFileClip
from fastapi import FastAPI, File, UploadFile, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, Dict, Any, List

import tempfile
from pathlib import Path
import logging
import io
from PIL import Image
import soundfile as sf
import audioop

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize FastAPI
app = FastAPI(
    title="Deepfake Detection API",
    description="API for detecting deepfake in images, audio, and video files with live detection",
    version="1.0.0"
)

# FFMPEG SETUP
def setup_ffmpeg_for_pydub():
    """Configure ffmpeg paths for pydub using portable ffmpeg"""
    try:
       
        ffmpeg_path, ffprobe_path = get_ffmpeg()
        
        # Convert to absolute paths
        ffmpeg_path = os.path.abspath(ffmpeg_path)
        ffprobe_path = os.path.abspath(ffprobe_path)
        
        # Verify the binaries exist
        if not os.path.exists(ffmpeg_path):
            raise FileNotFoundError(f"FFmpeg not found at {ffmpeg_path}")
        if not os.path.exists(ffprobe_path):
            raise FileNotFoundError(f"FFprobe not found at {ffprobe_path}")
        
        # Set paths for pydub
        AudioSegment.converter = ffmpeg_path
        AudioSegment.ffmpeg = ffmpeg_path
        AudioSegment.ffprobe = ffprobe_path
        
        # Add to PATH as fallback
        add_to_path(weak=True)
        
        logger.info(f"✅ FFmpeg configured: {ffmpeg_path}")
        logger.info(f"✅ FFprobe configured: {ffprobe_path}")
        
        # Test FFmpeg
        result = subprocess.run([ffmpeg_path, '-version'], 
                               capture_output=True, text=True)
        if result.returncode == 0:
            version = result.stdout.split('\n')[0]
            logger.info(f"✅ FFmpeg version: {version}")
            return True
        else:
            logger.error("❌ FFmpeg test failed")
            return False
            
    except Exception as e:
        logger.error(f"❌ FFmpeg setup failed: {e}")
        return False

# Setup FFmpeg at startup
setup_success = setup_ffmpeg_for_pydub()
if not setup_success:
    logger.warning("⚠️ FFmpeg setup failed - WebM audio conversion may not work")

# Cors middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:5000","https://cordately-unlustful-aidyn.ngrok-free.dev"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

#PATH SETTINGS
audio_model_name = "./garystafford/wav2vec2-deepfake-voice-detector"
audio_model_path = "./deepfake/models/Audio_model/wav2vec2_detector"
video_model_path = r"D:\project\detector\models\deepfake.onnx"
video_proto_path = r"D:\project\detector\models\deploy.prototxt"
video_dnn_model = r"D:\project\detector\models\res10_300x300_ssd_iter_140000.caffemodel"

# DEVICE
device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
logger.info(f"⚡ Using Device: {device}")

# Global variables for models
audio_model = None
feature_extractor = None
video_model = None
dnn_net = None

# Live detection queues
audio_queue = queue.Queue()
video_queue = queue.Queue()
live_results = {}

#  PYDANTIC MODELS
class AudioDetectionResponse(BaseModel):
    success: bool
    prediction: str
    real_confidence: float
    fake_confidence: float
    processing_time: float

class VideoDetectionResponse(BaseModel):
    success: bool
    prediction: str
    confidence: float
    details: Dict[str, Any]

class ImageDetectionResponse(BaseModel):
    success: bool
    prediction: str
    confidence: float
    details: Dict[str, Any]
    processing_time: float

class CombinedDetectionResponse(BaseModel):
    success: bool
    media_type: str
    audio_result: Optional[AudioDetectionResponse] = None
    video_result: Optional[VideoDetectionResponse] = None
    image_result: Optional[ImageDetectionResponse] = None
    final_prediction: str
    processing_time: float

class LiveDetectionResponse(BaseModel):
    type: str  # audio or video
    prediction: str
    confidence: float
    timestamp: float
    details: Optional[Dict[str, Any]] = None

class HealthResponse(BaseModel):
    status: str
    device: str
    audio_model_loaded: bool
    video_model_loaded: bool
    image_model_loaded: bool
    cuda_available: bool

#IMAGE DETECTION FUNCTIONS
def preprocess_image_for_detection(image_path: str) -> np.ndarray:
    """Preprocess image for deepfake detection"""
    try:
        # Read image
        image = cv2.imread(image_path)
        if image is None:
            raise ValueError("Could not read image")
        
        # Convert to RGB
        image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        
        # Resize to model input size (224x224)
        image_resized = cv2.resize(image_rgb, (224, 224))
        
        # Preprocess for EfficientNet
        image_preprocessed = tf.keras.applications.efficientnet.preprocess_input(image_resized)
        
        return image_preprocessed
        
    except Exception as e:
        logger.error(f"Error preprocessing image: {e}")
        raise

async def detect_deepfake_image(image_path: str) -> Dict[str, Any]:
    """Detect if image is deepfake or real"""
    start = time.time()
    
    try:
        # Preprocess image
        image_array = preprocess_image_for_detection(image_path)
        
        # Add batch dimension
        image_batch = np.expand_dims(image_array, axis=0)
        
        # Predict
        prediction = video_model.predict(image_batch, verbose=0)
        pred_value = float(prediction[0][0])
        
        # Determine result
        threshold = 0.4
        if pred_value > threshold:
            prediction_label = "FAKE"
            confidence = pred_value
        else:
            prediction_label = "REAL"
            confidence = 1 - pred_value
        
        # Calculate brightness
        image_original = cv2.imread(image_path)
        gray = cv2.cvtColor(image_original, cv2.COLOR_BGR2GRAY)
        brightness = float(np.mean(gray))
        
        end = time.time()
        processing_time = round(end - start, 3)
        
        logger.info(f"Image Detection: {prediction_label} with confidence {confidence:.4f}")
        
        return {
            "success": True,
            "prediction": prediction_label,
            "confidence": round(float(confidence), 4),
            "details": {
                "raw_score": round(float(pred_value), 4),
                "threshold": float(threshold),
                "brightness": round(float(brightness), 2),
                "model": "EfficientNet-based Deepfake Detector"
            },
            "processing_time": processing_time
        }
        
    except Exception as e:
        logger.error(f"Error in image detection: {str(e)}")
        return {
            "success": False,
            "prediction": "ERROR",
            "confidence": 0.0,
            "details": {"error": str(e)},
            "processing_time": round(time.time() - start, 3)
        }

#  AUDIO CONVERSION FUNCTIONS 
def convert_webm_to_wav_pydub(input_path: str, output_path: str):
    """Convert WebM audio to WAV using pydub with configured FFmpeg"""
    try:
        logger.info(f"🔄 Converting {input_path} to WAV...")
        
        
        audio = AudioSegment.from_file(input_path, format="webm")
        
        
        audio.export(
            output_path,
            format="wav",
            parameters=[
                "-acodec", "pcm_s16le",  
            ]
        )
        
        # Verify the output
        if os.path.exists(output_path) and os.path.getsize(output_path) > 0:
            file_size = os.path.getsize(output_path) / 1024
            logger.info(f"✅ Converted to WAV successfully: {output_path} ({file_size:.2f} KB)")
            return True
        else:
            logger.error("❌ Output file is empty or missing")
            return False
            
    except Exception as e:
        logger.error(f"❌ Failed to convert WebM audio: {e}")
        return False

def convert_webm_to_wav_direct(input_path: str, output_path: str):
    """Convert WebM to WAV using direct FFmpeg subprocess call"""
    try:
        # Get FFmpeg path
        ffmpeg_path, _ = get_ffmpeg()
        ffmpeg_path = os.path.abspath(ffmpeg_path)
        
        if not os.path.exists(ffmpeg_path):
            logger.error(f"❌ FFmpeg not found at: {ffmpeg_path}")
            return False
        
        # Build FFmpeg command
        cmd = [
            ffmpeg_path,
            '-i', input_path,
            '-acodec', 'pcm_s16le',
            '-ar', '16000',
            '-ac', '1',
            '-y',  # Overwrite output
            output_path
        ]
        
        logger.info(f"🔄 Running FFmpeg command: {' '.join(cmd)}")
        
        # Run conversion
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=30  # 30 second timeout
        )
        
        if result.returncode == 0 and os.path.exists(output_path):
            file_size = os.path.getsize(output_path) / 1024
            logger.info(f"✅ Direct conversion successful: {output_path} ({file_size:.2f} KB)")
            return True
        else:
            logger.error(f"❌ FFmpeg error: {result.stderr}")
            return False
            
    except subprocess.TimeoutExpired:
        logger.error("❌ FFmpeg conversion timed out")
        return False
    except Exception as e:
        logger.error(f"❌ Direct conversion failed: {e}")
        return False

def convert_webm_to_wav(input_path: str, output_path: str):
    """Try multiple conversion methods"""
    
    # Method 1: pydub with configured paths
    if convert_webm_to_wav_pydub(input_path, output_path):
        return True
    
    # Method 2: Direct FFmpeg subprocess
    if convert_webm_to_wav_direct(input_path, output_path):
        return True
    
    logger.error("❌ All conversion methods failed")
    return False

#  LIVE DETECTION FUNCTIONS 
async def process_live_audio(audio_bytes: bytes, sample_rate: int = 16000):
    """Process live audio chunk for deepfake detection"""
    try:
        # Convert bytes to numpy array
        audio_np = np.frombuffer(audio_bytes, dtype=np.int16).astype(np.float32) / 32768.0
        
        # Ensure correct sample rate
        if sample_rate != 16000:
            # Simple resampling (for demo - use proper resampling in production)
            audio_np = audio_np[::sample_rate//16000]
        
        # Extract features
        inputs = feature_extractor(
            audio_np,
            sampling_rate=16000,
            return_tensors="pt",
            padding=True
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Predict
        with torch.no_grad():
            outputs = audio_model(**inputs)
        
        probs = torch.softmax(outputs.logits, dim=1)
        
        # Get labels
        id2label = audio_model.config.id2label
        real_idx, fake_idx = None, None
        for k, v in id2label.items():
            if "real" in v.lower():
                real_idx = int(k)
            elif "fake" in v.lower():
                fake_idx = int(k)
        
        real_score = float(probs[0][real_idx].item() if real_idx is not None else probs[0][0].item())
        fake_score = float(probs[0][fake_idx].item() if fake_idx is not None else probs[0][1].item())
        
        prediction = "REAL" if real_score >= fake_score else "FAKE"
        confidence = real_score if real_score >= fake_score else fake_score
        
        return {
            "type": "audio",
            "prediction": prediction,
            "confidence": round(float(confidence), 4),
            "real_confidence": round(float(real_score), 4),
            "fake_confidence": round(float(fake_score), 4),
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Error in live audio processing: {e}")
        return None

async def process_live_video(frame_bytes: bytes, width: int, height: int):
    """Process live video frame for deepfake detection"""
    try:
        # Convert bytes to numpy array
        nparr = np.frombuffer(frame_bytes, np.uint8)
        frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if frame is None:
            return None
        
        # Detect face
        face_box = detect_face(frame)
        
        if face_box is None:
            return {
                "type": "video",
                "prediction": "NO FACE",
                "confidence": 0.0,
                "timestamp": time.time()
            }
        
        x, y, w, h = face_box
        face = frame[y:y+h, x:x+w]
        
        if face.size == 0:
            return None
        
        # Predict
        pred_value = predict_face(face)
        
        prediction = "FAKE" if pred_value > 0.4 else "REAL"
        confidence = pred_value if pred_value > 0.4 else 1 - pred_value
        
        return {
            "type": "video",
            "prediction": prediction,
            "confidence": round(float(confidence), 4),
            "raw_score": round(float(pred_value), 4),
            "timestamp": time.time()
        }
        
    except Exception as e:
        logger.error(f"Error in live video processing: {e}")
        return None

# ================= WEBSOCKET FOR LIVE DETECTION =================
@app.websocket("/ws/live")
async def websocket_live_detection(websocket: WebSocket):
    await websocket.accept()
    client_id = id(websocket)
    logger.info(f"🟢 Live detection client connected: {client_id}")
    
    try:
        while True:
            # Receive message from client
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            
            if message_type == "audio":
                # Process audio chunk
                audio_data = base64.b64decode(message.get("data", ""))
                sample_rate = message.get("sampleRate", 16000)
                
                result = await process_live_audio(audio_data, sample_rate)
                if result:
                    await websocket.send_json(result)
                    
            elif message_type == "video":
                # Process video frame
                frame_data = base64.b64decode(message.get("data", ""))
                width = message.get("width", 640)
                height = message.get("height", 480)
                
                result = await process_live_video(frame_data, width, height)
                if result:
                    await websocket.send_json(result)
                    
            elif message_type == "start":
                # Start live detection session
                detection_type = message.get("detectionType", "both")
                await websocket.send_json({
                    "type": "status",
                    "status": "started",
                    "message": f"Live {detection_type} detection started"
                })
                
            elif message_type == "stop":
                # Stop live detection
                await websocket.send_json({
                    "type": "status",
                    "status": "stopped",
                    "message": "Live detection stopped"
                })
                break
                
    except WebSocketDisconnect:
        logger.info(f"🔴 Live detection client disconnected: {client_id}")
    except Exception as e:
        logger.error(f"❌ WebSocket error: {e}")

# LOAD MODELS AT STARTUP
@app.on_event("startup")
async def load_models():
    global audio_model, feature_extractor, video_model, dnn_net
    
    logger.info("\n🚀 Deepfake Audio, Image & Video Detection API Starting...\n")
    
    # Load Audio Model
    logger.info("📦 Loading audio model...")
    try:
        if not os.path.exists(audio_model_path):
            logger.info("📥 Downloading audio model...")
            feature_extractor = AutoFeatureExtractor.from_pretrained(audio_model_name)
            audio_model = AutoModelForAudioClassification.from_pretrained(audio_model_name)
            os.makedirs(audio_model_path, exist_ok=True)
            feature_extractor.save_pretrained(audio_model_path)
            audio_model.save_pretrained(audio_model_path)
        else:
            logger.info("📦 Loading audio model locally...")
            feature_extractor = AutoFeatureExtractor.from_pretrained(audio_model_path)
            audio_model = AutoModelForAudioClassification.from_pretrained(audio_model_path)

        audio_model.to(device)
        audio_model.eval()
        logger.info("✅ Audio model ready")
    except Exception as e:
        logger.error(f"❌ Failed to load audio model: {str(e)}")
    
    # Load Video/Image Model (same model for both)
    logger.info("\n📦 Loading video/image model...")
    try:
        video_model = ort.InferenceSession(video_model_path)
        logger.info("✅ Video/Image model loaded successfully!")
        
        # Load DNN face detector
        dnn_net = cv2.dnn.readNetFromCaffe(video_proto_path, video_dnn_model)
        logger.info("✅ DNN face detector loaded successfully!")
    except Exception as e:
        logger.error(f"❌ Failed to load video model: {str(e)}")
    
    logger.info("✅ All models loaded successfully!\n")

# ================= AUDIO FUNCTIONS =================
async def detect_deepfake_audio(audio_path: str) -> Dict[str, Any]:
    """Detect if audio is deepfake or real"""
    start = time.time()
    
    try:
        # Load audio
        audio, sr = sf.read(audio_path)

        waveform = torch.tensor(audio).float()
        
        # Convert to mono if stereo
        if waveform.ndim > 1:
            waveform = waveform.mean(dim=1)

        # Add channel dimension
        waveform = waveform.unsqueeze(0)
        
        # Resample to 16kHz if needed
        if sr != 16000:
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=16000)
            waveform = resampler(waveform)
            sr = 16000
        
        # Normalize
        waveform = waveform / waveform.abs().max()
        waveform_np = waveform.squeeze().numpy()
        
        # Extract features
        inputs = feature_extractor(
            waveform_np,
            sampling_rate=sr,
            return_tensors="pt",
            padding=True
        )
        inputs = {k: v.to(device) for k, v in inputs.items()}
        
        # Predict
        with torch.no_grad():
            outputs = audio_model(**inputs)
        
        logits = outputs.logits
        probs = torch.softmax(logits, dim=1)
        
        # Get labels
        id2label = audio_model.config.id2label
        real_idx, fake_idx = None, None
        for k, v in id2label.items():
            if "real" in v.lower():
                real_idx = int(k)
            elif "fake" in v.lower():
                fake_idx = int(k)
        
        real_score = float(probs[0][real_idx].item() if real_idx is not None else probs[0][0].item())
        fake_score = float(probs[0][fake_idx].item() if fake_idx is not None else probs[0][1].item())
        
        label = "REAL AUDIO" if real_score >= fake_score else "FAKE AUDIO"
        
        end = time.time()
        processing_time = round(end - start, 3)
        
        logger.info(f"Audio Detection Time: {processing_time}s")
        
        return {
            "success": True,
            "prediction": label,
            "real_confidence": round(float(real_score), 4),
            "fake_confidence": round(float(fake_score), 4),
            "processing_time": processing_time
        }
    
    except Exception as e:
        logger.error(f"Error in audio detection: {str(e)}")
        return {
            "success": False,
            "prediction": "ERROR",
            "real_confidence": 0.0,
            "fake_confidence": 0.0,
            "processing_time": round(time.time() - start, 3),
            "error": str(e)
        }

# VIDEO FUNCTIONS 
def preprocess_frame(frame, frame_size=(224, 224)):
    """Preprocess frame for model input"""
    frame = cv2.resize(frame, frame_size)
    frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    frame = tf.keras.applications.efficientnet.preprocess_input(frame)
    return np.expand_dims(frame, axis=0)

def predict_face(face):

    preprocessed = preprocess_frame(face).astype(np.float32)

    input_name = video_model.get_inputs()[0].name

    pred = video_model.run(None, {input_name: preprocessed})

    return float(pred[0][0][0])

def auto_enhance(frame, threshold=50, attempts=3):
    """Enhance low-light frames with more aggressive settings for dark videos"""
    original = frame.copy()
    
    for i in range(attempts):
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        current_brightness = float(np.mean(gray))  # Convert to Python float
        
        # If brightness is acceptable break
        if current_brightness >= threshold:
            break
        
        # Calculate enhancement factors based on how dark the frame is
        darkness_factor = (threshold - current_brightness) / 50
        
        # More aggressive enhancement for very dark frames
        alpha = float(1.0 + darkness_factor * (1.5 + 0.5 * i))  # Contrast  convert to float
        beta = int(darkness_factor * 40 * (1 + 0.3 * i))   # Brightness
        
        # Apply contrast and brightness adjustment
        frame = cv2.convertScaleAbs(frame, alpha=alpha, beta=beta)
        
        # Apply histogram equalization to Y channel better for dark videos
        yuv = cv2.cvtColor(frame, cv2.COLOR_BGR2YUV)
        yuv[:, :, 0] = cv2.equalizeHist(yuv[:, :, 0])
        frame = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)
        
        # Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) for very dark frames
        if current_brightness < 30:
            lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
            l, a, b = cv2.split(lab)
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
            l = clahe.apply(l)
            lab = cv2.merge([l, a, b])
            frame = cv2.cvtColor(lab, cv2.COLOR_LAB2BGR)
        
        new_brightness = float(np.mean(cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)))
        logger.info(f"Enhancement attempt {i+1}: Brightness improved from {current_brightness:.1f} to {new_brightness:.1f}")
    
    return frame

def detect_face(frame, min_size=(30, 30)):
    """Detect face in frame using multiple methods with better dark video support"""
    
    # Try multiple detection methods
    methods = []
    
    # Method 1: Haar cascade with default parameters
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    haar_face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml')
    faces = haar_face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=min_size)
    
    if len(faces) > 0:
        return max(faces, key=lambda r: r[2] * r[3])
    
    # Method 2: Haar cascade with more sensitive parameters for dark videos
    faces = haar_face_cascade.detectMultiScale(gray, scaleFactor=1.05, minNeighbors=3, minSize=(20, 20))
    if len(faces) > 0:
        return max(faces, key=lambda r: r[2] * r[3])
    
    # Method 3: Try DNN if available (more robust for dark/angled faces)
    if dnn_net is not None:
        h, w = frame.shape[:2]
        blob = cv2.dnn.blobFromImage(cv2.resize(frame, (300, 300)), 1.0, (300, 300), (104.0, 177.0, 123.0))
        dnn_net.setInput(blob)
        detections = dnn_net.forward()
        
        max_conf, best_box = 0.0, None
        for i in range(detections.shape[2]):
            conf = float(detections[0, 0, i, 2])  # Convert to Python float
            # Lower confidence threshold for dark videos
            if conf > 0.3:  # Reduced from 0.5 to 0.3 for dark videos
                box = detections[0, 0, i, 3:7] * np.array([w, h, w, h])
                x1, y1, x2, y2 = box.astype(int)
                if conf > max_conf:
                    max_conf = conf
                    best_box = (int(x1), int(y1), int(x2 - x1), int(y2 - y1))
        
        if best_box:
            logger.info(f"Face detected by DNN with confidence: {max_conf:.2f}")
            return best_box
    
    return None

async def fast_robust_video_prediction(video_path: str, threshold: float = 0.4) -> Dict[str, Any]:
    """Detect if video is deepfake or real - with proper handling for no-face videos"""
    start = time.time()
    
    try:
        cap = cv2.VideoCapture(video_path)
        if not cap.isOpened():
            return {
                "success": False,
                "prediction": "ERROR",
                "confidence": 0.0,
                "details": {"error": "Cannot open video"},
                "processing_time": round(time.time() - start, 3)
            }
        
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = float(cap.get(cv2.CAP_PROP_FPS))
        frame_width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        frame_height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        
        # Calculate key frames to process
        min_key_frames = 50
        max_key_frames = 120
        key_frame_count = int(np.clip(total_frames / (fps * 2), min_key_frames, max_key_frames))
        frame_indices = np.linspace(0, total_frames - 1, key_frame_count, dtype=int)
        
        predictions = []
        base_width = 320
        scale_factor = float(base_width / frame_width) if frame_width > base_width else 1.0
        
        frames_processed = 0
        faces_detected = 0
        brightness_scores = []
        
        for idx in frame_indices:
            cap.set(cv2.CAP_PROP_POS_FRAMES, idx)
            ret, frame = cap.read()
            if not ret:
                continue
            
            frames_processed += 1
            
            # Check brightness before enhancement
            gray_before = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness_before = float(np.mean(gray_before))
            brightness_scores.append(brightness_before)  # Already Python float
            
            # Apply auto enhancement for dark videos
            frame = auto_enhance(frame)
            
            # Verify enhancement worked
            gray_after = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness_after = float(np.mean(gray_after))
            
            if brightness_after > brightness_before + 10:
                logger.info(f"Frame {idx}: Enhanced brightness from {brightness_before:.1f} to {brightness_after:.1f}")
            
            # Resize for faster processing
            if scale_factor != 1.0:
                small_frame = cv2.resize(frame, (int(frame_width * scale_factor), int(frame_height * scale_factor)))
            else:
                small_frame = frame
            
            # Detect face with multiple attempts for dark videos
            face_box = None
            detection_attempts = 3
            
            for attempt in range(detection_attempts):
                face_box = detect_face(small_frame)
                if face_box is not None:
                    break
                # If no face detected, try with different parameters
                if attempt == 0:
                    # First retry: adjust contrast
                    small_frame = cv2.convertScaleAbs(small_frame, alpha=1.5, beta=30)
                elif attempt == 1:
                    # Second retry: use histogram equalization
                    gray = cv2.cvtColor(small_frame, cv2.COLOR_BGR2GRAY)
                    gray_eq = cv2.equalizeHist(gray)
                    small_frame = cv2.cvtColor(gray_eq, cv2.COLOR_GRAY2BGR)
            
            if face_box is None:
                continue
            
            faces_detected += 1
            x, y, w, h = face_box
            
            # Scale back coordinates
            if scale_factor != 1.0:
                x = int(x / scale_factor)
                y = int(y / scale_factor)
                w = int(w / scale_factor)
                h = int(h / scale_factor)
            
            # Extract and predict face
            face = frame[y:y + h, x:x + w]
            if face.size == 0:
                continue
                
            pred_value = predict_face(face)
            predictions.append(pred_value)  # Already Python float from predict_face
            
            # Early stopping if confident and we have enough samples
            if len(predictions) >= 10:
                avg_pred = float(np.mean(predictions))
                if avg_pred > threshold + 0.2:
                    cap.release()
                    end = time.time()
                    return {
                        "success": True,
                        "prediction": "FAKE",
                        "confidence": round(float(avg_pred), 4),
                        "details": {
                            "frames_processed": int(frames_processed),
                            "faces_detected": int(faces_detected),
                            "early_stop": True,
                            "avg_prediction": round(float(avg_pred), 4),
                            "brightness_analysis": {
                                "avg_brightness": round(float(np.mean(brightness_scores)), 2),
                                "was_enhanced": bool(float(np.mean(brightness_scores)) < 50)
                            }
                        },
                        "processing_time": round(end - start, 3)
                    }
                elif avg_pred < threshold - 0.2 and len(predictions) >= 15:
                    cap.release()
                    end = time.time()
                    return {
                        "success": True,
                        "prediction": "REAL",
                        "confidence": round(float(1 - avg_pred), 4),
                        "details": {
                            "frames_processed": int(frames_processed),
                            "faces_detected": int(faces_detected),
                            "early_stop": True,
                            "avg_prediction": round(float(avg_pred), 4),
                            "brightness_analysis": {
                                "avg_brightness": round(float(np.mean(brightness_scores)), 2),
                                "was_enhanced": bool(float(np.mean(brightness_scores)) < 50)
                            }
                        },
                        "processing_time": round(end - start, 3)
                    }
        
        cap.release()
        
        # Check if any faces were detected
        if faces_detected == 0:
            end = time.time()
            avg_brightness = float(np.mean(brightness_scores)) if brightness_scores else 0.0
            
            return {
                "success": True,  # Still success because analysis completed
                "prediction": "NO FACE DETECTED",
                "confidence": 0.0,
                "details": {
                    "frames_processed": int(frames_processed),
                    "faces_detected": 0,
                    "message": "No human faces found in the video. This video cannot be analyzed for deepfake detection.",
                    "brightness_analysis": {
                        "avg_brightness": round(float(avg_brightness), 2),
                        "was_dark": bool(avg_brightness < 50),
                        "enhancement_applied": bool(avg_brightness < 50)
                    }
                },
                "processing_time": round(end - start, 3)
            }
        
        # Calculate final prediction only if faces were detected
        avg_pred = float(np.mean(predictions)) if predictions else 0.0
        avg_brightness = float(np.mean(brightness_scores)) if brightness_scores else 0.0
        
        # Only classify if we have enough face samples
        if len(predictions) < 5:
            return {
                "success": True,
                "prediction": "INSUFFICIENT FACES",
                "confidence": 0.0,
                "details": {
                    "frames_processed": int(frames_processed),
                    "faces_detected": int(faces_detected),
                    "face_samples": int(len(predictions)),
                    "message": "Not enough face samples for reliable detection",
                    "brightness_analysis": {
                        "avg_brightness": round(float(avg_brightness), 2),
                        "was_enhanced": bool(avg_brightness < 50)
                    }
                },
                "processing_time": round(end - start, 3)
            }
        
        label = "FAKE" if avg_pred > threshold else "REAL"
        confidence = float(avg_pred if avg_pred > threshold else 1 - avg_pred)
        
        end = time.time()
        
        return {
            "success": True,
            "prediction": label,
            "confidence": round(float(confidence), 4),
            "details": {
                "frames_processed": int(frames_processed),
                "faces_detected": int(faces_detected),
                "face_samples": int(len(predictions)),
                "avg_prediction": round(float(avg_pred), 4),
                "threshold": float(threshold),
                "brightness_analysis": {
                    "avg_brightness": round(float(avg_brightness), 2),
                    "was_dark": bool(avg_brightness < 50),
                    "enhancement_applied": bool(avg_brightness < 50),
                    "enhancement_successful": bool(avg_brightness < 50)
                }
            },
            "processing_time": round(end - start, 3)
        }
    
    except Exception as e:
        logger.error(f"Error in video detection: {str(e)}")
        return {
            "success": False,
            "prediction": "ERROR",
            "confidence": 0.0,
            "details": {"error": str(e)},
            "processing_time": round(time.time() - start, 3)
        }

# ================= FASTAPI ENDPOINTS =================
@app.get("/", tags=["Root"])
async def root():
    """Root endpoint with API information"""
    return {
        "message": "Deepfake Detection API",
        "version": "1.0.0",
        "supported_formats": {
            "images": [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp"],
            "videos": [".mp4", ".avi", ".mov", ".mkv", ".flv", ".wmv", ".m4v"],
            "audio": [".mp3", ".wav", ".flac", ".m4a", ".aac", ".ogg", ".webm"]
        },
        "endpoints": [
            "/health - Check API health",
            "/analyze - Analyze any media file (images, videos, audio)",
            "/analyze-image - Analyze image only",
            "/analyze-audio - Analyze audio only",
            "/analyze-video - Analyze video only",
            "/ws/live - WebSocket for live detection"
        ],
        "device": str(device)
    }

@app.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check():
    """Check if the API and models are healthy"""
    return HealthResponse(
        status="healthy",
        device=str(device),
        audio_model_loaded=audio_model is not None,
        video_model_loaded=video_model is not None,
        image_model_loaded=video_model is not None,  # Using same model for images
        cuda_available=torch.cuda.is_available()
    )

@app.post("/analyze", response_model=CombinedDetectionResponse, tags=["Analysis"])
async def analyze_media(file: UploadFile = File(...)):
    """
    Analyze a media file (image, video, or audio) for deepfake detection.
    
    - For images: Detects if the image contains a deepfake face
    - For videos: Detects both video and audio deepfakes if audio exists
    - For audio only: Detects audio deepfakes
    
    Supported formats:
    - Images: PNG, JPG, JPEG, GIF, BMP, WEBP
    - Videos: MP4, AVI, MOV, MKV, FLV, WMV, M4V
    - Audio: MP3, WAV, FLAC, M4A, AAC, OGG, WebM
    """
    temp_dir = tempfile.mkdtemp()
    temp_path = None
    audio_path = None
    converted_path = None
    
    try:
        # Save uploaded file
        file_ext = Path(file.filename).suffix.lower()
        temp_path = os.path.join(temp_dir, f"input{file_ext}")
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"Processing file: {file.filename} (Size: {file.size} bytes, Type: {file_ext})")

        # Define supported extensions
        image_extensions = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp']
        video_extensions = ['.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.m4v']
        audio_extensions = ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.webm']

        if file_ext in image_extensions:
            # ---------------- IMAGE ----------------
            logger.info(f"🖼️ Processing image: {file.filename}")
            
            # Run image detection
            logger.info("🖼️ Analyzing image...")
            image_result = await detect_deepfake_image(temp_path)
            
            # Determine final prediction
            if not image_result["success"]:
                final_prediction = "IMAGE ANALYSIS FAILED"
            elif image_result["prediction"] == "FAKE":
                final_prediction = "FAKE IMAGE - Deepfake detected"
            elif image_result["prediction"] == "REAL":
                final_prediction = "REAL IMAGE - Authentic"
            else:
                final_prediction = image_result["prediction"]
            
            return CombinedDetectionResponse(
                success=image_result["success"],
                media_type="image",
                image_result=ImageDetectionResponse(
                    success=image_result["success"],
                    prediction=image_result["prediction"],
                    confidence=float(image_result["confidence"]),
                    details=image_result["details"],
                    processing_time=float(image_result["processing_time"])
                ),
                audio_result=None,
                video_result=None,
                final_prediction=final_prediction,
                processing_time=float(image_result["processing_time"])
            )

        elif file_ext in video_extensions:
            # ---------------- VIDEO ----------------
            logger.info(f"📹 Processing video: {file.filename}")

            # Try extracting audio from video
            audio_result = None
            try:
                video = VideoFileClip(temp_path)
                if video.audio is not None:
                    audio_path = os.path.join(temp_dir, "audio.wav")
                    video.audio.write_audiofile(audio_path, logger=None)
                    logger.info("✅ Audio extracted from video")
                video.close()
            except Exception as e:
                logger.warning(f"Could not extract audio: {str(e)}")
                audio_path = None

            # Run video detection
            logger.info("🎥 Analyzing video...")
            video_result = await fast_robust_video_prediction(temp_path)

            # Run audio detection if audio exists
            if audio_path and os.path.exists(audio_path):
                logger.info("🔊 Analyzing audio...")
                audio_result = await detect_deepfake_audio(audio_path)

            # Determine final prediction
            if not video_result["success"]:
                final_prediction = "VIDEO ANALYSIS FAILED"
            elif video_result["prediction"] == "NO FACE DETECTED":
                final_prediction = "NO FACE DETECTED - Cannot analyze"
            elif video_result["prediction"] == "INSUFFICIENT FACES":
                final_prediction = "INSUFFICIENT FACES - Need more face samples"
            elif video_result["prediction"] == "FAKE":
                final_prediction = "FAKE VIDEO"
            elif video_result["prediction"] == "REAL":
                if audio_result and audio_result["success"]:
                    if audio_result["prediction"] == "FAKE AUDIO":
                        final_prediction = "FAKE AUDIO (Video is REAL)"
                    else:
                        final_prediction = "REAL (Both audio and video)"
                else:
                    final_prediction = "REAL VIDEO"
            else:
                final_prediction = video_result["prediction"]

            # Total processing time
            total_time = float(video_result["processing_time"])
            if audio_result:
                total_time += float(audio_result["processing_time"])

            return CombinedDetectionResponse(
                success=True,
                media_type="video",
                video_result=VideoDetectionResponse(
                    success=video_result["success"],
                    prediction=video_result["prediction"],
                    confidence=float(video_result["confidence"]),
                    details=video_result["details"]
                ),
                audio_result=AudioDetectionResponse(
                    success=audio_result["success"] if audio_result else False,
                    prediction=audio_result["prediction"] if audio_result else "NO AUDIO",
                    real_confidence=float(audio_result["real_confidence"]) if audio_result else 0.0,
                    fake_confidence=float(audio_result["fake_confidence"]) if audio_result else 0.0,
                    processing_time=float(audio_result["processing_time"]) if audio_result else 0.0
                ) if audio_result else None,
                image_result=None,
                final_prediction=final_prediction,
                processing_time=float(total_time)
            )

        elif file_ext in audio_extensions:
            # ---------------- AUDIO ----------------
            logger.info(f"🔊 Processing audio: {file.filename}")
            
            # Convert WebM to WAV if needed
            if file_ext == '.webm':
                converted_path = os.path.join(temp_dir, "converted_audio.wav")
                
                # Try conversion
                conversion_success = convert_webm_to_wav(temp_path, converted_path)
                
                if conversion_success:
                    audio_result = await detect_deepfake_audio(converted_path)
                else:
                    # If conversion fails, return error
                    logger.error("All conversion methods failed")
                    return CombinedDetectionResponse(
                        success=False,
                        media_type="audio",
                        audio_result=AudioDetectionResponse(
                            success=False,
                            prediction="CONVERSION FAILED",
                            real_confidence=0.0,
                            fake_confidence=0.0,
                            processing_time=0.0
                        ),
                        video_result=None,
                        image_result=None,
                        final_prediction="AUDIO CONVERSION FAILED - Please install FFmpeg",
                        processing_time=0.0
                    )
            else:
                # Process other audio formats directly
                audio_result = await detect_deepfake_audio(temp_path)
                
            return CombinedDetectionResponse(
                success=audio_result["success"],
                media_type="audio",
                audio_result=AudioDetectionResponse(
                    success=audio_result["success"],
                    prediction=audio_result["prediction"],
                    real_confidence=float(audio_result["real_confidence"]),
                    fake_confidence=float(audio_result["fake_confidence"]),
                    processing_time=float(audio_result["processing_time"])
                ),
                video_result=None,
                image_result=None,
                final_prediction=audio_result["prediction"],
                processing_time=float(audio_result["processing_time"])
            )

        else:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {file_ext}. Supported types: Images: PNG, JPG, JPEG, GIF, BMP, WEBP | Videos: MP4, AVI, MOV, MKV, FLV, WMV, M4V | Audio: MP3, WAV, FLAC, M4A, AAC, OGG, WebM")

    except Exception as e:
        logger.error(f"❌ Error processing file: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
            if audio_path and os.path.exists(audio_path):
                os.remove(audio_path)
            if converted_path and os.path.exists(converted_path):
                os.remove(converted_path)
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Cleanup error: {str(e)}")

@app.post("/analyze-image", response_model=ImageDetectionResponse, tags=["Analysis"])
async def analyze_image(file: UploadFile = File(...)):
    """Analyze an image file for deepfake detection"""
    temp_dir = tempfile.mkdtemp()
    temp_path = None
    
    try:
        # Save uploaded file
        file_ext = Path(file.filename).suffix.lower()
        temp_path = os.path.join(temp_dir, f"input{file_ext}")
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"Processing image: {file.filename}")
        
        # Run image detection
        result = await detect_deepfake_image(temp_path)
        
        return ImageDetectionResponse(
            success=result["success"],
            prediction=result["prediction"],
            confidence=float(result["confidence"]),
            details=result["details"],
            processing_time=float(result["processing_time"])
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Cleanup error: {str(e)}")

@app.post("/analyze-audio", response_model=AudioDetectionResponse, tags=["Analysis"])
async def analyze_audio(file: UploadFile = File(...)):
    """Analyze an audio file for deepfake detection"""
    temp_dir = tempfile.mkdtemp()
    temp_path = None
    converted_path = None
    
    try:
        # Save uploaded file
        file_ext = Path(file.filename).suffix.lower()
        temp_path = os.path.join(temp_dir, f"input{file_ext}")
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"Processing audio: {file.filename}")
        
        # Convert WebM to WAV if needed
        if file_ext == '.webm':
            converted_path = os.path.join(temp_dir, "converted_audio.wav")
            
            # Try conversion
            conversion_success = convert_webm_to_wav(temp_path, converted_path)
            
            if conversion_success:
                result = await detect_deepfake_audio(converted_path)
            else:
                # If conversion fails, return error
                logger.error("All conversion methods failed")
                return AudioDetectionResponse(
                    success=False,
                    prediction="CONVERSION FAILED",
                    real_confidence=0.0,
                    fake_confidence=0.0,
                    processing_time=0.0
                )
        else:
            # Process other audio formats directly
            result = await detect_deepfake_audio(temp_path)
        
        return AudioDetectionResponse(
            success=result["success"],
            prediction=result["prediction"],
            real_confidence=float(result["real_confidence"]),
            fake_confidence=float(result["fake_confidence"]),
            processing_time=float(result["processing_time"])
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing audio: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
            if converted_path and os.path.exists(converted_path):
                os.remove(converted_path)
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Cleanup error: {str(e)}")

@app.post("/analyze-video", response_model=VideoDetectionResponse, tags=["Analysis"])
async def analyze_video(file: UploadFile = File(...)):
    """Analyze a video file for deepfake detection"""
    temp_dir = tempfile.mkdtemp()
    temp_path = None
    
    try:
        # Save uploaded file
        file_ext = Path(file.filename).suffix.lower()
        temp_path = os.path.join(temp_dir, f"input{file_ext}")
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        logger.info(f"Processing video: {file.filename}")
        
        # Run video detection
        result = await fast_robust_video_prediction(temp_path)
        
        return VideoDetectionResponse(
            success=result["success"],
            prediction=result["prediction"],
            confidence=float(result["confidence"]),
            details=result["details"]
        )
        
    except Exception as e:
        logger.error(f"❌ Error processing video: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        # Cleanup temp files
        try:
            if temp_path and os.path.exists(temp_path):
                os.remove(temp_path)
            if os.path.exists(temp_dir):
                shutil.rmtree(temp_dir)
        except Exception as e:
            logger.warning(f"Cleanup error: {str(e)}")

