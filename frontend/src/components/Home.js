import React, { useState, useEffect, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import "./Home.css";

const socket = io("http://localhost:5000");

const Home = ({ user, setUser }) => {
  const [selectedChat, setSelectedChat] = useState(null);
  const [messages, setMessages] = useState([]);
  const [messagesByChat, setMessagesByChat] = useState({});
  const [input, setInput] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedAudioFile, setSelectedAudioFile] = useState(null);
  const [selectedVideoFile, setSelectedVideoFile] = useState(null);
  const [allUsers, setAllUsers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState("connected");
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedAnalysis, setSelectedAnalysis] = useState(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showAttachMenu, setShowAttachMenu] = useState(false);
  const [showProfileView, setShowProfileView] = useState(false);
  const [showMediaView, setShowMediaView] = useState(null);
  const [chatSettings, setChatSettings] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const [audioUrl, setAudioUrl] = useState(null);
  const [recordingPermission, setRecordingPermission] = useState(false);
  const [audioDevices, setAudioDevices] = useState([]);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showDeviceMenu, setShowDeviceMenu] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  
  // Mobile responsive states
  const [isMobileView, setIsMobileView] = useState(window.innerWidth <= 768);
  const [showSidebar, setShowSidebar] = useState(true);
  const [showChat, setShowChat] = useState(false);
  
  // Call related states
  const [incomingCall, setIncomingCall] = useState(null);
  const [outgoingCall, setOutgoingCall] = useState(null);
  const [activeCall, setActiveCall] = useState(null);
  const [isCallActive, setIsCallActive] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isVideoOff, setIsVideoOff] = useState(false);
  const [callDuration, setCallDuration] = useState(0);
  const [showCallWindow, setShowCallWindow] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remoteStream, setRemoteStream] = useState(null);
  const [peerConnection, setPeerConnection] = useState(null);
  const [callType, setCallType] = useState(null);
  const [isCallConnecting, setIsCallConnecting] = useState(false);
  const [isRinging, setIsRinging] = useState(false);
  const [remoteVideoReceived, setRemoteVideoReceived] = useState(false);
  const [isEndingCall, setIsEndingCall] = useState(false);
  
  // Message selection and deletion
  const [selectedMessages, setSelectedMessages] = useState([]);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  
  // Track processed message IDs to prevent duplicates
  const [processedMessageIds, setProcessedMessageIds] = useState(new Set());
  
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);
  const audioFileInputRef = useRef(null);
  const videoFileInputRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const attachMenuRef = useRef(null);
  const recordingTimerRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);
  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localAudioRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const callDurationTimerRef = useRef(null);
  const ringingTimerRef = useRef(null);
  
  // Track pending analyses
  const [pendingAnalyses, setPendingAnalyses] = useState({});

  const configuration = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun2.l.google.com:19302' },
      { urls: 'stun:stun3.l.google.com:19302' },
      { urls: 'stun:stun4.l.google.com:19302' },
    ],
    iceCandidatePoolSize: 10
  };

  // ================= MOBILE RESPONSIVE HANDLER =================
  useEffect(() => {
    const handleResize = () => {
      setIsMobileView(window.innerWidth <= 768);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle mobile back button
  useEffect(() => {
    if (isMobileView && showChat) {
      setShowSidebar(false);
    } else if (isMobileView && !showChat) {
      setShowSidebar(true);
    }
  }, [isMobileView, showChat]);

  // ================= HELPER FUNCTIONS =================
  const formatMessageTime = useCallback((date) => {
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)} min`;
    if (diff < 86400000) return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    if (diff < 604800000) return date.toLocaleDateString([], { weekday: 'short' });
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }, []);

  const formatChatTime = useCallback((timestamp) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 86400000) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diff < 604800000) {
      return date.toLocaleDateString([], { weekday: 'short' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }, []);

  const formatRecordingTime = useCallback((seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }, []);

  const showToast = useCallback((message, type = 'info') => {
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  }, []);

  // ================= SORT CHATS BY LAST MESSAGE TIME =================
  const sortChatsByLastMessage = useCallback((users) => {
    return [...users].sort((a, b) => {
      if (!a.lastMessageTime && !b.lastMessageTime) return 0;
      if (!a.lastMessageTime) return 1;
      if (!b.lastMessageTime) return -1;
      return new Date(b.lastMessageTime) - new Date(a.lastMessageTime);
    });
  }, []);

  // ================= REFRESH CONTACT LIST =================
  const refreshContactList = async () => {
    setRefreshing(true);
    try {
      const res = await fetch(
        `http://localhost:5000/api/users/all/${user.id}`
      );
      const data = await res.json();
      
      if (data.success) {
        const usersWithPreview = await Promise.all(
          data.users.map(async (u) => {
            try {
              const lastMsgRes = await fetch(
                `http://localhost:5000/api/messages/last/${user.id}/${u.id}`
              );
              const lastMsgData = await lastMsgRes.json();
              
              // Only get unread count for this specific chat
              const unreadCount = messagesByChat[u.id]?.filter(
                msg => msg.sender === 'other' && !msg.read
              ).length || 0;
              
              return { 
                ...u, 
                lastMessage: lastMsgData.lastMessage || "Click to start chatting",
                lastMessageTime: lastMsgData.timestamp,
                unreadCount: unreadCount
              };
            } catch (err) {
              return { 
                ...u, 
                lastMessage: "Click to start chatting",
                lastMessageTime: null,
                unreadCount: 0
              };
            }
          })
        );
        
        const sortedUsers = sortChatsByLastMessage(usersWithPreview);
        setAllUsers(sortedUsers);
        showToast('Contact list refreshed', 'success');
      }
    } catch (err) {
      console.error("Error refreshing users:", err);
      showToast('Failed to refresh contacts', 'warning');
    } finally {
      setRefreshing(false);
    }
  };

  // ================= UPDATE CHAT ORDER =================
  const updateChatOrder = useCallback((chatId, lastMessage, lastMessageTime) => {
    setAllUsers(prev => {
      const updatedUsers = prev.map(u => {
        if (u.id === chatId) {
          return { 
            ...u, 
            lastMessage: lastMessage,
            lastMessageTime: lastMessageTime,
            unreadCount: u.unreadCount || 0
          };
        }
        return u;
      });
      return sortChatsByLastMessage(updatedUsers);
    });
  }, [sortChatsByLastMessage]);

  // ================= INCREMENT UNREAD COUNT =================
  const incrementUnreadCount = useCallback((senderId) => {
    // Only increment if the sender is not the currently selected chat
    if (selectedChat?.id !== senderId) {
      setAllUsers(prev => {
        const updatedUsers = prev.map(u => {
          if (u.id === senderId) {
            return { 
              ...u, 
              unreadCount: (u.unreadCount || 0) + 1 
            };
          }
          return u;
        });
        return updatedUsers;
      });
    }
  }, [selectedChat]);

  // ================= RESET UNREAD COUNT =================
  const resetUnreadCount = useCallback((chatId) => {
    setAllUsers(prev => 
      prev.map(u => 
        u.id === chatId ? { ...u, unreadCount: 0 } : u
      )
    );
    
    setMessagesByChat(prev => {
      const updatedChat = { ...prev };
      if (updatedChat[chatId]) {
        updatedChat[chatId] = updatedChat[chatId].map(msg => ({
          ...msg,
          read: true
        }));
      }
      return updatedChat;
    });
    
    if (selectedChat?.id === chatId) {
      setMessages(prev => prev.map(msg => ({ ...msg, read: true })));
    }
  }, [selectedChat]);

  // ================= MESSAGE SELECTION FUNCTIONS =================
  const toggleMessageSelection = (messageId) => {
    setSelectedMessages(prev => {
      if (prev.includes(messageId)) {
        return prev.filter(id => id !== messageId);
      } else {
        return [...prev, messageId];
      }
    });
  };

  const enterSelectionMode = () => {
    setIsSelectionMode(true);
    setSelectedMessages([]);
  };

  const exitSelectionMode = () => {
    setIsSelectionMode(false);
    setSelectedMessages([]);
  };

  const selectAllMessages = () => {
    const allMessageIds = messages.map(msg => msg.id);
    setSelectedMessages(allMessageIds);
  };

  const clearSelection = () => {
    setSelectedMessages([]);
  };

  // ================= DELETE FOR ME ONLY =================
  const deleteSelectedMessages = async () => {
    if (selectedMessages.length === 0) return;

    setDeleteLoading(true);
    
    try {
      const response = await fetch('http://localhost:5000/api/messages/delete-for-me', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: user.id,
          messageIds: selectedMessages,
          chatId: selectedChat?.id
        }),
      });

      const data = await response.json();

      if (data.success) {
        setMessages(prev => prev.filter(msg => !selectedMessages.includes(msg.id)));
        
        setMessagesByChat(prev => ({
          ...prev,
          [selectedChat.id]: prev[selectedChat.id].filter(
            msg => !selectedMessages.includes(msg.id)
          )
        }));

        if (messages.length === selectedMessages.length) {
          updateChatOrder(selectedChat.id, "No messages yet", null);
        } else {
          const remainingMessages = messages.filter(msg => !selectedMessages.includes(msg.id));
          const lastMsg = remainingMessages[remainingMessages.length - 1];
          if (lastMsg) {
            updateChatOrder(
              selectedChat.id, 
              lastMsg.text || (lastMsg.fileName ? '📎 Media' : ''),
              new Date().toISOString()
            );
          }
        }

        showToast(`Deleted ${selectedMessages.length} message(s) from your chat`, 'success');
        exitSelectionMode();
      } else {
        showToast('Failed to delete messages', 'warning');
      }
    } catch (error) {
      console.error('Error deleting messages:', error);
      showToast('Error deleting messages', 'warning');
    } finally {
      setDeleteLoading(false);
      setShowDeleteConfirm(false);
    }
  };

  // ================= SWITCH CHAT FUNCTION =================
  const switchChat = (user) => {
    console.log(`🔄 Switching from chat ${selectedChat?.id} to ${user.id}`);
    
    setSelectedChat(user);
    
    // Load messages only for this specific chat from messagesByChat
    if (messagesByChat[user.id]) {
      console.log(`📋 Loading ${messagesByChat[user.id].length} messages for chat ${user.id}`);
      setMessages(messagesByChat[user.id]);
    } else {
      console.log(`📋 Fetching messages for chat ${user.id}`);
      fetchMessages(user.id);
    }
    
    resetUnreadCount(user.id);
    createNewChat(user.id);
    
    if (isMobileView) {
      setShowChat(true);
    }
  };

  // ================= CLEAN UP CALL RESOURCES =================
  const cleanupCallResources = useCallback(() => {
    if (peerConnection) {
      peerConnection.onicecandidate = null;
      peerConnection.ontrack = null;
      peerConnection.oniceconnectionstatechange = null;
      peerConnection.onconnectionstatechange = null;
      peerConnection.close();
      setPeerConnection(null);
    }
    
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      setLocalStream(null);
    }
    
    if (remoteStream) {
      remoteStream.getTracks().forEach(track => {
        track.stop();
        track.enabled = false;
      });
      setRemoteStream(null);
    }

    if (localVideoRef.current) {
      localVideoRef.current.srcObject = null;
    }
    if (remoteVideoRef.current) {
      remoteVideoRef.current.srcObject = null;
    }
    if (localAudioRef.current) {
      localAudioRef.current.srcObject = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.srcObject = null;
    }

    if (callDurationTimerRef.current) {
      clearInterval(callDurationTimerRef.current);
      callDurationTimerRef.current = null;
    }

    if (ringingTimerRef.current) {
      clearTimeout(ringingTimerRef.current);
      ringingTimerRef.current = null;
    }

    setRemoteVideoReceived(false);
  }, [peerConnection, localStream, remoteStream]);

  // ================= END CALL =================
  const endCall = useCallback((fromOther = false) => {
    console.log("📞 Ending call...", fromOther ? "from other" : "from self");
    
    if (isEndingCall) return;
    setIsEndingCall(true);
    
    cleanupCallResources();

    if (!fromOther) {
      let targetId = null;
      if (activeCall?.with) {
        targetId = activeCall.with;
      } else if (outgoingCall?.to) {
        targetId = outgoingCall.to;
      } else if (incomingCall?.from) {
        targetId = incomingCall.from;
      }
      
      if (targetId) {
        console.log("📞 Sending endCall to:", targetId);
        socket.emit("endCall", { targetId });
      }
    }

    setIsCallActive(false);
    setActiveCall(null);
    setOutgoingCall(null);
    setIncomingCall(null);
    setShowCallWindow(false);
    setCallDuration(0);
    setIsMuted(false);
    setIsVideoOff(false);
    setIsCallConnecting(false);
    setIsRinging(false);

    showToast(fromOther ? "Call ended by other user" : "Call ended", "info");
    
    setTimeout(() => {
      setIsEndingCall(false);
    }, 1000);
  }, [cleanupCallResources, activeCall, outgoingCall, incomingCall, isEndingCall]);

  // ================= START CALL TIMER =================
  const startCallTimer = useCallback(() => {
    if (callDurationTimerRef.current) {
      clearInterval(callDurationTimerRef.current);
    }
    setCallDuration(0);
    callDurationTimerRef.current = setInterval(() => {
      setCallDuration(prev => prev + 1);
    }, 1000);
  }, []);

  // ================= START CALL =================
  const startCall = async (type) => {
    if (!selectedChat) {
      showToast("Please select a contact to call", "warning");
      return;
    }

    if (!selectedChat.is_online) {
      showToast(`${selectedChat.username} is offline`, "warning");
      return;
    }

    try {
      setIsCallConnecting(true);
      setCallType(type);
      setIsRinging(true);
      setRemoteVideoReceived(false);
      setIsEndingCall(false);
      
      ringingTimerRef.current = setTimeout(() => {
        if (!isCallActive && outgoingCall) {
          console.log("📞 Call not answered");
          socket.emit("callMissed", {
            targetId: selectedChat.id,
            fromName: user.username
          });
          endCall();
          showToast("Call not answered", "info");
        }
      }, 30000);

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: type === 'video' ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        } : false
      });

      stream.getTracks().forEach(track => {
        track.enabled = true;
      });

      setLocalStream(stream);
      
      if (localVideoRef.current && type === 'video') {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.log("Local video play error:", e));
      }
      
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(configuration);

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("iceCandidate", {
            targetId: selectedChat.id,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === 'connected') {
          setIsCallConnecting(false);
          setIsCallActive(true);
          setIsRinging(false);
          if (ringingTimerRef.current) {
            clearTimeout(ringingTimerRef.current);
          }
          startCallTimer();
          showToast("Call connected", "success");
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          if (!isEndingCall) {
            endCall();
          }
        }
      };

      pc.ontrack = (event) => {
        console.log(`📞 Remote ${event.track.kind} stream received`);
        
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          setRemoteStream(remoteStream);
          setRemoteVideoReceived(true);
          
          remoteStream.getTracks().forEach(track => {
            track.enabled = true;
          });
          
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(e => console.log("Remote video play error:", e));
          }
          
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => console.log("Remote audio play error:", e));
          }
        }
      };

      setPeerConnection(pc);

      const offer = await pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === 'video'
      });
      await pc.setLocalDescription(offer);

      console.log("📞 Sending offer to", selectedChat.username);
      socket.emit("startCall", {
        targetId: selectedChat.id,
        from: user.id,
        fromName: user.username,
        type: type,
        offer: pc.localDescription
      });

      setOutgoingCall({
        to: selectedChat.id,
        toName: selectedChat.username,
        type: type
      });

      setShowCallWindow(true);
      
      showToast(`Calling ${selectedChat.username}...`, "info");

    } catch (err) {
      console.error("Error starting call:", err);
      showToast("Failed to start call: " + err.message, "error");
      setIsCallConnecting(false);
      setShowCallWindow(false);
      setIsRinging(false);
    }
  };

  // ================= ACCEPT CALL =================
  const acceptCall = async () => {
    if (!incomingCall) return;

    try {
      console.log("📞 Accepting call from", incomingCall.fromName);
      setCallType(incomingCall.type);
      setIsRinging(false);
      setRemoteVideoReceived(false);
      setIsEndingCall(false);
      
      if (ringingTimerRef.current) {
        clearTimeout(ringingTimerRef.current);
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        },
        video: incomingCall.type === 'video' ? {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 30 }
        } : false
      });

      stream.getTracks().forEach(track => {
        track.enabled = true;
      });

      setLocalStream(stream);
      
      if (localVideoRef.current && incomingCall.type === 'video') {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.play().catch(e => console.log("Local video play error:", e));
      }
      
      if (localAudioRef.current) {
        localAudioRef.current.srcObject = stream;
      }

      const pc = new RTCPeerConnection(configuration);

      stream.getTracks().forEach(track => {
        pc.addTrack(track, stream);
      });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("iceCandidate", {
            targetId: incomingCall.from,
            candidate: event.candidate
          });
        }
      };

      pc.onconnectionstatechange = () => {
        console.log("Connection state:", pc.connectionState);
        if (pc.connectionState === 'connected') {
          setIsCallActive(true);
          startCallTimer();
          showToast("Call connected", "success");
        } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
          if (!isEndingCall) {
            endCall();
          }
        }
      };

      pc.ontrack = (event) => {
        console.log(`📞 Remote ${event.track.kind} stream received`);
        
        if (event.streams && event.streams[0]) {
          const remoteStream = event.streams[0];
          setRemoteStream(remoteStream);
          setRemoteVideoReceived(true);
          
          remoteStream.getTracks().forEach(track => {
            track.enabled = true;
          });
          
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = remoteStream;
            remoteVideoRef.current.play().catch(e => console.log("Remote video play error:", e));
          }
          
          if (remoteAudioRef.current) {
            remoteAudioRef.current.srcObject = remoteStream;
            remoteAudioRef.current.play().catch(e => console.log("Remote audio play error:", e));
          }
        }
      };

      setPeerConnection(pc);

      await pc.setRemoteDescription(new RTCSessionDescription(incomingCall.offer));
      console.log("✅ Remote description set");

      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      console.log("✅ Local description set");

      socket.emit("acceptCall", {
        targetId: incomingCall.from,
        answer: pc.localDescription
      });

      setActiveCall({
        with: incomingCall.from,
        withName: incomingCall.fromName,
        type: incomingCall.type
      });
      setIncomingCall(null);
      setShowCallWindow(true);

    } catch (err) {
      console.error("Error accepting call:", err);
      showToast("Failed to accept call: " + err.message, "error");
    }
  };

  const rejectCall = () => {
    if (incomingCall) {
      socket.emit("rejectCall", {
        targetId: incomingCall.from,
        fromName: user.username
      });
      setIncomingCall(null);
      showToast("Call rejected", "info");
    }
  };

  const toggleMute = () => {
    if (localStream) {
      const audioTrack = localStream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMuted(!audioTrack.enabled);
        showToast(audioTrack.enabled ? "Unmuted" : "Muted", "info");
      }
    }
  };

  const toggleVideo = () => {
    if (localStream && callType === 'video') {
      const videoTrack = localStream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsVideoOff(!videoTrack.enabled);
        showToast(videoTrack.enabled ? "Video on" : "Video off", "info");
      }
    }
  };

  const formatCallDuration = (seconds) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // ================= SOCKET CONNECTION WITH PROPER MESSAGE ISOLATION =================
  useEffect(() => {
    if (!user) return;

    console.log("🔌 Connecting socket for user:", user.id);
    socket.emit("join", user.id);

    socket.on("connect", () => {
      console.log("✅ Socket connected");
      setConnectionStatus("connected");
    });
    
    socket.on("disconnect", () => {
      console.log("❌ Socket disconnected");
      setConnectionStatus("disconnected");
      if (isCallActive && !isEndingCall) {
        endCall();
      }
    });
    
    socket.on("reconnect", () => {
      console.log("🔄 Socket reconnected");
      setConnectionStatus("connected");
      socket.emit("join", user.id);
    });

    // FIXED: receiveMessage handler with proper chat isolation
    socket.on("receiveMessage", (data) => {
      console.log("📩 Message received:", data);
      
      // CRITICAL: Only process if this message is for current user
      if (data.receiverId !== user.id) {
        console.log("⚠️ Message not for this user, ignoring");
        return;
      }
      
      // Check for duplicates
      if (processedMessageIds.has(data.id)) {
        console.log("⚠️ Duplicate message detected, skipping:", data.id);
        return;
      }
      
      setProcessedMessageIds(prev => new Set(prev).add(data.id));
      
      // The chat partner is the sender
      const senderId = data.senderId;
      const isSelectedChat = selectedChat?.id === senderId;
      
      const newMsg = {
        id: data.id || Date.now(),
        text: data.message || '',
        sender: "other",
        chatId: senderId, // Track which chat this belongs to
        fileUrl: data.fileUrl,
        fileType: data.fileType,
        fileName: data.fileName,
        analysis: data.analysis,
        time: formatMessageTime(new Date()),
        status: 'delivered',
        read: isSelectedChat,
        isNew: true
      };

      console.log(`📨 New message for chat ${senderId}, current chat: ${selectedChat?.id}`);

      // Store in messagesByChat - ONLY for this specific sender
      setMessagesByChat((prev) => {
        const chatMessages = prev[senderId] || [];
        return { 
          ...prev, 
          [senderId]: [...chatMessages, newMsg] 
        };
      });

      // If this is the currently selected chat, also add to current messages
      if (isSelectedChat) {
        console.log(`📨 Adding to current messages for chat ${selectedChat.id}`);
        setMessages((prev) => [...prev, newMsg]);
      } else {
        // Only increment unread count if not viewing this chat
        console.log(`📨 Incrementing unread count for chat ${senderId}`);
        incrementUnreadCount(senderId);
      }

      // Update last message in chat list for THIS chat only
      const lastMessageText = data.message || (data.fileName ? '📎 Media' : '');
      updateChatOrder(senderId, lastMessageText, new Date().toISOString());
    });

    // FIXED: messageSent handler
    socket.on("messageSent", (data) => {
      console.log("✅ Message sent confirmed with ID:", data.id, "tempId:", data.tempId);
      
      // Update messages in current chat
      setMessages(prev => prev.map(msg => {
        if (msg.id === data.tempId) {
          return { ...msg, id: data.id, status: 'sent' };
        }
        return msg;
      }));

      // Update messagesByChat for this specific chat
      setMessagesByChat(prev => {
        const updatedChat = { ...prev };
        if (selectedChat?.id) {
          updatedChat[selectedChat.id] = updatedChat[selectedChat.id]?.map(msg => {
            if (msg.id === data.tempId) {
              return { ...msg, id: data.id, status: 'sent' };
            }
            return msg;
          }) || [];
        }
        return updatedChat;
      });

      setProcessedMessageIds(prev => new Set(prev).add(data.id));
      
      if (selectedChat) {
        updateChatOrder(
          selectedChat.id, 
          data.message || (data.fileName ? '📎 Media' : ''),
          new Date().toISOString()
        );
      }
    });

    socket.on("userTyping", ({ userId, isTyping }) => {
      if (selectedChat?.id === userId) {
        setIsTyping(isTyping);
      }
    });

    socket.on("userOnline", ({ userId, isOnline }) => {
      console.log(`👤 User ${userId} is ${isOnline ? 'online' : 'offline'}`);
      setAllUsers(prev =>
        prev.map(u => u.id === userId ? { ...u, is_online: isOnline } : u)
      );
    });

    socket.on("incomingCall", (data) => {
      console.log("📞 Incoming call from:", data.fromName);
      setIsRinging(true);
      
      ringingTimerRef.current = setTimeout(() => {
        if (incomingCall) {
          socket.emit("callMissed", {
            targetId: data.from,
            fromName: user.username
          });
          setIncomingCall(null);
          setIsRinging(false);
          showToast(`Missed call from ${data.fromName}`, "info");
        }
      }, 30000);

      setIncomingCall({
        from: data.from,
        fromName: data.fromName,
        type: data.type,
        offer: data.offer
      });
    });

    socket.on("callAccepted", async (data) => {
      console.log("📞 Call accepted by receiver");
      if (outgoingCall && peerConnection) {
        try {
          await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
          setActiveCall({
            with: outgoingCall.to,
            withName: outgoingCall.toName,
            type: outgoingCall.type
          });
          setOutgoingCall(null);
          setIsRinging(false);
          if (ringingTimerRef.current) {
            clearTimeout(ringingTimerRef.current);
          }
          showToast("Call connected", "success");
        } catch (err) {
          console.error("Error setting remote description:", err);
        }
      }
    });

    socket.on("callRejected", (data) => {
      console.log("📞 Call rejected");
      setOutgoingCall(null);
      setShowCallWindow(false);
      setIsCallConnecting(false);
      setIsRinging(false);
      if (ringingTimerRef.current) {
        clearTimeout(ringingTimerRef.current);
      }
      showToast(`${data.fromName} rejected the call`, "info");
      cleanupCallResources();
    });

    socket.on("callEnded", () => {
      console.log("📞 Call ended by other party");
      if (showCallWindow && !isEndingCall) {
        endCall(true);
      }
    });

    socket.on("iceCandidate", async (data) => {
      console.log("📞 ICE candidate received");
      if (peerConnection) {
        try {
          await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        } catch (e) {
          console.error("Error adding ICE candidate:", e);
        }
      }
    });

    socket.on("callMissed", (data) => {
      console.log("📞 Call missed");
      if (outgoingCall) {
        setOutgoingCall(null);
        setShowCallWindow(false);
        setIsCallConnecting(false);
        setIsRinging(false);
        if (ringingTimerRef.current) {
          clearTimeout(ringingTimerRef.current);
        }
        showToast(`${data.fromName} didn't answer`, "info");
        cleanupCallResources();
      }
    });

    socket.on("callFailed", (data) => {
      console.log("📞 Call failed:", data.reason);
      showToast(`Call failed: ${data.reason}`, "warning");
      setOutgoingCall(null);
      setIsCallConnecting(false);
      setShowCallWindow(false);
      setIsRinging(false);
    });

    const handleClickOutside = (event) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target)) {
        setShowAttachMenu(false);
        setShowDeviceMenu(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    
    return () => {
      socket.off("receiveMessage");
      socket.off("userTyping");
      socket.off("userOnline");
      socket.off("messageSent");
      socket.off("connect");
      socket.off("disconnect");
      socket.off("incomingCall");
      socket.off("callAccepted");
      socket.off("callRejected");
      socket.off("callEnded");
      socket.off("iceCandidate");
      socket.off("callMissed");
      socket.off("callFailed");
      document.removeEventListener("mousedown", handleClickOutside);
      if (isCallActive && !isEndingCall) {
        endCall();
      }
      if (ringingTimerRef.current) {
        clearTimeout(ringingTimerRef.current);
      }
    };
  }, [user, selectedChat, formatMessageTime, showToast, endCall, cleanupCallResources, isCallActive, outgoingCall, peerConnection, processedMessageIds, updateChatOrder, incrementUnreadCount, showCallWindow, incomingCall, isEndingCall]);

  /* ================= AUTO SCROLL ================= */
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  /* ================= FETCH ALL USERS ================= */
  useEffect(() => {
    const fetchAllUsers = async () => {
      try {
        setLoading(true);
        const res = await fetch(
          `http://localhost:5000/api/users/all/${user.id}`
        );
        const data = await res.json();
        
        if (data.success) {
          const usersWithPreview = await Promise.all(
            data.users.map(async (u) => {
              try {
                const lastMsgRes = await fetch(
                  `http://localhost:5000/api/messages/last/${user.id}/${u.id}`
                );
                const lastMsgData = await lastMsgRes.json();
                
                // Get unread count from messagesByChat for this specific user
                const chatMessages = messagesByChat[u.id] || [];
                const unreadCount = chatMessages.filter(
                  msg => msg.sender === 'other' && !msg.read
                ).length;
                
                return { 
                  ...u, 
                  lastMessage: lastMsgData.lastMessage || "Click to start chatting",
                  lastMessageTime: lastMsgData.timestamp,
                  unreadCount: unreadCount
                };
              } catch (err) {
                return { 
                  ...u, 
                  lastMessage: "Click to start chatting",
                  lastMessageTime: null,
                  unreadCount: 0
                };
              }
            })
          );
          
          const sortedUsers = sortChatsByLastMessage(usersWithPreview);
          setAllUsers(sortedUsers);
        }
      } catch (err) {
        console.error("Error fetching users:", err);
      } finally {
        setLoading(false);
      }
    };

    if (user?.id) {
      fetchAllUsers();
    }
  }, [user?.id, messagesByChat, sortChatsByLastMessage]);

  /* ================= FETCH CHAT HISTORY ================= */
  const fetchMessages = async (receiverId) => {
    try {
      const res = await fetch(
        `http://localhost:5000/api/messages/${user.id}/${receiverId}`
      );
      const data = await res.json();

      const formatted = data.messages.map((msg) => ({
        id: msg.id,
        text: msg.message,
        sender: msg.sender_id === user.id ? "me" : "other",
        chatId: receiverId, // Track which chat this belongs to
        fileUrl: msg.file_url,
        fileType: msg.file_type,
        fileName: msg.file_name,
        analysis: msg.analysis_result ? JSON.parse(msg.analysis_result) : null,
        time: formatMessageTime(new Date(msg.created_at)),
        status: msg.sender_id === user.id ? 'read' : 'delivered',
        read: true,
        isNew: false
      }));

      console.log(`📚 Fetched ${formatted.length} messages for chat ${receiverId}`);
      
      // Store messages for this specific chat only
      setMessagesByChat((prev) => ({ 
        ...prev, 
        [receiverId]: formatted 
      }));
      
      // If this is the currently selected chat, also set as current messages
      if (selectedChat?.id === receiverId) {
        console.log(`📚 Setting current messages to chat ${receiverId}`);
        setMessages(formatted);
      }
      
      resetUnreadCount(receiverId);
      
    } catch (err) {
      console.error("Error fetching messages:", err);
    }
  };

  /* ================= CREATE NEW CHAT ================= */
  const createNewChat = async (receiverId) => {
    try {
      await fetch('http://localhost:5000/api/chats/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId1: user.id,
          userId2: receiverId
        })
      });
    } catch (err) {
      console.error("Error creating chat:", err);
    }
  };

  /* ================= TYPING HANDLER ================= */
  const handleTyping = (e) => {
    setInput(e.target.value);

    if (!selectedChat) return;

    socket.emit("typing", {
      senderId: user.id,
      receiverId: selectedChat.id,
      isTyping: true,
    });

    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing", {
        senderId: user.id,
        receiverId: selectedChat.id,
        isTyping: false,
      });
    }, 1000);
  };

  // ================= VOICE RECORDING FUNCTIONS =================
