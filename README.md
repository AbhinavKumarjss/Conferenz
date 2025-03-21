# Conferenz

A simple peer-to-peer video chat application built using WebRTC, Socket.io, and Express.

## Features

- Create or join rooms for video calls
- Real-time peer-to-peer video and audio communication
- Mute audio and toggle video
- Simple, responsive UI
- Copy room ID to clipboard for easy sharing

## Technologies Used

- WebRTC for peer-to-peer connections
- Socket.io for signaling
- Express for the web server
- HTML, CSS, and JavaScript for the frontend

## Prerequisites

- Node.js (v14 or later recommended)
- npm (comes with Node.js)

## Installation

1. Clone this repository or download the code
2. Navigate to the project directory
3. Install dependencies:
   ```
   npm install
   ```

## Running the Application

1. Start the server:
   ```
   npm start
   ```
   
2. Open your browser and go to `http://localhost:3000`

3. Create a new room or join an existing one by entering a room ID

## Usage

1. When you first access the application, you'll need to allow access to your camera and microphone
2. You can create a new room by clicking "Create New Room" or join an existing room by entering a room ID and clicking "Join Room"
3. To invite others, copy the room ID and share it with them
4. Use the control buttons to:
   - Mute/unmute your audio
   - Turn your video on/off
   - Leave the call

## Browser Support

This application works best in modern browsers that support WebRTC:
- Chrome (desktop and Android)
- Firefox (desktop and Android)
- Safari (desktop and iOS)
- Edge (Chromium-based)

## Notes

- The application uses public STUN servers from Google. For production use, consider using your own TURN servers for better connectivity through firewalls.
- This is a simple implementation for educational purposes. For production, additional features like security, proper error handling, and testing should be implemented. #   C o n f e r e n z  
 #   C o n f e r e n z  
 