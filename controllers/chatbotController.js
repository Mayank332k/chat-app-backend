const Message = require("../models/messageSchema");
const User = require("../models/userSchema");


// 1. Summarize the last 10 messages of a specific chat
exports.summarizeChat = async (req, res) => {
    try {
        const { id: partnerId } = req.params;
        const userId = req.user._id;

        // Fetch last 10 messages from the conversation
        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: partnerId },
                { senderId: partnerId, receiverId: userId },
            ],
        })
        .sort({ createdAt: -1 })
        .limit(10);

        if (!messages || messages.length === 0) {
            return res.status(200).json({ summary: "No conversation history found to summarize." });
        }

        // Format history for the AI model
        const conversationText = messages
            .reverse()
            .map(m => `${m.senderId.toString() === userId.toString() ? "User" : "Partner"}: ${m.text}`)
            .join("\n");

        // Integrating with AI Model (e.g., Sarvam or Gemini)
        const summary = await callAiModel({
            prompt: `Summarize this chat history briefly:\n\n${conversationText}`,
            systemPrompt: "You are a helpful assistant that summarizes chat messages."
        });

        res.status(200).json({ summary });
    } catch (error) {
        console.error("Error in summarizeChat:", error.message);
        res.status(500).json({ error: "Failed to summarize chat. Internal server error." });
    }
};


exports.getAiTalk = async (req, res) => {
    try {
        const { text } = req.body;
        const userId = req.user._id;

        if (!text) {
            return res.status(400).json({ error: "Message text is required" });
        }

        const aiResponseText = await callAiModel({
            prompt: text,
            systemPrompt: "You are an advanced AI chatbot designed for high-quality, engaging conversations."
        });

        res.status(200).json({
            reply: aiResponseText,
            timestamp: new Date()
        });
    } catch (error) {
        console.error("Error in getAiTalk:", error.message);
        res.status(500).json({ error: "Failed to fetch AI response. Internal server error." });
    }
};


async function callAiModel({ prompt, systemPrompt }) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    try {

        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "stepfun/step-3.5-flash:free", 
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: prompt }
                ],
            }),
        });

        const data = await response.json();
        return data.choices?.[0]?.message?.content || "The AI was unable to generate a response.";
    } catch (err) {
        console.error("AI Model Call Error:", err);
        throw new Error("AI Model integration failed.");
    }
}
