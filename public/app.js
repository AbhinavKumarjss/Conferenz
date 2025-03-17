// DOM elements
const entryContainer = document.getElementById('entry');
const callContainer = document.getElementById('call');

// Entry screen elements
const roomIdInput = document.getElementById('roomId');
const displayNameInput = document.getElementById('displayName');
const createDisplayNameInput = document.getElementById('createDisplayName');
const joinBtn = document.getElementById('joinBtn');
const createBtn = document.getElementById('createBtn');
const tabButtons = document.querySelectorAll('.tab-btn');
const tabContents = document.querySelectorAll('.tab-content');
const roomPasswordCheckbox = document.getElementById('roomPassword');
const passwordInput = document.getElementById('passwordInput');
const roomsList = document.getElementById('roomsList');
const refreshRoomsBtn = document.getElementById('refreshRooms');

// Call screen elements
const localVideo = document.getElementById('localVideo');
const videoGrid = document.getElementById('videoGrid');
const roomDisplay = document.getElementById('roomDisplay');
const participantCount = document.getElementById('participantCount');
const meetingDuration = document.getElementById('meetingDuration');

// Control buttons
const muteBtn = document.getElementById('muteBtn');
const videoBtn = document.getElementById('videoBtn');
const screenShareBtn = document.getElementById('screenShareBtn');
const chatBtn = document.getElementById('chatBtn');
const participantsBtn = document.getElementById('participantsBtn');
const leaveBtn = document.getElementById('leaveBtn');

// Side panels
const chatPanel = document.getElementById('chatPanel');
const participantsPanel = document.getElementById('participantsPanel');
const settingsPanel = document.getElementById('settingsPanel');
const chatMessages = document.getElementById('chatMessages');
const messageInput = document.getElementById('messageInput');
const sendMessageBtn = document.getElementById('sendMessageBtn');
const participantsList = document.getElementById('participantsList');

// Media settings
const audioInputSelect = document.getElementById('audioInput');
const videoInputSelect = document.getElementById('videoInput');
const audioOutputSelect = document.getElementById('audioOutput');
const applySettingsBtn = document.getElementById('applySettings');

// Debug elements
const connectionStatus = document.getElementById('connectionStatus');
const toggleDebugBtn = document.getElementById('toggleDebugBtn');
const debugLog = document.getElementById('debugLog');
const logContent = document.getElementById('logContent');

// Templates
const remoteVideoTemplate = document.getElementById('remoteVideoTemplate');
const chatMessageTemplate = document.getElementById('chatMessageTemplate');
const participantTemplate = document.getElementById('participantTemplate');

// Global variables
let socket;
let localStream;
let screenStream;
let peerConnections = {}; // Map of peer connections by user ID
let roomId;
let isAdmin = false;
let currentUser = {
  id: null,
  displayName: '',
  audioEnabled: true,
  videoEnabled: true,
  shareScreen: false
};
let participants = {}; // Map of participants by user ID
let meetingStartTime;
let durationInterval;
let selectedRoom = null;
let isAudioMuted = false;
let isVideoOff = false;
let isScreenSharing = false;
let activePanelBtn = null;

// Add debug logging function
function log(message) {
  console.log(message);
  const timestamp = new Date().toLocaleTimeString();
  logContent.value += `${timestamp}: ${message}\n`;
  // Auto-scroll to the bottom
  logContent.scrollTop = logContent.scrollHeight;
}

// Configuration for ICE servers (STUN/TURN)
const iceServers = {
  iceServers: [
    // Google's public STUN servers
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
    // Free TURN servers from Twilio (these work better than openrelay in most cases)
    {
      urls: 'turn:global.turn.twilio.com:3478?transport=udp',
      username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
      credential: 'w1WpuwncJVF3+oY8eqKT/3k0FYc='
    },
    {
      urls: 'turn:global.turn.twilio.com:3478?transport=tcp',
      username: 'f4b4035eaa76f4a55de5f4351567653ee4ff6fa97b50b6b334fcc1be9c27212d',
      credential: 'w1WpuwncJVF3+oY8eqKT/3k0FYc='
    },
    {
      urls: 'turn:openrelay.metered.ca:80',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    },
    {
      urls: 'turn:openrelay.metered.ca:443',
      username: 'openrelayproject',
      credential: 'openrelayproject'
    }
  ],
  iceCandidatePoolSize: 10,
  iceTransportPolicy: 'all'
};

// Initialize app
async function init() {
  log('Application initializing...');
  
  toggleDebugBtn.addEventListener('click', () => {
    debugLog.classList.toggle('hidden');
    toggleDebugBtn.textContent = debugLog.classList.contains('hidden') ? 'Show Debug Log' : 'Hide Debug Log';
  });
  
  // Initialize video grid with single participant layout
  videoGrid.classList.add('one-participant');
  
  // Initialize tabbed interface
  setupTabs();
  
  // Check if browser supports required WebRTC APIs
  checkBrowserCompatibility();
  
  // Initialize socket connection
  socket = io();
  log('Socket.io connection initialized');
  
  setupSocketListeners();
  setupButtonListeners();
  
  // Load available media devices
  await loadMediaDevices();
  
  // Request media access during initialization
  await tryGetUserMedia();
  
  // Make UI reflect media status
  updateButtonsState();
  
  // Load available rooms
  refreshRooms();
}

// Set up tabbed interface
function setupTabs() {
  tabButtons.forEach(button => {
    button.addEventListener('click', () => {
      // Hide all tab contents
      tabContents.forEach(content => {
        content.classList.remove('active');
      });
      
      // Deactivate all tab buttons
      tabButtons.forEach(btn => {
        btn.classList.remove('active');
      });
      
      // Activate the clicked tab button
      button.classList.add('active');
      
      // Show the corresponding tab content
      const tabId = button.getAttribute('data-tab');
      document.getElementById(`${tabId}-tab`).classList.add('active');
    });
  });
  
  // Set up password checkbox functionality
  roomPasswordCheckbox.addEventListener('change', function() {
    passwordInput.disabled = !this.checked;
    if (!this.checked) {
      passwordInput.value = '';
    } else {
      passwordInput.focus();
    }
  });
}