const checkMicrophonePermission = async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    setRecordingPermission(true);
    
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    setAudioDevices(audioInputs);
    
    if (audioInputs.length > 0) {
      setSelectedDevice(audioInputs[0].deviceId);
    }
    
    stream.getTracks().forEach(track => track.stop());
    
    return true;
  } catch (err) {
    console.error("Microphone permission denied:", err);
    setRecordingPermission(false);
    showToast("Please allow microphone access to record voice", "warning");
    return false;
  }
};

const startRecording = async () => {
  if (!selectedChat) {
    showToast("Please select a chat first", "info");
    return;
  }

  if (audioUrl) {
    URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl(null);
  }

  try {
    const hasPermission = await checkMicrophonePermission();
    if (!hasPermission) return;

    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        deviceId: selectedDevice ? { exact: selectedDevice } : undefined,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      } 
    });

    mediaRecorderRef.current = new MediaRecorder(stream);
    audioChunksRef.current = [];

    mediaRecorderRef.current.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    mediaRecorderRef.current.onstop = () => {
      const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
      const audioUrl = URL.createObjectURL(audioBlob);
      setAudioBlob(audioBlob);
      setAudioUrl(audioUrl);
      
      stream.getTracks().forEach(track => track.stop());
    };

    mediaRecorderRef.current.start();
    setIsRecording(true);
    setRecordingTime(0);
    
    recordingTimerRef.current = setInterval(() => {
      setRecordingTime(prev => prev + 1);
    }, 1000);

    showToast("Recording started...", "info");

  } catch (err) {
    console.error("Error starting recording:", err);
    showToast("Failed to start recording", "warning");
  }
};

