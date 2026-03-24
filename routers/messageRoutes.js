const express = require('express');
const messageController = require('../controllers/messageController');
const { protectedRoute } = require('../middlewares/authMiddleware');
const upload = require("../lib/multer");

const MessageRouter = express.Router();

// Sidebar users
MessageRouter.get("/users", protectedRoute, messageController.getUsersForSidebar);

// Get chat history
MessageRouter.get("/:id", protectedRoute, messageController.getMessages);

// Send message (Handles text and images)
MessageRouter.post("/send/:id", protectedRoute, upload.single("image"), messageController.sendMessage);

// Mark messages as read
MessageRouter.put("/read/:id", protectedRoute, messageController.markMessagesAsRead);

module.exports = MessageRouter;