const { Server } = require("socket.io");
const http = require("http");
const express = require("express");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: function (origin, callback) {
      const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5173"].filter(Boolean);
      if (!origin) return callback(null, true);
      const isAllowed = allowedOrigins.some(allowed => {
        return allowed.replace(/\/$/, "") === origin.replace(/\/$/, "");
      });
      callback(null, isAllowed);
    },
    credentials: true,
  },
});

// UserID aur unki current SocketIDs ko save karne ke liye 'Phonebook'
const userSocketMap = {}; // {userId: [socketId1, socketId2]}

// Helper to get online users
function getOnlineUserIds() {
  return Object.keys(userSocketMap);
}

io.on("connection", (socket) => {
  const userId = socket.handshake.query.userId;
  
  if (userId && userId !== "undefined") {
    console.log(`👤 User joined: ${userId} (Socket: ${socket.id})`);
    
    // Join a room named after the userId for multi-tab delivery
    socket.join(userId);

    // Add to online map
    if (!userSocketMap[userId]) {
      userSocketMap[userId] = [];
    }
    userSocketMap[userId].push(socket.id);

    // Update everyone
    io.emit("getOnlineUsers", getOnlineUserIds());
  } else {
    console.log("⚠️ A user connected without a valid userId");
  }

  socket.on("disconnect", () => {
    if (userId && userSocketMap[userId]) {
      console.log(`👋 User left: ${userId} (Socket: ${socket.id})`);
      
      // Remove this specific socket ID
      userSocketMap[userId] = userSocketMap[userId].filter(id => id !== socket.id);
      
      // If no more sockets are connected for this user, delete the user from the map
      if (userSocketMap[userId].length === 0) {
        delete userSocketMap[userId];
      }
      
      // Update everyone
      io.emit("getOnlineUsers", getOnlineUserIds());
    }
  });

  // Handle errors
  socket.on("error", (err) => {
    console.error("Socket error: ", err);
  });
});

module.exports = { io, app, server };
