const express = require('express');
const messageController = require('../controllers/messageController');
const { protectedRoute } = require('../middlewares/authMiddleware');

const MessageRouter = express.Router();

// Sidebar users
MessageRouter.get("/users", protectedRoute, messageController.getUsersForSidebar);

// Get chat history
MessageRouter.get("/:id", protectedRoute, messageController.getMessages);

// Send message
MessageRouter.post("/send/:id", protectedRoute, messageController.sendMessage);

module.exports = MessageRouter;