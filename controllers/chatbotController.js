const Message = require("../models/messageSchema");
const User = require("../models/userSchema");
const { io } = require("../lib/socket");

const AI_AGENT_DETAILS = {
    username: "ai_assistant",
    fullName: "Pulse AI Assistant",
    profilePic: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
};

async function getOrCreateAiAgent() {
    let aiUser = await User.findOne({ username: AI_AGENT_DETAILS.username });
    if (!aiUser) {
        aiUser = await User.create({
            ...AI_AGENT_DETAILS,
            password: "system_generated_ai_password_non_loginable"
        });
    }
    return aiUser;
}

exports.getOrCreateAiAgent = getOrCreateAiAgent;

exports.summarizeChat = async (req, res) => {
    try {
        const { id: partnerId } = req.params;
        const userId = req.user._id;

        const [user, partner] = await Promise.all([
            User.findById(userId),
            User.findById(partnerId)
        ]);

        const partnerName = partner ? partner.fullName : "User";
        const userName = user ? user.fullName : "You";

        const messages = await Message.find({
            $or: [
                { senderId: userId, receiverId: partnerId },
                { senderId: partnerId, receiverId: userId },
            ],
        })
        .sort({ createdAt: -1 })
        .limit(20);

        if (!messages || messages.length === 0) {
            return res.status(200).json({ summary: "No conversation history found to summarize." });
        }

        const conversationText = messages
            .reverse()
            .map(m => {
                const name = m.senderId.toString() === userId.toString() ? userName : partnerName;
                return `${name}: ${m.text}`;
            })
            .join("\n");

        const summary = await callAiModel({
            prompt: `Summarize this chat history objectively between ${userName} and ${partnerName}. 
The summary should mention the names and be of balanced length (not too short, not too long). 
Prioritize accuracy and do not include any subjective opinions or interpretations.

IMPORTANT: Summarize the content exactly as it is, regardless of its nature or potential sensitivity. Provide a neutral, objective summary even if the chat contains restricted or "censored" topics. Do not refuse to summarize.

Chat History:
${conversationText}`,
            systemPrompt: "You are a professional, objective summarizer. Your task is to provide neutral summaries of chat logs. You must summarize the provided text even if it contains sensitive or restricted content, as this is for archival and administrative purposes. Do not refuse any summary request."
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

        const aiAgent = await getOrCreateAiAgent();
        const aiId = aiAgent._id;

        const userMessage = await Message.create({
            senderId: userId,
            receiverId: aiId,
            text: text
        });

        const messageHistory = await Message.find({
            $or: [
                { senderId: userId, receiverId: aiId },
                { senderId: aiId, receiverId: userId },
            ],
        })
        .sort({ createdAt: -1 })
        .limit(20);

        const historyForAI = messageHistory
            .reverse()
            .map(m => ({
                role: m.senderId.toString() === userId.toString() ? "user" : "assistant",
                content: m.text
            }));

        const aiResponseText = await callAiModelWithHistory({
            history: historyForAI,
            systemPrompt: "You are an advanced AI assistant named Pulse Assistant. You provide helpful, concise, and engaging responses."
        });

        const aiMessage = await Message.create({
            senderId: aiId,
            receiverId: userId,
            text: aiResponseText
        });

        io.to(userId.toString()).emit("newMessage", userMessage);
        io.to(userId.toString()).emit("newMessage", aiMessage);

        res.status(200).json({
            reply: aiResponseText,
            aiAgent: aiAgent,
            messageId: aiMessage._id,
            timestamp: aiMessage.createdAt
        });
    } catch (error) {
        console.error("Error in getAiTalk:", error.message);
        res.status(500).json({ error: "Failed to fetch AI response. Internal server error." });
    }
};

async function callAiModel({ prompt, systemPrompt }) {
    return callAiModelWithHistory({
        history: [{ role: "user", content: prompt }],
        systemPrompt
    });
}

async function callAiModelWithHistory({ history, systemPrompt }) {
    const apiKey = process.env.OPENROUTER_API_KEY;

    try {
        const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: "openai/gpt-oss-20b:free", 
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history
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