// Check if browser supports WebRTC
function checkBrowserCompatibility() {
  if (!navigator.mediaDevices || 
      !navigator.mediaDevices.getUserMedia || 
      !window.RTCPeerConnection) {
    
    alert("Your browser doesn't support WebRTC! Please use a modern browser like Chrome, Firefox, Safari, or Edge.");
    log("Browser compatibility check failed - WebRTC not supported");
    
    // Disable buttons that won't work
    joinBtn.disabled = true;
    createBtn.disabled = true;
    return false;
  }
  
  log("Browser supports WebRTC - compatibility check passed");
  return true;
}

// Try different media access methods with fallbacks
async function tryGetUserMedia() {
  try {
    log('Requesting camera and microphone access...');
    
    // Get the current device selections (if any)
    const videoSource = videoInputSelect.value ? { deviceId: { exact: videoInputSelect.value } } : true;
    const audioSource = audioInputSelect.value ? { deviceId: { exact: audioInputSelect.value } } : true;
    
    // Create all related promises
    const mediaPromise = navigator.mediaDevices.getUserMedia({ 
      video: videoSource, 
      audio: audioSource 
    });
    
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Media access timeout - took too long to get permission')), 10000);
    });
    
    // Race between media access and timeout
    const stream = await Promise.race([mediaPromise, timeoutPromise]);
    
    // Success! Replace the empty stream
    localStream = stream;
    log('Camera and microphone access granted');
    localVideo.srcObject = localStream;
    
    // Update the current user's media status
    currentUser.audioEnabled = true;
    currentUser.videoEnabled = true;
    
    updateConnectionStatus('Ready to connect');
    return true;
  } catch (error) {
    log(`Error accessing camera and microphone: ${error.message}`);
    
    // Try audio only
    try {
      log('Attempting audio-only fallback...');
      const audioSource = audioInputSelect.value ? { deviceId: { exact: audioInputSelect.value } } : true;
      const audioStream = await navigator.mediaDevices.getUserMedia({ 
        video: false, 
        audio: audioSource 
      });
      
      localStream = audioStream;
      log('Audio-only access granted');
      localVideo.srcObject = localStream;
      
      // Update the current user's media status
      currentUser.audioEnabled = true;
      currentUser.videoEnabled = false;
      
      updateConnectionStatus('Ready to connect (audio only)');
      return true;
    } catch (audioError) {
      log(`Audio-only fallback failed: ${audioError.message}`);
      
      // At this point we have no media access
      log('No media devices available');
      updateConnectionStatus('No media devices available');
      
      // Display a black square in the video element
      localVideo.srcObject = localStream; // Empty stream
      
      // Update the current user's media status
      currentUser.audioEnabled = false;
      currentUser.videoEnabled = false;
      
      alert(`Unable to access camera or microphone: ${error.message}. You will be able to connect but can't send audio/video.`);
      return false;
    }
  }
}