const stopRecording = () => {
  if (mediaRecorderRef.current && isRecording) {
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
    showToast("Recording finished", "success");
  }
};

const cancelRecording = () => {
  if (mediaRecorderRef.current && isRecording) {
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    clearInterval(recordingTimerRef.current);
    setAudioBlob(null);
    setAudioUrl(null);
    setRecordingTime(0);
    showToast("Recording cancelled", "info");
  }
};

/* ================= SEND VOICE MESSAGE ================= */
const sendVoiceMessage = async () => {
  if (!selectedChat || !audioBlob) return;

  const tempId = Date.now();
  const currentTime = new Date();

  const tempMessage = {
    id: tempId,
    text: '',
    sender: "me",
    chatId: selectedChat.id, // Track which chat this belongs to
    fileUrl: audioUrl,
    fileType: 'audio/webm',
    fileName: `voice_message_${formatRecordingTime(recordingTime)}.webm`,
    time: formatMessageTime(currentTime),
    status: 'analyzing',
    analysis: null,
    read: true
  };

  console.log(`🎤 Sending voice message to chat: ${selectedChat.id}`);

  // Only add to current chat
  setMessages((prev) => [...prev, tempMessage]);
  setMessagesByChat((prev) => ({
    ...prev,
    [selectedChat.id]: [...(prev[selectedChat.id] || []), tempMessage]
  }));

  updateChatOrder(selectedChat.id, '🎤 Voice message', currentTime.toISOString());

  setAudioBlob(null);
  setAudioUrl(null);
  setRecordingTime(0);

  try {
    setIsUploading(true);
    const formData = new FormData();
    
    const audioFile = new File([audioBlob], `voice_message_${Date.now()}.webm`, { type: 'audio/webm' });
    formData.append("file", audioFile);
    formData.append("senderId", user.id);
    formData.append("receiverId", selectedChat.id);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 200);

    const res = await fetch("http://localhost:5000/api/analyze-media", {
      method: "POST",
      body: formData,
    });

    clearInterval(progressInterval);
    setUploadProgress(100);

    const data = await res.json();
    console.log("✅ Voice message analysis complete:", data);

    if (data.success) {
      const updatedMessage = {
        ...tempMessage,
        status: 'analyzed',
        fileUrl: data.message.fileUrl,
        analysis: data.analysis,
        id: data.message.id
      };

      // Update only current chat
      setMessages((prev) =>
        prev.map((msg) => (msg.id === tempId ? updatedMessage : msg))
      );

      setMessagesByChat((prev) => ({
        ...prev,
        [selectedChat.id]: prev[selectedChat.id].map((msg) =>
          msg.id === tempId ? updatedMessage : msg
        )
      }));

      if (data.analysis) {
        const isDeepfake = data.analysis.audio_result?.fake_confidence > 50;
        if (isDeepfake) {
          showToast("⚠️ Deepfake detected in voice message!", "warning");
        } else {
          showToast("✅ Voice message is real", "success");
        }
      }
    }

    setTimeout(() => {
      setUploadProgress(0);
      setIsUploading(false);
    }, 500);

  } catch (err) {
    console.error("❌ Voice message upload failed:", err);
    
    setMessages((prev) =>
      prev.map((msg) =>
        msg.id === tempId ? { ...msg, status: 'failed' } : msg
      )
    );
    
    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: prev[selectedChat.id].map((msg) =>
        msg.id === tempId ? { ...msg, status: 'failed' } : msg
      )
    }));
    
    setIsUploading(false);
    setUploadProgress(0);
  }
};

  /* ================= SEND TEXT MESSAGE ================= */
  const sendTextMessage = async () => {
    if (!selectedChat || !input.trim()) return;

    const tempId = Date.now();
    const currentTime = new Date();

    const tempMessage = {
      id: tempId,
      text: input,
      sender: "me",
      chatId: selectedChat.id, // Track which chat this belongs to
      fileUrl: null,
      fileType: null,
      fileName: null,
      time: formatMessageTime(currentTime),
      status: 'sending',
      analysis: null,
      read: true
    };

    console.log(`📤 Sending text message to chat: ${selectedChat.id}`);

    // Only add to current chat
    setMessages((prev) => [...prev, tempMessage]);
    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: [...(prev[selectedChat.id] || []), tempMessage]
    }));

    updateChatOrder(selectedChat.id, input, currentTime.toISOString());

    setInput("");

    try {
      socket.emit("sendMessage", {
        id: tempId,
        senderId: user.id,
        senderName: user.username,
        receiverId: selectedChat.id,
        message: input,
        fileUrl: null,
        fileType: null,
        fileName: null,
        analysis: null
      });
      
    } catch (err) {
      console.error("Send message failed:", err);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      );
    }
  };

  /* ================= SEND PHOTO MESSAGE ================= */
  const sendPhotoMessage = async () => {
    if (!selectedChat || !selectedFile) return;

    const tempId = Date.now();
    const currentTime = new Date();

    const tempMessage = {
      id: tempId,
      text: '',
      sender: "me",
      chatId: selectedChat.id, // Track which chat this belongs to
      fileUrl: URL.createObjectURL(selectedFile),
      fileType: selectedFile.type,
      fileName: selectedFile.name,
      time: formatMessageTime(currentTime),
      status: 'analyzing',
      analysis: null,
      read: true
    };

    console.log(`📷 Sending photo to chat: ${selectedChat.id}`);

    // Only add to current chat
    setMessages((prev) => [...prev, tempMessage]);
    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: [...(prev[selectedChat.id] || []), tempMessage]
    }));

    updateChatOrder(selectedChat.id, '📷 Photo', currentTime.toISOString());

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("senderId", user.id);
      formData.append("receiverId", selectedChat.id);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const res = await fetch("http://localhost:5000/api/analyze-media", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();
      console.log("✅ Photo analysis complete:", data);

      if (data.success) {
        const updatedMessage = {
          ...tempMessage,
          status: 'analyzed',
          fileUrl: data.message.fileUrl,
          analysis: data.analysis,
          id: data.message.id
        };

        // Update only current chat
        setMessages((prev) =>
          prev.map((msg) => (msg.id === tempId ? updatedMessage : msg))
        );

        setMessagesByChat((prev) => ({
          ...prev,
          [selectedChat.id]: prev[selectedChat.id].map((msg) =>
            msg.id === tempId ? updatedMessage : msg
          )
        }));

        if (data.analysis && data.analysis.video_result) {
          const isDeepfake = data.analysis.video_result.prediction === "FAKE";
          if (isDeepfake) {
            showToast("⚠️ Deepfake detected in photo!", "warning");
          } else {
            showToast("✅ Photo is real", "success");
          }
        }
      }

      URL.revokeObjectURL(tempMessage.fileUrl);
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";

      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 500);

    } catch (err) {
      console.error("❌ Photo upload failed:", err);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      );
      
      setMessagesByChat((prev) => ({
        ...prev,
        [selectedChat.id]: prev[selectedChat.id].map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      }));
      
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  /* ================= SEND VIDEO MESSAGE ================= */
  const sendVideoMessage = async () => {
    if (!selectedChat || !selectedVideoFile) return;

    const tempId = Date.now();
    const currentTime = new Date();

    const tempMessage = {
      id: tempId,
      text: '',
      sender: "me",
      chatId: selectedChat.id, // Track which chat this belongs to
      fileUrl: URL.createObjectURL(selectedVideoFile),
      fileType: selectedVideoFile.type,
      fileName: selectedVideoFile.name,
      time: formatMessageTime(currentTime),
      status: 'analyzing',
      analysis: null,
      read: true
    };

    console.log(`🎥 Sending video to chat: ${selectedChat.id}`);

    // Only add to current chat
    setMessages((prev) => [...prev, tempMessage]);
    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: [...(prev[selectedChat.id] || []), tempMessage]
    }));

    updateChatOrder(selectedChat.id, '🎥 Video', currentTime.toISOString());

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", selectedVideoFile);
      formData.append("senderId", user.id);
      formData.append("receiverId", selectedChat.id);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const res = await fetch("http://localhost:5000/api/analyze-media", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();
      console.log("✅ Video analysis complete:", data);

      if (data.success) {
        const updatedMessage = {
          ...tempMessage,
          status: 'analyzed',
          fileUrl: data.message.fileUrl,
          analysis: data.analysis,
          id: data.message.id
        };

        // Update only current chat
        setMessages((prev) =>
          prev.map((msg) => (msg.id === tempId ? updatedMessage : msg))
        );

        setMessagesByChat((prev) => ({
          ...prev,
          [selectedChat.id]: prev[selectedChat.id].map((msg) =>
            msg.id === tempId ? updatedMessage : msg
          )
        }));

        if (data.analysis) {
          if (data.analysis.video_result) {
            const isDeepfakeVideo = data.analysis.video_result.prediction === "FAKE";
            if (isDeepfakeVideo) {
              showToast("⚠️ Deepfake detected in video!", "warning");
            } else {
              showToast("✅ Video is real", "success");
            }
          }
          
          if (data.analysis.audio_result) {
            const isDeepfakeAudio = data.analysis.audio_result.prediction === "FAKE AUDIO";
            if (isDeepfakeAudio) {
              showToast("⚠️ Deepfake audio detected in video!", "warning");
            }
          }
        }
      }

      URL.revokeObjectURL(tempMessage.fileUrl);
      setSelectedVideoFile(null);
      if (videoFileInputRef.current) videoFileInputRef.current.value = "";

      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 500);

    } catch (err) {
      console.error("❌ Video upload failed:", err);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      );
      
      setMessagesByChat((prev) => ({
        ...prev,
        [selectedChat.id]: prev[selectedChat.id].map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      }));
      
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  /* ================= SEND AUDIO FILE MESSAGE ================= */
  const sendAudioFileMessage = async () => {
    if (!selectedChat || !selectedAudioFile) return;

    const tempId = Date.now();
    const currentTime = new Date();

    const tempMessage = {
      id: tempId,
      text: '',
      sender: "me",
      chatId: selectedChat.id, // Track which chat this belongs to
      fileUrl: URL.createObjectURL(selectedAudioFile),
      fileType: selectedAudioFile.type,
      fileName: selectedAudioFile.name,
      time: formatMessageTime(currentTime),
      status: 'analyzing',
      analysis: null,
      read: true
    };

    console.log(`🎵 Sending audio file to chat: ${selectedChat.id}`);

    // Only add to current chat
    setMessages((prev) => [...prev, tempMessage]);
    setMessagesByChat((prev) => ({
      ...prev,
      [selectedChat.id]: [...(prev[selectedChat.id] || []), tempMessage]
    }));

    updateChatOrder(selectedChat.id, '🎵 Audio file', currentTime.toISOString());

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append("file", selectedAudioFile);
      formData.append("senderId", user.id);
      formData.append("receiverId", selectedChat.id);

      const progressInterval = setInterval(() => {
        setUploadProgress((prev) => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const res = await fetch("http://localhost:5000/api/analyze-media", {
        method: "POST",
        body: formData,
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      const data = await res.json();
      console.log("✅ Audio file analysis complete:", data);

      if (data.success) {
        const updatedMessage = {
          ...tempMessage,
          status: 'analyzed',
          fileUrl: data.message.fileUrl,
          analysis: data.analysis,
          id: data.message.id
        };

        // Update only current chat
        setMessages((prev) =>
          prev.map((msg) => (msg.id === tempId ? updatedMessage : msg))
        );

        setMessagesByChat((prev) => ({
          ...prev,
          [selectedChat.id]: prev[selectedChat.id].map((msg) =>
            msg.id === tempId ? updatedMessage : msg
          )
        }));

        if (data.analysis && data.analysis.audio_result) {
          const isDeepfake = data.analysis.audio_result.prediction === "FAKE AUDIO";
          if (isDeepfake) {
            showToast("⚠️ Deepfake detected in audio file!", "warning");
          } else {
            showToast("✅ Audio file is real", "success");
          }
        }
      }

      URL.revokeObjectURL(tempMessage.fileUrl);
      setSelectedAudioFile(null);
      if (audioFileInputRef.current) audioFileInputRef.current.value = "";

      setTimeout(() => {
        setUploadProgress(0);
        setIsUploading(false);
      }, 500);

    } catch (err) {
      console.error("❌ Audio file upload failed:", err);
      
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      );
      
      setMessagesByChat((prev) => ({
        ...prev,
        [selectedChat.id]: prev[selectedChat.id].map((msg) =>
          msg.id === tempId ? { ...msg, status: 'failed' } : msg
        )
      }));
      
      setIsUploading(false);
      setUploadProgress(0);
    }
  };

  /* ================= HANDLE SEND ================= */
  const handleSend = () => {
    if (audioBlob) {
      sendVoiceMessage();
    } else if (selectedFile) {
      sendPhotoMessage();
    } else if (selectedVideoFile) {
      sendVideoMessage();
    } else if (selectedAudioFile) {
      sendAudioFileMessage();
    } else if (input.trim()) {
      sendTextMessage();
    }
  };

  /* ================= HANDLE KEY PRESS ================= */
  const handleKeyPress = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /* ================= HANDLE PHOTO SELECT ================= */
  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setShowAttachMenu(false);
      sendPhotoMessage();
    }
  };

  /* ================= HANDLE VIDEO SELECT ================= */
  const handleVideoSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('video/')) {
      setSelectedVideoFile(file);
      setShowAttachMenu(false);
      sendVideoMessage();
    } else {
      showToast("Please select a valid video file", "warning");
    }
  };

  /* ================= HANDLE AUDIO FILE SELECT ================= */
  const handleAudioFileSelect = (e) => {
    const file = e.target.files[0];
    if (file && file.type.startsWith('audio/')) {
      setSelectedAudioFile(file);
      setShowAttachMenu(false);
      sendAudioFileMessage();
    } else {
      showToast("Please select a valid audio file", "warning");
    }
  };

  /* ================= LOGOUT FUNCTION ================= */
  const handleLogout = async () => {
    try {
      setShowLogoutConfirm(false);
      showToast("Logging out...", "info");
      
      if (isCallActive) endCall();
      
      await fetch("http://localhost:5000/api/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userId: user.id,
        }),
      });

      localStorage.removeItem("user");
      localStorage.removeItem("token");
      localStorage.removeItem("deviceId");
      
      socket.disconnect();
      
      setUser(null);
      
      showToast("Logged out successfully", "success");
    } catch (err) {
      console.error("Logout failed", err);
      showToast("Logout failed", "warning");
    }
  };

  /* ================= RENDER FILE WITH ANALYSIS ================= */
  const renderFileWithAnalysis = (fileUrl, fileType, fileName, analysis, status) => {
    if (!fileUrl) return null;

    const isImage = fileType?.startsWith('image/') || 
                   fileName?.match(/\.(jpeg|jpg|png|gif|webp|bmp)$/i) ||
                   fileUrl.match(/\.(jpeg|jpg|png|gif|webp|bmp)(\?.*)?$/i);
    
    const isVideo = fileType?.startsWith('video/') || 
                   fileName?.match(/\.(mp4|webm|ogg|mov|avi|mkv)$/i) ||
                   fileUrl.match(/\.(mp4|webm|ogg|mov|avi|mkv)(\?.*)?$/i);
    
    const isAudio = fileType?.startsWith('audio/') || 
                   fileName?.match(/\.(mp3|wav|ogg|m4a|aac|webm)$/i) ||
                   fileUrl.match(/\.(mp3|wav|ogg|m4a|aac|webm)(\?.*)?$/i);

    if (status === 'analyzing') {
      return (
        <div className="media-container analyzing">
          <div className="analyzing-overlay">
            <div className="spinner"></div>
            <p>🔬 Analyzing...</p>
          </div>
          {isImage && <img src={fileUrl} alt={fileName} />}
          {isVideo && <video src={fileUrl} controls />}
          {isAudio && <audio src={fileUrl} controls />}
        </div>
      );
    }

    const getAnalysisIcon = () => {
      if (!analysis) return null;

      if (analysis.video_result?.prediction === "FAKE" || 
          analysis.audio_result?.prediction === "FAKE AUDIO" ||
          analysis.final_prediction?.includes("FAKE")) {
        return '⚠️';
      }
      
      return '✅';
    };

    const getAnalysisClass = () => {
      if (!analysis) return '';
      
      if (analysis.video_result?.prediction === "FAKE" || 
          analysis.audio_result?.prediction === "FAKE AUDIO" ||
          analysis.final_prediction?.includes("FAKE")) {
        return 'deepfake';
      }
      
      return 'real';
    };

    const icon = getAnalysisIcon();
    const analysisClass = getAnalysisClass();

    return (
      <div className="media-container">
        {analysis && (
          <div 
            className={`analysis-badge ${analysisClass}`}
            onClick={() => setSelectedAnalysis(analysis)}
            title="Click for details"
          >
            {icon}
          </div>
        )}
        {isImage && <img src={fileUrl} alt={fileName} onClick={() => setShowMediaView(fileUrl)} />}
        {isVideo && <video controls src={fileUrl} />}
        {isAudio && <audio controls src={fileUrl} />}
      </div>
    );
  };

  /* ================= FILTER USERS ================= */
  const filteredUsers = allUsers.filter(u =>
    u.username?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // ================= MOBILE BACK BUTTON =================
  const handleBackToSidebar = () => {
    setShowChat(false);
    setSelectedChat(null);
    setMessages([]);
  };

  /* ================= UI ================= */
  return (
    <div className="home-container">
      
      {/* Connection Status Banner */}
      {connectionStatus !== "connected" && (
        <div className={`connection-banner ${connectionStatus}`}>
          <div className="connection-content">
            <span className="connection-icon">
              {connectionStatus === "disconnected" ? "🔴" : "🟡"}
            </span>
            <span className="connection-text">
              {connectionStatus === "disconnected" 
                ? "Reconnecting..." 
                : "Connection lost. Trying to reconnect..."}
            </span>
          </div>
        </div>
      )}

      {/* Hidden audio elements for calls */}
      <audio ref={localAudioRef} autoPlay muted style={{ display: 'none' }} />
      <audio ref={remoteAudioRef} autoPlay style={{ display: 'none' }} />

      {/* Incoming Call Modal */}
      {incomingCall && (
        <div className="modal-overlay">
          <div className="incoming-call-modal">
            <div className="call-avatar">
              {incomingCall.fromName?.charAt(0).toUpperCase()}
            </div>
            <h3>{incomingCall.fromName}</h3>
            <p className="call-type">
              {incomingCall.type === 'video' ? '📹 Video Call' : '🎤 Audio Call'}
            </p>
            <div className="call-actions">
              <button className="accept-call-btn" onClick={acceptCall}>
                Accept
              </button>
              <button className="reject-call-btn" onClick={rejectCall}>
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Call Window */}
      {showCallWindow && (
        <div className="call-window">
          <div className="call-header">
            <div className="call-info">
              <h3>{activeCall?.withName || outgoingCall?.toName}</h3>
              {isCallActive ? (
                <p>{formatCallDuration(callDuration)}</p>
              ) : (
                <p>{isRinging ? "Ringing..." : "Connecting..."}</p>
              )}
            </div>
            <button className="close-call-btn" onClick={endCall}>✕</button>
          </div>
          
          <div className="call-videos">
            {callType === 'video' && (
              <>
                <video 
                  ref={remoteVideoRef} 
                  className="remote-video" 
                  autoPlay 
                  playsInline
                />
                <video 
                  ref={localVideoRef} 
                  className="local-video" 
                  autoPlay 
                  playsInline 
                  muted
                />
                {!remoteVideoReceived && isCallActive && (
                  <div className="no-video-message">
                    <p>Waiting for other user's video...</p>
                  </div>
                )}
              </>
            )}
            {callType === 'audio' && (
              <div className="audio-call-ui">
                <div className="audio-call-avatar">
                  {activeCall?.withName?.charAt(0).toUpperCase() || outgoingCall?.toName?.charAt(0).toUpperCase()}
                </div>
                <p className="audio-call-label">
                  {isCallActive ? "Audio Call" : (isRinging ? "Ringing..." : "Connecting...")}
                </p>
                {isCallActive && (
                  <div className="sound-wave">
                    <span></span>
                    <span></span>
                    <span></span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="call-controls">
            <button 
              className={`call-control-btn ${isMuted ? 'active' : ''}`}
              onClick={toggleMute}
            >
              {isMuted ? '🔇' : '🎤'}
            </button>
            {callType === 'video' && (
              <button 
                className={`call-control-btn ${isVideoOff ? 'active' : ''}`}
                onClick={toggleVideo}
              >
                {isVideoOff ? '📹❌' : '📹'}
              </button>
            )}
            <button className="call-control-btn end-call" onClick={endCall}>
              📞
            </button>
          </div>
        </div>
      )}

      {/* Delete Messages Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="delete-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Delete Messages</h3>
              <button className="close-btn" onClick={() => setShowDeleteConfirm(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to delete {selectedMessages.length} selected message(s)?</p>
              <p className="warning-text">This will only delete for you. Others can still see them.</p>
            </div>
            <div className="modal-footer">
              <button 
                className="cancel-btn" 
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
              >
                Cancel
              </button>
              <button 
                className="delete-btn" 
                onClick={deleteSelectedMessages}
                disabled={deleteLoading}
              >
                {deleteLoading ? 'Deleting...' : 'Delete for me'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Logout Confirmation Modal */}
      {showLogoutConfirm && (
        <div className="modal-overlay" onClick={() => setShowLogoutConfirm(false)}>
          <div className="logout-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Logout</h3>
              <button className="close-btn" onClick={() => setShowLogoutConfirm(false)}>×</button>
            </div>
            <div className="modal-body">
              <p>Are you sure you want to logout?</p>
            </div>
            <div className="modal-footer">
              <button 
                className="cancel-btn" 
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="logout-confirm-btn" 
                onClick={handleLogout}
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Analysis Modal */}
      {selectedAnalysis && (
        <div className="modal-overlay" onClick={() => setSelectedAnalysis(null)}>
          
          <div className="analysis-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              
              <h3>Deepfake Analysis Results</h3>
              
              <button className="close-btn" onClick={() => setSelectedAnalysis(null)}>×</button>
            </div>
            <div className="disclaimer-banner">
              <span className="disclaimer-icon">⚠️</span>
              <span className="disclaimer-text">
                <strong>Disclaimer:</strong> Results may be inaccurate - for reference only
              </span>
            </div>
            <div className="modal-body">

              {selectedAnalysis.media_type === 'video' && (
                <>
                  {selectedAnalysis.video_result && (
                    <div className="analysis-section">
                      <h4>🎥 Video Analysis</h4>
                      <div className="analysis-grid">
                        <div className="analysis-item">
                          <span>Prediction:</span>
                          <span className={selectedAnalysis.video_result.prediction === "FAKE" ? "fake-text" : "real-text"}>
                            {selectedAnalysis.video_result.prediction === "FAKE" ? '⚠️ FAKE' : '✅ REAL'}
                          </span>
                        </div>
                        <div className="analysis-item">
                          <span>Confidence:</span>
                          <span>{selectedAnalysis.video_result.confidence}%</span>
                        </div>
                      </div>
                      {selectedAnalysis.video_result.details && (
                        <div className="analysis-details">
                          <p>Frames processed: {selectedAnalysis.video_result.details.frames_processed}</p>
                          <p>Faces detected: {selectedAnalysis.video_result.details.faces_detected}</p>
                          {selectedAnalysis.video_result.details.avg_prediction && (
                            <p>Average score: {selectedAnalysis.video_result.details.avg_prediction}</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {selectedAnalysis.audio_result && (
                    <div className="analysis-section">
                      <h4>🔊 Audio Analysis</h4>
                      <div className="analysis-grid">
                        <div className="analysis-item">
                          <span>Prediction:</span>
                          <span className={selectedAnalysis.audio_result.prediction === "FAKE AUDIO" ? "fake-text" : "real-text"}>
                            {selectedAnalysis.audio_result.prediction === "FAKE AUDIO" ? '⚠️ FAKE' : '✅ REAL'}
                          </span>
                        </div>
                        {selectedAnalysis.audio_result.fake_confidence > 0 && (
                          <div className="analysis-item">
                            <span>Fake Confidence:</span>
                            <span className="fake-text">{selectedAnalysis.audio_result.fake_confidence}%</span>
                          </div>
                        )}
                        {selectedAnalysis.audio_result.real_confidence > 0 && (
                          <div className="analysis-item">
                            <span>Real Confidence:</span>
                            <span className="real-text">{selectedAnalysis.audio_result.real_confidence}%</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </>
              )}

              {selectedAnalysis.media_type === 'audio' && selectedAnalysis.audio_result && (
                <div className="analysis-section">
                  <h4>🔊 Audio Analysis</h4>
                  <div className="analysis-grid">
                    <div className="analysis-item">
                      <span>Prediction:</span>
                      <span className={selectedAnalysis.audio_result.prediction === "FAKE AUDIO" ? "fake-text" : "real-text"}>
                        {selectedAnalysis.audio_result.prediction === "FAKE AUDIO" ? '⚠️ FAKE' : '✅ REAL'}
                      </span>
                    </div>
                    <div className="analysis-item">
                      <span>Fake Confidence:</span>
                      <span className="fake-text">{selectedAnalysis.audio_result.fake_confidence}%</span>
                    </div>
                    <div className="analysis-item">
                      <span>Real Confidence:</span>
                      <span className="real-text">{selectedAnalysis.audio_result.real_confidence}%</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="analysis-section final-prediction">
                <h4>📊 Final Verdict</h4>
                <div className={`final-verdict ${selectedAnalysis.final_prediction?.includes("FAKE") ? "fake" : "real"}`}>
                  <h3>
                    {selectedAnalysis.final_prediction?.includes("FAKE") ? '⚠️ ' : '✅ '}
                    {selectedAnalysis.final_prediction || "Unknown"}
                  </h3>
                </div>
                <p className="processing-time">
                  Processing time: {selectedAnalysis.processing_time}s
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Media Viewer Modal */}
      {showMediaView && (
        <div className="modal-overlay" onClick={() => setShowMediaView(null)}>
          <div className="media-viewer" onClick={(e) => e.stopPropagation()}>
            <button className="close-btn" onClick={() => setShowMediaView(null)}>×</button>
            <img src={showMediaView} alt="Media viewer" className="media-full" />
          </div>
        </div>
      )}

      {/* Profile View Modal */}
      {showProfileView && user && (
        <div className="modal-overlay" onClick={() => setShowProfileView(false)}>
          <div className="profile-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h3>Profile</h3>
              <button className="close-btn" onClick={() => setShowProfileView(false)}>×</button>
            </div>
            <div className="profile-content">
              <div className="profile-avatar-large">
                {user.username?.charAt(0).toUpperCase()}
              </div>
              <div className="profile-details">
                <div className="profile-field">
                  <label>Username</label>
                  <span>{user.username}</span>
                </div>
                <div className="profile-field">
                  <label>Email</label>
                  <span>{user.email}</span>
                </div>
              </div>
              <button 
                className="logout-btn-large" 
                onClick={() => setShowLogoutConfirm(true)}
              >
                ⏻ Logout
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Content - Responsive Layout */}
      <div className="main-content">
        <div className={`sidebar ${isMobileView && showChat ? 'hidden' : ''}`}>
          <div className="profile-header">
            <div className="profile-section" onClick={() => setShowProfileView(true)}>
              <div className="profile-avatar">
                {user?.username?.charAt(0).toUpperCase()}
                <span className="online-indicator"></span>
              </div>
              <div className="profile-info">
                <h3>{user?.username}</h3>
                <p className="profile-status">Online</p>
              </div>
            </div>
            <div className="profile-actions">
              <button 
                className="action-btn" 
                title="Refresh Contacts"
                onClick={refreshContactList}
                disabled={refreshing}
              >
                <span className={refreshing ? 'refreshing' : ''}>🔄</span>
              </button>
              <button 
                className="action-btn" 
                title="Logout"
                onClick={() => setShowLogoutConfirm(true)}
              >
                <span>⏻</span>
              </button>
            </div>
          </div>

          <div className="search-section">
            <div className="search-box">
              <span className="search-icon">🔍</span>
              <input
                type="text"
                placeholder="Search or start new chat"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              {searchTerm && (
                <button className="clear-search" onClick={() => setSearchTerm('')}>
                  ✕
                </button>
              )}
            </div>
          </div>

          <div className="contact-list">
            {loading || refreshing ? (
              <div className="loading-state">
                <div className="spinner"></div>
                <p>{refreshing ? 'Refreshing...' : 'Loading chats...'}</p>
              </div>
            ) : filteredUsers.length === 0 ? (
              <div className="empty-state">
                <div className="empty-icon">💬</div>
                <h4>No chats yet</h4>
                <p>Start a conversation by searching for users</p>
              </div>
            ) : (
              filteredUsers.map((u) => (
                <div
                  key={u.id}
                  className={`chat-item ${selectedChat?.id === u.id ? 'active' : ''} ${u.unreadCount > 0 ? 'unread' : ''}`}
                  onClick={() => switchChat(u)}
                >
                  <div className="chat-avatar">
                    {u.username?.charAt(0).toUpperCase()}
                    {u.is_online && <span className="online-dot"></span>}
                  </div>
                  <div className="chat-details">
                    <div className="chat-header">
                      <span className="chat-name">{u.username}</span>
                      {u.lastMessageTime && (
                        <span className="chat-time">{formatChatTime(u.lastMessageTime)}</span>
                      )}
                    </div>
                    <div className="chat-preview">
                      <span className="preview-text">
                        {u.lastMessage || "Click to start chatting"}
                      </span>
                      {u.unreadCount > 0 && (
                        <span className="unread-badge">{u.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className={`chat-section ${isMobileView && !showChat ? 'hidden' : ''}`}>
          {selectedChat ? (
            <>
              <div className="chat-header">
                <div className="chat-header-left">
                  {isMobileView && (
                    <button className="mobile-back-btn" onClick={handleBackToSidebar}>
                      ←
                    </button>
                  )}
                  <div className="chat-avatar">
                    {selectedChat.username?.charAt(0).toUpperCase()}
                    {selectedChat.is_online && <span className="online-indicator"></span>}
                  </div>
                  <div className="chat-info">
                    <h3>{selectedChat.username}</h3>
                    <p className="chat-status">
                      {isTyping ? (
                        <span className="typing-text">typing...</span>
                      ) : (
                        <span className={selectedChat.is_online ? 'online' : 'offline'}>
                          {selectedChat.is_online ? 'online' : 'offline'}
                        </span>
                      )}
                    </p>
                  </div>
                </div>
                <div className="chat-header-actions">
                  {isSelectionMode ? (
                    <>
                      <button 
                        className="action-btn" 
                        title="Select All"
                        onClick={selectAllMessages}
                      >
                        <span>✓✓</span>
                      </button>
                      <button 
                        className="action-btn" 
                        title="Clear Selection"
                        onClick={clearSelection}
                      >
                        <span>✕</span>
                      </button>
                      <button 
                        className="action-btn" 
                        title="Delete Selected"
                        onClick={() => setShowDeleteConfirm(true)}
                        disabled={selectedMessages.length === 0}
                      >
                        <span>🗑️</span>
                      </button>
                      <button 
                        className="action-btn" 
                        title="Cancel Selection"
                        onClick={exitSelectionMode}
                      >
                        <span>↩️</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button 
                        className="action-btn" 
                        title="Select Messages"
                        onClick={enterSelectionMode}
                      >
                        <span>✓</span>
                      </button>
                      <button 
                        className="action-btn" 
                        title="Audio Call"
                        onClick={() => startCall('audio')}
                        disabled={!selectedChat.is_online || isCallActive}
                      >
                        <span>🎤</span>
                      </button>
                      <button 
                        className="action-btn" 
                        title="Video Call"
                        onClick={() => startCall('video')}
                        disabled={!selectedChat.is_online || isCallActive}
                      >
                        <span>📹</span>
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className="chat-messages">
                {messages
                  // Extra safety filter - ensure messages belong to this chat
                  .filter(msg => !msg.chatId || msg.chatId === selectedChat?.id)
                  .map((msg, index) => {
                    const showDate = index === 0 || 
                      new Date(msg.time).toDateString() !== new Date(messages[index - 1]?.time).toDateString();
                    
                    const isSelected = selectedMessages.includes(msg.id);
                    
                    return (
                      <React.Fragment key={msg.id || index}>
                        {showDate && (
                          <div className="date-divider">
                            <span>{new Date(msg.time).toLocaleDateString()}</span>
                          </div>
                        )}
                        <div 
                          className={`message-wrapper ${msg.sender} ${isSelectionMode ? 'selectable' : ''} ${isSelected ? 'selected' : ''}`}
                          onClick={() => {
                            if (isSelectionMode) {
                              toggleMessageSelection(msg.id);
                            }
                          }}
                        >
                          <div className={`message-bubble ${msg.sender} ${isSelected ? 'selected' : ''}`}>
                            {isSelectionMode && (
                              <div className="message-checkbox">
                                {isSelected ? '✓' : '○'}
                              </div>
                            )}
                            {msg.text && <p className="message-text">{msg.text}</p>}
                            
                            {renderFileWithAnalysis(msg.fileUrl, msg.fileType, msg.fileName, msg.analysis, msg.status)}
                            
                            <div className="message-footer">
                              <span className="message-time">{msg.time}</span>
                              {msg.sender === "me" && (
                                <span className="message-status">
                                  {msg.status === 'sending' && '🕐'}
                                  {msg.status === 'analyzing' && '🔬'}
                                  {msg.status === 'analyzed' && '✓✓'}
                                  {msg.status === 'sent' && '✓'}
                                  {msg.status === 'failed' && '⚠️'}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                
                {isTyping && (
                  <div className="typing-indicator-wrapper">
                    <div className="typing-indicator">
                      <span></span>
                      <span></span>
                      <span></span>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              <div className="chat-footer">
                {audioUrl && !isRecording && (
                  <div className="voice-preview">
                    <div className="voice-info">
                      <span className="voice-icon">🎤</span>
                      <span className="voice-duration">{formatRecordingTime(recordingTime)}</span>
                      <audio controls src={audioUrl} className="voice-audio-preview" />
                    </div>
                    <div className="voice-actions">
                      <button 
                        className="cancel-voice"
                        onClick={() => {
                          setAudioBlob(null);
                          setAudioUrl(null);
                          setRecordingTime(0);
                        }}
                      >
                        ✕
                      </button>
                      <button 
                        className="send-voice"
                        onClick={sendVoiceMessage}
                        disabled={isUploading}
                      >
                        ➤
                      </button>
                    </div>
                  </div>
                )}

                {selectedFile && !audioUrl && !selectedVideoFile && !selectedAudioFile && (
                  <div className="file-preview">
                    <div className="file-info">
                      <span className="file-icon">📷</span>
                      <span className="file-name">{selectedFile.name}</span>
                    </div>
                    <button 
                      className="remove-file"
                      onClick={() => {
                        setSelectedFile(null);
                        if (fileInputRef.current) fileInputRef.current.value = "";
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {selectedVideoFile && !audioUrl && !selectedFile && !selectedAudioFile && (
                  <div className="file-preview">
                    <div className="file-info">
                      <span className="file-icon">🎥</span>
                      <span className="file-name">{selectedVideoFile.name}</span>
                    </div>
                    <button 
                      className="remove-file"
                      onClick={() => {
                        setSelectedVideoFile(null);
                        if (videoFileInputRef.current) videoFileInputRef.current.value = "";
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {selectedAudioFile && !audioUrl && !selectedFile && !selectedVideoFile && (
                  <div className="file-preview">
                    <div className="file-info">
                      <span className="file-icon">🎵</span>
                      <span className="file-name">{selectedAudioFile.name}</span>
                      <audio controls src={URL.createObjectURL(selectedAudioFile)} className="file-audio-preview" />
                    </div>
                    <button 
                      className="remove-file"
                      onClick={() => {
                        setSelectedAudioFile(null);
                        if (audioFileInputRef.current) audioFileInputRef.current.value = "";
                      }}
                    >
                      ✕
                    </button>
                  </div>
                )}

                {isRecording && (
                  <div className="recording-indicator">
                    <span className="recording-dot"></span>
                    <span className="recording-time">{formatRecordingTime(recordingTime)}</span>
                    <div className="recording-actions">
                      <button className="cancel-recording" onClick={cancelRecording}>✕</button>
                      <button className="stop-recording" onClick={stopRecording}>⬛</button>
                    </div>
                  </div>
                )}
                
                <div className="chat-input-container">
                  <div className="input-actions">
                    <div className="attach-wrapper" ref={attachMenuRef}>
                      <button 
                        className="action-btn attach-btn"
                        onClick={() => setShowAttachMenu(!showAttachMenu)}
                        disabled={isUploading || isRecording}
                      >
                        <span>➕</span>
                      </button>
                      
                      {showAttachMenu && (
                        <div className="attach-menu">
                          <button className="attach-option" onClick={() => {
                            fileInputRef.current?.click();
                            fileInputRef.current.accept = "image/*";
                            setShowAttachMenu(false);
                          }}>
                            <span className="attach-icon">📷</span>
                            <span className="attach-label">Photo</span>
                          </button>
                          <button className="attach-option" onClick={() => {
                            videoFileInputRef.current?.click();
                            videoFileInputRef.current.accept = "video/*";
                            setShowAttachMenu(false);
                          }}>
                            <span className="attach-icon">🎥</span>
                            <span className="attach-label">Video</span>
                          </button>
                          <button className="attach-option" onClick={() => {
                            audioFileInputRef.current?.click();
                            audioFileInputRef.current.accept = "audio/*";
                            setShowAttachMenu(false);
                          }}>
                            <span className="attach-icon">🎵</span>
                            <span className="attach-label">Audio File</span>
                          </button>
                          <button className="attach-option" onClick={() => {
                            startRecording();
                            setShowAttachMenu(false);
                          }}>
                            <span className="attach-icon">🎤</span>
                            <span className="attach-label">Record Voice</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <input
                    type="file"
                    ref={fileInputRef}
                    style={{ display: "none" }}
                    onChange={handlePhotoSelect}
                    accept="image/*"
                  />

                  <input
                    type="file"
                    ref={videoFileInputRef}
                    style={{ display: "none" }}
                    onChange={handleVideoSelect}
                    accept="video/*"
                  />

                  <input
                    type="file"
                    ref={audioFileInputRef}
                    style={{ display: "none" }}
                    onChange={handleAudioFileSelect}
                    accept="audio/*"
                  />

                  <input
                    type="text"
                    className="message-input"
                    placeholder="Type a message"
                    value={input}
                    onChange={handleTyping}
                    onKeyDown={handleKeyPress}
                    disabled={isUploading || isRecording || audioUrl !== null}
                  />

                  <button 
                    className={`send-btn ${(!input.trim() && !selectedFile && !selectedVideoFile && !selectedAudioFile && !audioBlob) || isUploading ? 'disabled' : ''}`}
                    onClick={handleSend}
                    disabled={(!input.trim() && !selectedFile && !selectedVideoFile && !selectedAudioFile && !audioBlob) || isUploading}
                  >
                    {isUploading ? '⏳' : '➤'}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="welcome-screen">
              <div className="welcome-content">
                <div className="welcome-icon">💬</div>
                <h2>Welcome to Chat</h2>
                <p>Select a chat to start messaging</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Home;