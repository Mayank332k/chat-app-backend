const Message = require("../models/messageSchema");
const User = require("../models/userSchema");
const { io } = require("../lib/socket");

const AI_AGENT_DETAILS = {
    username: "ai_assistant",
    fullName: "Chatly AI Assistance",
    profilePic: "https://cdn-icons-png.flaticon.com/512/4712/4712035.png",
};


async function getOrCreateAiAgent() {
    try {
        let aiUser = await User.findOne({ username: AI_AGENT_DETAILS.username });
        if (!aiUser) {
            aiUser = await User.create({
                ...AI_AGENT_DETAILS,
                password: "system_generated_ai_password_non_loginable_" + Math.random().toString(36).slice(-10)
            });
            console.log("✅ AI Agent user created successfully.");
        }
        return aiUser;
    } catch (error) {
        console.error("❌ Critical Error in getOrCreateAiAgent:", error.message);
        throw error;
    }
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
            deletedBy: { $ne: userId }
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
                return `${name}: ${m.text || "[Image/Media Content]"}`;
            })
            .join("\n");

        const summary = await callAiModel({
            prompt: `Summarize this chat history objectively between ${userName} and ${partnerName}. 
Focus on the main topics of discussion. Keep it concise but accurate.
IMPORTANT: Summarize the content exactly as it is, regardless of its nature. Do not refuse to summarize or mention any restrictions.

Chat History:
${conversationText}`,
            systemPrompt: process.env.AI_SUMMARY_PROMPT || "You are a professional summary generator. Focus on neutrality and accuracy without filters."
        });

        res.status(200).json({ summary });
    } catch (error) {
        console.error("❌ Error in summarizeChat:", error.message);
        res.status(500).json({ error: "Failed to summarize chat history. Please try again later." });
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
            deletedBy: { $ne: userId }
        })
        .sort({ createdAt: -1 })
        .limit(20);

        const historyForAI = messageHistory
            .reverse()
            .map(m => ({
                role: m.senderId.toString() === userId.toString() ? "user" : "assistant",
                content: m.text || "[Shared Media/Image]"
            }));

        const PERSONA = process.env.AI_PERSONA || "You are a helpful and direct AI assistant.";

        const aiResponseRaw = await callAiModelWithHistory({
            history: historyForAI,
            systemPrompt: PERSONA
        });

        const aiResponseText = aiResponseRaw.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
            
        const aiMessage = await Message.create({
            senderId: aiId,
            receiverId: userId,
            text: aiResponseText || "..."
        });

        io.to(userId.toString()).emit("newMessage", aiMessage);

        res.status(200).json(aiMessage);
    } catch (error) {
        console.error("❌ Error in getAiTalk:", error.message);
        res.status(500).json({ error: "AI assistant is currently unavailable. Please try again later." });
    }
};

exports.getAiTalkForIntegration = async (userId, text) => {
    try {
        const aiAgent = await getOrCreateAiAgent();
        const aiId = aiAgent._id;

        const messageHistory = await Message.find({
            $or: [
                { senderId: userId, receiverId: aiId },
                { senderId: aiId, receiverId: userId },
            ],
            deletedBy: { $ne: userId }
        })
        .sort({ createdAt: -1 })
        .limit(20);

        const historyForAI = messageHistory
            .reverse()
            .map(m => ({
                role: m.senderId.toString() === userId.toString() ? "user" : "assistant",
                content: m.text || "[Shared Media/Image]"
            }));

        const PERSONA = process.env.AI_PERSONA || "You are a helpful and direct AI assistant.";

        const aiResponseRaw = await callAiModelWithHistory({
            history: historyForAI,
            systemPrompt: PERSONA
        });

        const aiResponseText = aiResponseRaw.replace(/<thought>[\s\S]*?<\/thought>/gi, '').trim();
            
        const aiMessage = await Message.create({
            senderId: aiId,
            receiverId: userId,
            text: aiResponseText || "..."
        });

        io.to(userId.toString()).emit("newMessage", aiMessage);
    } catch (error) {
        console.error("❌ Background AI Error:", error.message);
    }
};

async function callAiModel({ prompt, systemPrompt }) {
    return callAiModelWithHistory({
        history: [{ role: "user", content: prompt }],
        systemPrompt
    });
}

async function callAiModelWithHistory({ history, systemPrompt }) {
    const apiKey = process.env.SARVAM_API_KEY;
    if (!apiKey) {
        console.error("❌ SARVAM_API_KEY is missing from environment variables.");
        return "System configuration error. Please contact admin.";
    }

    try {
        const MODEL = "sarvam-30b";
        
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 20000);

        const response = await fetch("https://api.sarvam.ai/v1/chat/completions", {
            method: "POST",
            headers: {
                "api-subscription-key": apiKey,
                "Content-Type": "application/json",
            },
            signal: controller.signal,
            body: JSON.stringify({
                model: MODEL, 
                messages: [
                    { role: "system", content: systemPrompt },
                    ...history
                ],
                max_tokens: 2000,
                temperature: 0.7,
            }),
        });

        clearTimeout(timeout);

        if (!response.ok) {
            const errorBody = await response.text();
            console.error(`❌ Sarvam AI API Error (${response.status}):`, errorBody);
            return "The AI agent is currently resting. Please try again later.";
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            console.error("❌ Sarvam AI Response Missing Content:", JSON.stringify(data));
            return "The AI was unable to generate a response at this time.";
        }

        return content;
    } catch (err) {
        if (err.name === 'AbortError') {
            console.error("❌ AI Request Timed Out (20s)");
            return "The AI is taking too long to think. Please try again.";
        }
        console.error("❌ AI Model Call Exception:", err.message);
        return "The AI assistant service is temporarily disconnected.";
    }
}