// Load available media devices 
async function loadMediaDevices() {
  try {
    log('Loading available media devices...');
    const devices = await navigator.mediaDevices.enumerateDevices();
    
    // Clear previous options
    audioInputSelect.innerHTML = '';
    videoInputSelect.innerHTML = '';
    audioOutputSelect.innerHTML = '';
    
    // Populate audio inputs
    const audioInputs = devices.filter(device => device.kind === 'audioinput');
    audioInputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Microphone ${audioInputSelect.length + 1}`;
      audioInputSelect.appendChild(option);
    });
    
    // Populate video inputs
    const videoInputs = devices.filter(device => device.kind === 'videoinput');
    videoInputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.text = device.label || `Camera ${videoInputSelect.length + 1}`;
      videoInputSelect.appendChild(option);
    });
    
    // Populate audio outputs (if supported)
    if ('sinkId' in HTMLMediaElement.prototype) {
      const audioOutputs = devices.filter(device => device.kind === 'audiooutput');
      audioOutputs.forEach(device => {
        const option = document.createElement('option');
        option.value = device.deviceId;
        option.text = device.label || `Speaker ${audioOutputSelect.length + 1}`;
        audioOutputSelect.appendChild(option);
      });
    } else {
      // Browser doesn't support output device selection
      audioOutputSelect.disabled = true;
      audioOutputSelect.innerHTML = '<option value="">Output selection not supported</option>';
    }
    
    log(`Found ${audioInputs.length} audio inputs, ${videoInputs.length} video inputs`);
  } catch (error) {
    log(`Error loading media devices: ${error.message}`);
    console.error('Error loading media devices:', error);
  }
}

// Apply new media device settings
async function applyMediaSettings() {
  log('Applying new media device settings...');
  
  // Stop existing tracks
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  
  // Get new stream with selected devices
  try {
    const constraints = {
      audio: audioInputSelect.value ? { deviceId: { exact: audioInputSelect.value } } : true,
      video: videoInputSelect.value ? { deviceId: { exact: videoInputSelect.value } } : true
    };
    
    localStream = await navigator.mediaDevices.getUserMedia(constraints);
    localVideo.srcObject = localStream;
    
    // Update current user's media status
    currentUser.audioEnabled = true;
    currentUser.videoEnabled = true;
    
    // Update tracks in peer connections (if any)
    if (Object.keys(peerConnections).length > 0) {
      for (const peerId in peerConnections) {
        const pc = peerConnections[peerId];
        
        // Replace tracks in existing senders
        const senders = pc.getSenders();
        localStream.getTracks().forEach(track => {
          const sender = senders.find(s => s.track && s.track.kind === track.kind);
          if (sender) {
            sender.replaceTrack(track);
          }
        });
      }
    }
    
    // Update button states
    updateButtonsState();
    log('Media settings applied successfully');
    
    // Apply audio output device (if supported)
    if ('sinkId' in HTMLMediaElement.prototype && audioOutputSelect.value) {
      try {
        await localVideo.setSinkId(audioOutputSelect.value);
        log(`Changed audio output to ${audioOutputSelect.selectedOptions[0].text}`);
      } catch (error) {
        log(`Error changing audio output: ${error.message}`);
      }
    }
    
  } catch (error) {
    log(`Error applying media settings: ${error.message}`);
    alert(`Failed to apply media settings: ${error.message}`);
  }
}

// Room list and management
async function refreshRooms() {
  log('Refreshing available rooms...');
  roomsList.innerHTML = '<p class="loading">Loading rooms...</p>';
  
  try {
    const response = await fetch('/api/rooms');
    const rooms = await response.json();
    
    if (rooms.length === 0) {
      roomsList.innerHTML = '<p>No active rooms available</p>';
      return;
    }
    
    roomsList.innerHTML = '';
    rooms.forEach(room => {
      const roomElement = document.createElement('div');
      roomElement.classList.add('room-item');
      
      const roomInfo = document.createElement('div');
      roomInfo.classList.add('room-info');
      
      const roomName = document.createElement('div');
      roomName.classList.add('room-name');
      roomName.innerHTML = `${room.id} ${room.isPasswordProtected ? '<i class="fas fa-lock" title="Password Protected"></i>' : ''}`;
      
      const roomParticipants = document.createElement('div');
      roomParticipants.classList.add('room-participants');
      roomParticipants.textContent = `${room.userCount} participant${room.userCount !== 1 ? 's' : ''}`;
      
      roomInfo.appendChild(roomName);
      roomInfo.appendChild(roomParticipants);
      
      const joinButton = document.createElement('button');
      joinButton.classList.add('secondary-btn');
      joinButton.innerHTML = `<i class="fas fa-sign-in-alt"></i> Join`;
      joinButton.addEventListener('click', () => {
        // Pre-fill the room ID in the join tab
        roomIdInput.value = room.id;
        
        // Switch to the join tab
        document.querySelector('.tab-btn[data-tab="join"]').click();
      });
      
      roomElement.appendChild(roomInfo);
      roomElement.appendChild(joinButton);
      roomsList.appendChild(roomElement);
    });
    
    log(`Loaded ${rooms.length} available rooms`);
  } catch (error) {
    log(`Error loading rooms: ${error.message}`);
    roomsList.innerHTML = '<p>Error loading rooms. Please try again later.</p>';
  }
}

// Start meeting duration timer
function startMeetingTimer() {
  meetingStartTime = new Date();
  
  // Update the timer every second
  durationInterval = setInterval(() => {
    const now = new Date();
    const duration = now - meetingStartTime;
    
    // Format as HH:MM:SS
    const hours = Math.floor(duration / 3600000).toString().padStart(2, '0');
    const minutes = Math.floor((duration % 3600000) / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((duration % 60000) / 1000).toString().padStart(2, '0');
    
    meetingDuration.textContent = `${hours}:${minutes}:${seconds}`;
  }, 1000);
}

// Stop meeting duration timer
function stopMeetingTimer() {
  if (durationInterval) {
    clearInterval(durationInterval);
    durationInterval = null;
  }
}

// Update UI button states based on available media
function updateButtonsState() {
  const hasAudio = localStream && localStream.getAudioTracks().length > 0;
  const hasVideo = localStream && localStream.getVideoTracks().length > 0;
  
  // Update mute button
  muteBtn.disabled = !hasAudio;
  muteBtn.querySelector('i').className = isAudioMuted ? 'fas fa-microphone-slash' : 'fas fa-microphone';
  muteBtn.title = hasAudio ? (isAudioMuted ? 'Unmute' : 'Mute') : 'No audio available';
  muteBtn.nextElementSibling.textContent = isAudioMuted ? 'Unmute' : 'Mute';
  
  // Update video button
  videoBtn.disabled = !hasVideo;
  videoBtn.querySelector('i').className = isVideoOff ? 'fas fa-video-slash' : 'fas fa-video';
  videoBtn.title = hasVideo ? (isVideoOff ? 'Turn on camera' : 'Turn off camera') : 'No video available';
  videoBtn.nextElementSibling.textContent = isVideoOff ? 'Start Video' : 'Stop Video';
  
  // Update screen share button
  screenShareBtn.disabled = !navigator.mediaDevices.getDisplayMedia;
  screenShareBtn.querySelector('i').className = isScreenSharing ? 'fas fa-desktop' : 'fas fa-desktop';
  screenShareBtn.title = isScreenSharing ? 'Stop sharing' : 'Share screen';
  screenShareBtn.nextElementSibling.textContent = isScreenSharing ? 'Stop Share' : 'Share';
}

// Update connection status display
function updateConnectionStatus(status) {
  connectionStatus.textContent = status;
  log(`Connection status: ${status}`);
}

// Set up socket event listeners
function setupSocketListeners() {
  // Handle room joining
  socket.on('room-joined', (roomInfo) => {
    log(`Joined room: ${roomInfo.roomId}`);
    roomId = roomInfo.roomId;
    isAdmin = roomInfo.isAdmin;
    
    // Record user info for ourselves
    currentUser.id = socket.id;
    
    // Set up participant list
    if (roomInfo.participants) {
      roomInfo.participants.forEach(participant => {
        if (participant.id !== socket.id) {
          participants[participant.id] = participant;
          addParticipantToList(participant);
        }
      });
    }
    
    // Load chat history if available
    if (roomInfo.messages) {
      roomInfo.messages.forEach(message => {
        addMessageToChat(message);
      });
    }
    
    // Update display
    roomDisplay.textContent = roomId;
    updateParticipantCount();
    
    // Start meeting timer
    startMeetingTimer();
    
    // Set connection status
    updateConnectionStatus('Connected to room');
    
    // Initialize connections to existing participants
    Object.keys(participants).forEach(async (participantId) => {
      log(`Establishing connection to existing participant: ${participantId}`);
      await createPeerConnection(participantId);
      createOffer(participantId);
    });
  });
  
  // Handle join rejection
  socket.on('join-rejected', (data) => {
    log(`Room join rejected: ${data.reason}`);
    
    let message = "Could not join room";
    if (data.reason === 'incorrect-password') {
      message = "Incorrect password for this room";
    }
    
    alert(message);
    
    // Reset UI
    entryContainer.classList.remove('hidden');
    callContainer.classList.add('hidden');
  });

  // Handle user connected
  socket.on('user-connected', async (user) => {
    log(`New remote user connected: ${user.displayName} (${user.id})`);
    
    // Add to participants list
    participants[user.id] = user;
    addParticipantToList(user);
    updateParticipantCount();
    
    // Wait a moment before establishing connection to ensure both clients are ready
    setTimeout(async () => {
      await createPeerConnection(user.id);
      // If we're already in the room, we create the offer to the new user
      if (currentUser.id) {
        createOffer(user.id);
      }
    }, 1000);
  });

  // Handle user disconnections
  socket.on('user-disconnected', (userId) => {
    log(`Remote user disconnected: ${userId}`);
    
    // Remove from participants list
    delete participants[userId];
    removeParticipantFromList(userId);
    updateParticipantCount();
    
    // Close peer connection
    if (peerConnections[userId]) {
      peerConnections[userId].close();
      delete peerConnections[userId];
    }
    
    // Remove video element
    const videoElement = document.querySelector(`.video-item[data-user-id="${userId}"]`);
    if (videoElement) {
      videoElement.remove();
    }
    
    // Add system message to chat
    const userInfo = participants[userId] || { displayName: 'Someone' };
    addSystemMessageToChat(`${userInfo.displayName} has left the meeting`);
  });
  
  // Handle admin changes
  socket.on('admin-changed', (data) => {
    log(`Admin changed to: ${data.newAdminId}`);
    isAdmin = data.newAdminId === socket.id;
    
    // Update UI if needed
    if (isAdmin) {
      addSystemMessageToChat('You are now the meeting host');
    }
  });
  
  // Handle media status changes
  socket.on('user-media-status', (status) => {
    const { userId, audioEnabled, videoEnabled } = status;
    log(`User ${userId} media status changed: audio=${audioEnabled}, video=${videoEnabled}`);
    
    // Update participants list
    if (participants[userId]) {
      participants[userId].audioEnabled = audioEnabled;
      participants[userId].videoEnabled = videoEnabled;
      updateParticipantMediaStatus(userId, audioEnabled, videoEnabled);
    }
    
    // Update video element indicators
    const videoItem = document.querySelector(`.video-item[data-user-id="${userId}"]`);
    if (videoItem) {
      const micStatus = videoItem.querySelector('.mic-status');
      const camStatus = videoItem.querySelector('.cam-status');
      
      if (micStatus) {
        micStatus.className = audioEnabled ? 'mic-status on' : 'mic-status off';
        micStatus.querySelector('i').className = audioEnabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
      }
      
      if (camStatus) {
        camStatus.className = videoEnabled ? 'cam-status on' : 'cam-status off';
        camStatus.querySelector('i').className = videoEnabled ? 'fas fa-video' : 'fas fa-video-slash';
      }
    }
  });
  
  // Handle screen sharing status
  socket.on('user-screen-share', (data) => {
    const { userId, isSharing } = data;
    log(`User ${userId} ${isSharing ? 'started' : 'stopped'} screen sharing`);
    
    // Update participant info
    if (participants[userId]) {
      participants[userId].shareScreen = isSharing;
    }
    
    // Add system message to chat
    const userInfo = participants[userId] || { displayName: 'Someone' };
    addSystemMessageToChat(`${userInfo.displayName} ${isSharing ? 'started' : 'stopped'} sharing their screen`);
  });
  
  // Handle chat messages
  socket.on('new-message', (message) => {
    log(`Received chat message from: ${message.senderName}`);
    addMessageToChat(message);
  });

  // WebRTC signaling events
  socket.on('offer', async (data) => {
    try {
      const { from, offer } = data;
      log(`Received offer from: ${from}`);
      
      // Ensure we have a peer connection
      let pc = peerConnections[from];
      if (!pc) {
        pc = await createPeerConnection(from);
      }
      
      // Set remote description
      log('Setting remote description (offer)');
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      
      // Create and send answer
      log('Creating answer');
      const answer = await pc.createAnswer();
      
      log('Setting local description (answer)');
      await pc.setLocalDescription(answer);
      
      log('Sending answer to remote peer');
      socket.emit('answer', from, answer);
    } catch (error) {
      log(`Error handling offer: ${error.message}`);
      console.error('Error handling offer:', error);
    }
  });

  socket.on('answer', async (data) => {
    try {
      const { from, answer } = data;
      log(`Received answer from: ${from}`);
      
      const pc = peerConnections[from];
      if (!pc) {
        log(`No peer connection found for ${from}`);
        return;
      }
      
      if (pc.signalingState === 'have-local-offer') {
        log('Setting remote description (answer)');
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
        log('Remote description set successfully');
      } else {
        log(`Cannot set remote description in state: ${pc.signalingState}`);
      }
    } catch (error) {
      log(`Error handling answer: ${error.message}`);
      console.error('Error handling answer:', error);
    }
  });

  socket.on('ice-candidate', async (data) => {
    try {
      const { from, candidate } = data;
      log(`Received ICE candidate from: ${from}`);
      
      const pc = peerConnections[from];
      if (!pc) {
        log(`No peer connection found for ${from}`);
        return;
      }
      
      // Log candidate type for debugging
      let candidateType = 'unknown';
      if (candidate && candidate.candidate) {
        if (candidate.candidate.indexOf('typ host') >= 0) {
          candidateType = 'host';
        } else if (candidate.candidate.indexOf('typ srflx') >= 0) {
          candidateType = 'srflx (STUN)';
        } else if (candidate.candidate.indexOf('typ relay') >= 0) {
          candidateType = 'relay (TURN)';
        }
      }
      log(`Processing ICE candidate type: ${candidateType}`);
      
      // Make sure we have a remote description before adding ICE candidates
      if (pc.remoteDescription) {
        log('Adding ICE candidate to connection');
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
        log('ICE candidate added successfully');
      } else {
        log('Cannot add ICE candidate without remote description');
      }
    } catch (error) {
      log(`Error adding ICE candidate: ${error.message}`);
      console.error('Error adding ICE candidate:', error);
    }
  });
  
  // Handle socket connection errors
  socket.on('connect_error', (error) => {
    log(`Socket connection error: ${error.message}`);
    updateConnectionStatus('Signaling server connection error');
  });
  
  socket.on('connect', () => {
    log('Connected to signaling server');
  });
  
  socket.on('disconnect', () => {
    log('Disconnected from signaling server');
    updateConnectionStatus('Disconnected from signaling server');
  });
}

// Set up button click event listeners
function setupButtonListeners() {
  // Room buttons
  joinBtn.addEventListener('click', joinRoom);
  createBtn.addEventListener('click', createRoom);
  refreshRoomsBtn.addEventListener('click', refreshRooms);
  
  // Call control buttons
  muteBtn.addEventListener('click', toggleAudio);
  videoBtn.addEventListener('click', toggleVideo);
  screenShareBtn.addEventListener('click', toggleScreenShare);
  leaveBtn.addEventListener('click', leaveRoom);
  
  // Panel toggle buttons
  chatBtn.addEventListener('click', () => togglePanel(chatPanel, chatBtn));
  participantsBtn.addEventListener('click', () => togglePanel(participantsPanel, participantsBtn));
  
  // Chat panel
  sendMessageBtn.addEventListener('click', sendChatMessage);
  messageInput.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      sendChatMessage();
    }
  });
  
  // Close panel buttons
  document.querySelectorAll('.close-panel').forEach(button => {
    button.addEventListener('click', () => {
      // Find the parent panel
      const panel = button.closest('.side-panel');
      if (panel) {
        panel.classList.add('hidden');
        
        // Deactivate associated control button
        if (panel === chatPanel && activePanelBtn === chatBtn) {
          chatBtn.classList.remove('active');
          activePanelBtn = null;
        } else if (panel === participantsPanel && activePanelBtn === participantsBtn) {
          participantsBtn.classList.remove('active');
          activePanelBtn = null;
        }
      }
    });
  });
  
  // Settings
  applySettingsBtn.addEventListener('click', applyMediaSettings);
}

// Create a new room
async function createRoom() {
  // Get display name
  const displayName = createDisplayNameInput.value.trim();
  if (!displayName) {
    alert('Please enter your display name');
    createDisplayNameInput.focus();
    return;
  }
  
  // Generate room ID
  roomId = generateRoomId();
  
  // Get password if specified
  const password = roomPasswordCheckbox.checked ? passwordInput.value : null;
  
  // Try to get user media before proceeding
  const mediaAccess = await tryGetUserMedia();
  if (!mediaAccess) {
    return;
  }
  
  // Save display name
  currentUser.displayName = displayName;
  
  // Show call container
  entryContainer.classList.add('hidden');
  callContainer.classList.remove('hidden');
  
  // Join the room
  log(`Creating and joining room: ${roomId}`);
  socket.emit('join-room', roomId, {
    displayName,
    password
  });
}

// Join an existing room
async function joinRoom() {
  // Get room ID
  const roomInputValue = roomIdInput.value.trim();
  if (!roomInputValue) {
    alert('Please enter a room ID');
    roomIdInput.focus();
    return;
  }
  
  // Get display name
  const displayName = displayNameInput.value.trim();
  if (!displayName) {
    alert('Please enter your display name');
    displayNameInput.focus();
    return;
  }

  try {
    // Check if room exists and if it's password protected
    const response = await fetch(`/api/room/${roomInputValue}`);
    const roomInfo = await response.json();
    
    if (!roomInfo.exists) {
      alert('Room does not exist');
      return;
    }

    let password = null;
    if (roomInfo.isPasswordProtected) {
      password = prompt('This room is password protected. Please enter the password:');
      if (!password) {
        return; // User cancelled the password prompt
      }
    }
    
    // Try to get user media before proceeding
    const mediaAccess = await tryGetUserMedia();
    if (!mediaAccess) {
      return;
    }
    
    // Save room ID and display name
    roomId = roomInputValue;
    currentUser.displayName = displayName;
    
    // Show call container
    entryContainer.classList.add('hidden');
    callContainer.classList.remove('hidden');
    
    // Join the room
    log(`Joining room: ${roomId}`);
    socket.emit('join-room', roomId, {
      displayName,
      password
    });
  } catch (error) {
    log(`Error checking room: ${error.message}`);
    alert('Error joining room. Please try again.');
  }
}

// Toggle screen share
async function toggleScreenShare() {
  if (!navigator.mediaDevices.getDisplayMedia) {
    alert('Your browser does not support screen sharing');
    return;
  }
  
  if (isScreenSharing) {
    // Stop screen sharing
    if (screenStream) {
      screenStream.getTracks().forEach(track => track.stop());
      screenStream = null;
      
      // Notify server
      socket.emit('screen-sharing-stop');
    }
    
    // Switch back to camera video if available
    if (localStream) {
      const videoTracks = localStream.getVideoTracks();
      if (videoTracks.length > 0 && !isVideoOff) {
        // Replace tracks in all connections
        for (const peerId in peerConnections) {
          const pc = peerConnections[peerId];
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          
          if (videoSender) {
            videoSender.replaceTrack(videoTracks[0]);
          }
        }
      }
      
      // Show local video again
      localVideo.srcObject = localStream;
    }
    
    isScreenSharing = false;
    updateButtonsState();
    log('Screen sharing stopped');
    
  } else {
    // Start screen sharing
    try {
      log('Requesting screen share...');
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'always'
        },
        audio: false
      });
      
      if (screenStream) {
        // Add a listener for when user stops sharing via browser UI
        screenStream.getVideoTracks()[0].onended = () => {
          toggleScreenShare();
        };
        
        // Replace video tracks in all peer connections
        for (const peerId in peerConnections) {
          const pc = peerConnections[peerId];
          const senders = pc.getSenders();
          const videoSender = senders.find(s => s.track && s.track.kind === 'video');
          
          if (videoSender) {
            videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
          }
        }
        
        // Replace local video preview
        localVideo.srcObject = screenStream;
        
        // Notify server
        socket.emit('screen-sharing-start');
        
        isScreenSharing = true;
        updateButtonsState();
        log('Screen sharing started');
      }
    } catch (error) {
      log(`Screen sharing error: ${error.message}`);
      console.error('Screen sharing error:', error);
      alert(`Failed to share screen: ${error.message}`);
    }
  }
}

// Leave the current room
function leaveRoom() {
  log('Leaving meeting...');
  
  // Stop the meeting timer
  stopMeetingTimer();
  
  // Close all peer connections
  for (const userId in peerConnections) {
    if (peerConnections[userId]) {
      log(`Closing connection with ${userId}`);
      peerConnections[userId].close();
    }
  }
  peerConnections = {};
  
  // Stop local media
  if (localStream) {
    log('Stopping local media tracks');
    localStream.getTracks().forEach(track => track.stop());
    localStream = null; // Clear the stream reference
  }
  
  // Stop screen sharing if active
  if (screenStream) {
    log('Stopping screen share');
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  
  // Reset state
  localVideo.srcObject = null;
  participants = {};
  isScreenSharing = false;
  isAudioMuted = false;
  isVideoOff = true; // Set video as off since we've closed it
  
  // Reset UI
  roomDisplay.textContent = '';
  participantsList.innerHTML = '';
  chatMessages.innerHTML = '';
  videoGrid.innerHTML = '';
  
  // Add back the local video container
  const localVideoContainer = document.querySelector('.local-video');
  if (!localVideoContainer) {
    // Re-add local video container if it was removed
    const localVideoHtml = `
      <div class="video-item local-video">
        <div class="video-header">
          <span class="participant-name">You</span>
          <span class="connection-status"></span>
        </div>
        <video id="localVideo" autoplay muted playsinline></video>
        <div class="video-controls">
          <button class="mic-status on"><i class="fas fa-microphone"></i></button>
          <button class="cam-status on"><i class="fas fa-video"></i></button>
        </div>
      </div>
    `;
    videoGrid.innerHTML = localVideoHtml;
  }
  
  // Hide all side panels
  chatPanel.classList.add('hidden');
  participantsPanel.classList.add('hidden');
  
  // Reset control buttons
  if (activePanelBtn) {
    activePanelBtn.classList.remove('active');
    activePanelBtn = null;
  }
  
  // Switch back to entry container
  callContainer.classList.add('hidden');
  entryContainer.classList.remove('hidden');
  
  // Reset connection status
  updateConnectionStatus('Not connected');
  
  // Update buttons state to reflect camera being off
  updateButtonsState();
  
  log('Left the meeting');
}

// Toggle audio mute
function toggleAudio() {
  if (!localStream) {
    log('Cannot toggle audio: No local stream available');
    return;
  }

  const audioTracks = localStream.getAudioTracks();
  if (audioTracks.length === 0) {
    log('No audio tracks available to mute/unmute');
    return;
  }

  isAudioMuted = !isAudioMuted;
  audioTracks.forEach(track => {
    track.enabled = !isAudioMuted;
  });
  
  // Update UI
  updateButtonsState();
  log(`Audio ${isAudioMuted ? 'muted' : 'unmuted'}`);
  
  // Update current user's media status
  currentUser.audioEnabled = !isAudioMuted;
  
  // Notify other participants
  socket.emit('media-status', {
    audioEnabled: !isAudioMuted,
    videoEnabled: !isVideoOff
  });
}

// Toggle video on/off
function toggleVideo() {
  if (!localStream) {
    log('Cannot toggle video: No local stream available');
    return;
  }

  const videoTracks = localStream.getVideoTracks();
  if (videoTracks.length === 0) {
    log('No video tracks available to toggle');
    return;
  }

  isVideoOff = !isVideoOff;
  videoTracks.forEach(track => {
    track.enabled = !isVideoOff;
  });
  
  // Update UI
  updateButtonsState();
  log(`Video ${isVideoOff ? 'turned off' : 'turned on'}`);
  
  // Update current user's media status
  currentUser.videoEnabled = !isVideoOff;
  
  // Notify other participants
  socket.emit('media-status', {
    audioEnabled: !isAudioMuted,
    videoEnabled: !isVideoOff
  });
}

// Toggle side panels
function togglePanel(panel, button) {
  // If this panel is already active, just close it
  if (activePanelBtn === button) {
    panel.classList.add('hidden');
    button.classList.remove('active');
    activePanelBtn = null;
    return;
  }
  
  // Close any other open panel
  if (activePanelBtn) {
    // Find the associated panel
    const activePanel = activePanelBtn === chatBtn 
      ? chatPanel 
      : activePanelBtn === participantsBtn 
        ? participantsPanel 
        : null;
        
    if (activePanel) {
      activePanel.classList.add('hidden');
      activePanelBtn.classList.remove('active');
    }
  }
  
  // Open the requested panel
  panel.classList.remove('hidden');
  button.classList.add('active');
  activePanelBtn = button;
  
  // Additional panel-specific actions
  if (panel === chatPanel) {
    messageInput.focus();
  }
}

// Update participant count display
function updateParticipantCount() {
  // Count includes local user
  const count = Object.keys(participants).length + 1;
  participantCount.textContent = count;
  
  // Update the video grid layout class based on participant count
  updateVideoGridLayout(count);
}

// Update video grid layout based on participant count
function updateVideoGridLayout(count) {
  // Remove all layout classes
  videoGrid.classList.remove('one-participant', 'two-participants', 'three-participants', 'four-or-more');
  
  // Add the appropriate class
  if (count === 1) {
    videoGrid.classList.add('one-participant');
  } else if (count === 2) {
    videoGrid.classList.add('two-participants');
  } else if (count === 3) {
    videoGrid.classList.add('three-participants');
  } else {
    videoGrid.classList.add('four-or-more');
  }
}

// Add participant to participants list
function addParticipantToList(participant) {
  // Clone the template
  const template = participantTemplate.content.cloneNode(true);
  
  // Set participant ID
  const participantItem = template.querySelector('.participant-item');
  participantItem.dataset.userId = participant.id;
  
  // Set display name
  const nameElement = participantItem.querySelector('.participant-name');
  nameElement.textContent = participant.displayName;
  
  // Set media status
  const micControl = participantItem.querySelector('.mic-control');
  micControl.innerHTML = `<i class="fas fa-${participant.audioEnabled ? 'microphone' : 'microphone-slash'}"></i>`;
  micControl.classList.toggle('off', !participant.audioEnabled);
  
  const videoControl = participantItem.querySelector('.video-control');
  videoControl.innerHTML = `<i class="fas fa-${participant.videoEnabled ? 'video' : 'video-slash'}"></i>`;
  videoControl.classList.toggle('off', !participant.videoEnabled);
  
  // Append to list
  participantsList.appendChild(participantItem);
  
  // Add system message to chat
  addSystemMessageToChat(`${participant.displayName} joined the meeting`);
}

// Remove participant from list
function removeParticipantFromList(userId) {
  const participantItem = participantsList.querySelector(`.participant-item[data-user-id="${userId}"]`);
  if (participantItem) {
    participantItem.remove();
  }
}

// Update participant media status in list
function updateParticipantMediaStatus(userId, audioEnabled, videoEnabled) {
  const participantItem = participantsList.querySelector(`.participant-item[data-user-id="${userId}"]`);
  if (participantItem) {
    const micControl = participantItem.querySelector('.mic-control');
    micControl.innerHTML = `<i class="fas fa-${audioEnabled ? 'microphone' : 'microphone-slash'}"></i>`;
    micControl.classList.toggle('off', !audioEnabled);
    
    const videoControl = participantItem.querySelector('.video-control');
    videoControl.innerHTML = `<i class="fas fa-${videoEnabled ? 'video' : 'video-slash'}"></i>`;
    videoControl.classList.toggle('off', !videoEnabled);
  }
}

// Add a message to the chat
function addMessageToChat(message) {
  // Clone the template
  const template = chatMessageTemplate.content.cloneNode(true);
  
  const chatMessage = template.querySelector('.chat-message');
  const messageSender = chatMessage.querySelector('.message-sender');
  const messageTime = chatMessage.querySelector('.message-time');
  const messageContent = chatMessage.querySelector('.message-content');
  
  // Set message ID for potential future reference
  chatMessage.dataset.messageId = message.id;
  
  // Fill in content
  messageSender.textContent = message.senderName;
  messageContent.textContent = message.content;
  
  // Format timestamp
  const time = new Date(message.timestamp);
  messageTime.textContent = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  // Highlight if from me
  if (message.sender === socket.id) {
    chatMessage.classList.add('my-message');
  }
  
  // Add to message container
  chatMessages.appendChild(chatMessage);
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Add a system message to chat
function addSystemMessageToChat(message) {
  const systemMessage = document.createElement('div');
  systemMessage.classList.add('chat-message', 'system-message');
  
  const messageContent = document.createElement('div');
  messageContent.classList.add('message-content');
  messageContent.textContent = message;
  
  systemMessage.appendChild(messageContent);
  chatMessages.appendChild(systemMessage);
  
  // Scroll to bottom
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Send a chat message
function sendChatMessage() {
  const messageText = messageInput.value.trim();
  if (!messageText) return;
  
  socket.emit('chat-message', messageText);
  messageInput.value = '';
  messageInput.focus();
}

// Add a video element for a remote user
function addVideoElement(userId, stream) {
  // Check if an element already exists
  let videoElement = document.querySelector(`.video-item[data-user-id="${userId}"]`);
  
  if (!videoElement) {
    // Clone the template
    const template = remoteVideoTemplate.content.cloneNode(true);
    videoElement = template.querySelector('.video-item');
    
    // Set user ID
    videoElement.dataset.userId = userId;
    
    // Set up user info
    const participant = participants[userId] || { displayName: 'Unknown User' };
    const nameElement = videoElement.querySelector('.participant-name');
    nameElement.textContent = participant.displayName;
    
    // Add to video grid
    videoGrid.appendChild(videoElement);
  }
  
  // Set up video element
  const videoStreamElement = videoElement.querySelector('video');
  if (videoStreamElement) {
    videoStreamElement.srcObject = stream;
    
    // Update media indicators
    if (participants[userId]) {
      const micStatus = videoElement.querySelector('.mic-status');
      const camStatus = videoElement.querySelector('.cam-status');
      
      if (micStatus) {
        micStatus.className = participants[userId].audioEnabled ? 'mic-status on' : 'mic-status off';
        micStatus.querySelector('i').className = participants[userId].audioEnabled ? 'fas fa-microphone' : 'fas fa-microphone-slash';
      }
      
      if (camStatus) {
        camStatus.className = participants[userId].videoEnabled ? 'cam-status on' : 'cam-status off';
        camStatus.querySelector('i').className = participants[userId].videoEnabled ? 'fas fa-video' : 'fas fa-video-slash';
      }
    }
  }
  
  return videoElement;
}

// Create a peer connection for a specific user
async function createPeerConnection(userId) {
  // Check if connection already exists
  if (peerConnections[userId]) {
    log(`Peer connection for ${userId} already exists, reusing`);
    return peerConnections[userId];
  }
  
  try {
    log(`Creating new peer connection for ${userId}`);
    updateConnectionStatus('Creating connection...');
    
    // Initialize the peer connection with ICE servers
    const pc = new RTCPeerConnection(iceServers);
    peerConnections[userId] = pc;
    log(`RTCPeerConnection object created for ${userId}`);
    
    // Create a data channel for messaging
    try {
      const dataChannel = pc.createDataChannel('messageChannel');
      log('Created data channel');
      
      dataChannel.onopen = () => {
        log(`Data channel opened with ${userId}`);
      };
      
      dataChannel.onclose = () => {
        log(`Data channel closed with ${userId}`);
      };
    } catch (dcError) {
      log(`Couldn't create data channel: ${dcError.message}`);
    }
    
    // Handle ICE candidates
    pc.onicecandidate = event => {
      if (event.candidate) {
        log(`Generated ICE candidate for ${userId}: ${event.candidate.sdpMid}`);
        socket.emit('ice-candidate', userId, event.candidate);
      } else {
        log(`All ICE candidates generated for ${userId}`);
      }
    };
    
    // Monitor connection gathering state
    pc.onicegatheringstatechange = () => {
      log(`ICE gathering state for ${userId}: ${pc.iceGatheringState}`);
    };
    
    // Monitor ICE connection state
    pc.oniceconnectionstatechange = () => {
      const state = pc.iceConnectionState;
      log(`ICE connection state for ${userId}: ${state}`);
      
      // Update connection status in the UI
      const videoElement = document.querySelector(`.video-item[data-user-id="${userId}"]`);
      if (videoElement) {
        const statusElement = videoElement.querySelector('.connection-status');
        if (statusElement) {
          switch(state) {
            case 'checking':
              statusElement.style.backgroundColor = 'var(--warning-color)';
              break;
            case 'connected':
            case 'completed':
              statusElement.style.backgroundColor = 'var(--success-color)';
              break;
            case 'failed':
            case 'disconnected':
              statusElement.style.backgroundColor = 'var(--danger-color)';
              break;
            default:
              statusElement.style.backgroundColor = '#999';
          }
        }
      }
      
      switch(state) {
        case 'failed':
          log(`Connection with ${userId} failed - trying to restart ICE`);
          // Try to restart ICE
          try {
            pc.restartIce();
          } catch (e) {
            log(`ICE restart failed: ${e.message}`);
          }
          break;
        case 'disconnected':
          log(`Connection with ${userId} disconnected - attempting to reconnect`);
          // Handle disconnection - might be temporary
          setTimeout(() => {
            if (pc && pc.iceConnectionState === 'disconnected') {
              log(`Connection with ${userId} still disconnected, attempting restart`);
              try {
                pc.restartIce();
              } catch (e) {
                log(`ICE restart failed: ${e.message}`);
              }
            }
          }, 3000); // Wait 3 seconds before attempting reconnection
          break;
      }
    };
    
    // Monitor connection state
    pc.onconnectionstatechange = () => {
      log(`Connection state for ${userId}: ${pc.connectionState}`);
      
      // Handle complete connection failure
      if (pc.connectionState === 'failed') {
        log(`Connection with ${userId} has failed completely, recreating`);
        
        // Clean up current connection
        const videoElement = document.querySelector(`.video-item[data-user-id="${userId}"]`);
        if (videoElement) {
          const videoPlayer = videoElement.querySelector('video');
          if (videoPlayer && videoPlayer.srcObject) {
            videoPlayer.srcObject.getTracks().forEach(track => track.stop());
            videoPlayer.srcObject = null;
          }
        }
        
        // Close and delete old connection
        pc.close();
        delete peerConnections[userId];
        
        // Attempt to recreate the connection after a short delay
        setTimeout(async () => {
          log(`Recreating peer connection for ${userId} after failure`);
          await createPeerConnection(userId);
          createOffer(userId);
        }, 2000);
      }
    };
    
    // Monitor signaling state
    pc.onsignalingstatechange = () => {
      log(`Signaling state for ${userId}: ${pc.signalingState}`);
    };
    
    // Handle remote stream
    pc.ontrack = event => {
      log(`Received ${event.track.kind} track from ${userId}`);
      
      // Create a stream if we don't have one yet
      if (!event.streams || event.streams.length === 0) {
        log('No remote stream provided, creating one');
        const newStream = new MediaStream([event.track]);
        addVideoElement(userId, newStream);
      } else {
        // Use the provided stream
        addVideoElement(userId, event.streams[0]);
      }
    };
    
    // Add local media tracks (if available)
    if (localStream) {
      try {
        const tracks = localStream.getTracks();
        log(`Adding ${tracks.length} local tracks to connection with ${userId}`);
        
        for (const track of tracks) {
          log(`Adding ${track.kind} track to peer connection with ${userId}`);
          pc.addTrack(track, localStream);
        }
      } catch (trackError) {
        log(`Error adding tracks to connection with ${userId}: ${trackError.message}`);
      }
    } else {
      log(`No local stream available to add to connection with ${userId}`);
    }
    
    // If screen sharing is active, use that for video
    if (isScreenSharing && screenStream) {
      const videoTrack = screenStream.getVideoTracks()[0];
      if (videoTrack) {
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        
        if (videoSender) {
          log(`Replacing video track with screen share for ${userId}`);
          videoSender.replaceTrack(videoTrack);
        }
      }
    }
    
    log(`Peer connection setup complete for ${userId}`);
    return pc;
    
  } catch (error) {
    log(`Failed to create peer connection for ${userId}: ${error.message}`);
    console.error(`Error creating peer connection for ${userId}:`, error);
    
    // Clean up if we had a partial creation
    if (peerConnections[userId]) {
      try {
        peerConnections[userId].close();
      } catch (closeError) {
        // Ignore close errors
      }
      delete peerConnections[userId];
    }
    
    // Notify user
    updateConnectionStatus('Connection setup failed');
    return null;
  }
}

// Create an offer for a specific peer
async function createOffer(userId) {
  try {
    const pc = peerConnections[userId];
    if (!pc) {
      log(`Cannot create offer: No peer connection for ${userId}`);
      return;
    }
    
    log(`Creating offer for ${userId}`);
    const offer = await pc.createOffer();
    
    log(`Setting local description for ${userId}`);
    await pc.setLocalDescription(offer);
    
    log(`Sending offer to ${userId}`);
    socket.emit('offer', userId, offer);
  } catch (error) {
    log(`Error creating offer for ${userId}: ${error.message}`);
    console.error(`Error creating offer for ${userId}:`, error);
  }
}

// Generate a random room ID
function generateRoomId() {
  return Math.random().toString(36).substring(2, 7);
}

// Start the application
window.addEventListener('load', init); 