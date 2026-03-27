const express = require('express');
const chatbotController = require('../controllers/chatbotController');
const { protectedRoute } = require('../middlewares/authMiddleware');

const ChatbotRouter = express.Router();

/**
 * AI Endpoints
 */

// 1. Get Summary of last 10 messages from a chat
ChatbotRouter.get("/summarize/:id", protectedRoute, chatbotController.summarizeChat);

// 2. Chat with AI (Advanced Talks API)
ChatbotRouter.post("/talk", protectedRoute, chatbotController.getAiTalk);

module.exports = ChatbotRouter;
