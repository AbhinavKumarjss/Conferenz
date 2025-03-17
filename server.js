const express = require('express');
const http = require('http');
const app = express();
const server = http.createServer(app);
const io = require('socket.io')(server);
const PORT = process.env.PORT || 3000;
const { v4: uuidv4 } = require('uuid');

// Room state tracking
const rooms = {};

// Serve static files
app.use(express.static('public'));

// Socket.io connection handling
io.on('connection', (socket) => {
  console.log(`New connection: ${socket.id}`);
  let currentRoom = null;
  let userData = {
    id: socket.id,
    displayName: '',
    isAdmin: false,
    audioEnabled: true,
    videoEnabled: true,
    shareScreen: false
  };

  // Handle joining a room
  socket.on('join-room', (roomId, userInfo) => {
    // Store user data
    userData.displayName = userInfo.displayName || `User-${socket.id.substring(0, 4)}`;
    
    console.log(`User ${userData.displayName} (${socket.id}) joining room ${roomId}`);
    
    // Create room if it doesn't exist
    if (!rooms[roomId]) {
      rooms[roomId] = {
        id: roomId,
        users: [],
        userMap: {},
        messages: [],
        createdAt: new Date(),
        password: userInfo.password || null,
        adminId: socket.id
      };
      console.log(`Created new room: ${roomId}${rooms[roomId].password ? ' (password protected)' : ''}`);
      userData.isAdmin = true;
    }
    
    // Check password if room is protected
    if (rooms[roomId].password && rooms[roomId].password !== userInfo.password) {
      socket.emit('join-rejected', { reason: 'incorrect-password' });
      return;
    }
    
    // Join the room
    currentRoom = roomId;
    socket.join(roomId);
    
    // Store user in room
    rooms[roomId].users.push(userData.id);
    rooms[roomId].userMap[socket.id] = userData;
    
    console.log(`Room ${roomId} now has ${rooms[roomId].users.length} users`);
    
    // Send room info back to user
    socket.emit('room-joined', {
      roomId,
      isAdmin: userData.isAdmin,
      participants: Object.values(rooms[roomId].userMap),
      messages: rooms[roomId].messages
    });
    
    // Let other users in the room know about the new user
    socket.to(roomId).emit('user-connected', userData);

    // Handle disconnect
    socket.on('disconnect', handleDisconnect);
  });

  // Handle user disconnection
  function handleDisconnect() {
    if (!currentRoom || !rooms[currentRoom]) return;
    
    console.log(`User ${userData.displayName} (${socket.id}) disconnected from room ${currentRoom}`);
    
    // Remove user from room data
    rooms[currentRoom].users = rooms[currentRoom].users.filter(id => id !== socket.id);
    delete rooms[currentRoom].userMap[socket.id];
    
    // Let others know
    socket.to(currentRoom).emit('user-disconnected', socket.id);
    
    // If room is empty, clean it up
    if (rooms[currentRoom].users.length === 0) {
      console.log(`Room ${currentRoom} is now empty, cleaning up`);
      delete rooms[currentRoom];
    } else {
      // If admin left, assign new admin
      if (userData.isAdmin && rooms[currentRoom]) {
        const newAdminId = rooms[currentRoom].users[0];
        if (newAdminId) {
          rooms[currentRoom].adminId = newAdminId;
          rooms[currentRoom].userMap[newAdminId].isAdmin = true;
          io.to(currentRoom).emit('admin-changed', { newAdminId });
        }
      }
      console.log(`Room ${currentRoom} now has ${rooms[currentRoom].users.length} users`);
    }
    
    // Clear user state
    currentRoom = null;
  }

  // Handle user media status changes
  socket.on('media-status', (status) => {
    if (!currentRoom || !rooms[currentRoom] || !rooms[currentRoom].userMap[socket.id]) return;
    
    const { audioEnabled, videoEnabled } = status;
    rooms[currentRoom].userMap[socket.id].audioEnabled = audioEnabled;
    rooms[currentRoom].userMap[socket.id].videoEnabled = videoEnabled;
    
    socket.to(currentRoom).emit('user-media-status', {
      userId: socket.id,
      audioEnabled,
      videoEnabled
    });
  });

  // Handle chat messages
  socket.on('chat-message', (message) => {
    if (!currentRoom) return;
    
    const newMessage = {
      id: uuidv4(),
      sender: socket.id,
      senderName: userData.displayName,
      content: message,
      timestamp: new Date()
    };
    
    // Store message
    if (rooms[currentRoom]) {
      rooms[currentRoom].messages.push(newMessage);
      
      // Keep only last 100 messages
      if (rooms[currentRoom].messages.length > 100) {
        rooms[currentRoom].messages.shift();
      }
    }
    
    // Broadcast to room
    io.to(currentRoom).emit('new-message', newMessage);
  });

  // Screen sharing signals
  socket.on('screen-sharing-start', () => {
    if (!currentRoom) return;
    rooms[currentRoom].userMap[socket.id].shareScreen = true;
    socket.to(currentRoom).emit('user-screen-share', { userId: socket.id, isSharing: true });
  });

  socket.on('screen-sharing-stop', () => {
    if (!currentRoom) return;
    rooms[currentRoom].userMap[socket.id].shareScreen = false;
    socket.to(currentRoom).emit('user-screen-share', { userId: socket.id, isSharing: false });
  });

  // Forward signaling data (offer, answer, ICE candidates)
  socket.on('offer', (targetId, offer) => {
    if (!currentRoom) return;
    console.log(`Offer from ${userData.displayName} to ${targetId}`);
    socket.to(targetId).emit('offer', { 
      from: socket.id,
      offer
    });
  });

  socket.on('answer', (targetId, answer) => {
    if (!currentRoom) return;
    console.log(`Answer from ${userData.displayName} to ${targetId}`);
    socket.to(targetId).emit('answer', {
      from: socket.id,
      answer
    });
  });

  socket.on('ice-candidate', (targetId, candidate) => {
    if (!currentRoom) return;
    // Log ICE candidate type to help with debugging
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
    
    console.log(`ICE candidate (${candidateType}) from ${userData.displayName} to ${targetId}`);
    socket.to(targetId).emit('ice-candidate', {
      from: socket.id,
      candidate
    });
  });
});

// Get room info API
app.get('/api/room/:roomId', (req, res) => {
  const roomId = req.params.roomId;
  const room = rooms[roomId];
  
  res.json({
    exists: !!room,
    isPasswordProtected: room ? !!room.password : false
  });
});

// Public room list API (excludes password-protected rooms)
app.get('/api/rooms', (req, res) => {
  const roomList = Object.values(rooms)
    .map(room => ({
      id: room.id,
      userCount: room.users.length,
      createdAt: room.createdAt,
      isPasswordProtected: !!room.password
    }));
  
  res.json(roomList);
});

server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
}); 