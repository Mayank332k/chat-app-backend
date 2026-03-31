const mongoose = require("mongoose");
const Message = require("../models/messageSchema");
const User = require("../models/userSchema");
const cloudinary = require("../lib/cloudinary");
const { io } = require("../lib/socket");
const { getOrCreateAiAgent } = require("./chatbotController");

exports.getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;

    await getOrCreateAiAgent();

    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");
    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const senderId = req.user._id;

    const conversation = await Message.find({
      $or: [
        { senderId: senderId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: senderId },
      ],
      deletedBy: { $ne: senderId }, // Filter out messages deleted for me
    }).sort({ createdAt: 1 });

    res.status(200).json(conversation);
  } catch (error) {
    console.error("Error in getMessages: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


exports.sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    const aiAgent = await getOrCreateAiAgent();
    const isAiReceiver = receiverId.toString() === aiAgent._id.toString();

    let imageUrl = "";

    if (req.file) {
      const uploadPromise = new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { folder: "chat_messages" },
          (error, result) => {
            if (error) reject(error);
            else resolve(result.secure_url);
          }
        );
        uploadStream.end(req.file.buffer);
      });

      imageUrl = await uploadPromise;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl || undefined,
    });

    await newMessage.save();

    // Real-time delivery to receiver only (sender gets data from HTTP response)
    io.to(receiverId).emit("newMessage", newMessage);

    if (isAiReceiver) {
      const { getAiTalkForIntegration } = require("./chatbotController");
      if (typeof getAiTalkForIntegration === "function") {
        getAiTalkForIntegration(senderId, text);
      }
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" }); 
  }
};



exports.markMessagesAsRead = async (req, res) => {
  try {
    const { id: senderId } = req.params;
    const receiverId = req.user._id;

    await Message.updateMany(
      { senderId: senderId, receiverId: receiverId, isRead: false },
      { $set: { isRead: true } }
    );

    const eventPayload = {
      senderId: senderId.toString(),
      receiverId: receiverId.toString(),
    };

    io.to(senderId.toString()).to(receiverId.toString()).emit("messagesRead", eventPayload);

    res.status(200).json({ message: "Messages marked as read" });
  } catch (error) {
    console.error("Error in markMessagesAsRead: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};



exports.clearChat = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const senderId = req.user._id;

    await Message.updateMany(
      {
        $or: [
          { senderId: senderId, receiverId: userToChatId },
          { senderId: userToChatId, receiverId: senderId },
        ],
        deletedBy: { $ne: senderId },
      },
      { $addToSet: { deletedBy: senderId } }
    );

    res.status(200).json({ message: "Chat cleared successfully for you" });
  } catch (error) {
    console.error("Error in clearChat: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};


exports.deleteMessageForMe = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID" });
    }

    const message = await Message.findByIdAndUpdate(
      messageId,
      { $addToSet: { deletedBy: userId } },
      { returnDocument: 'after' }
    );

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.status(200).json({ message: "Message deleted for you", messageId });
  } catch (error) {
    console.error("Error in deleteMessageForMe: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

exports.deleteMessageForEveryone = async (req, res) => {
  try {
    const { id: messageId } = req.params;
    const userId = req.user._id;

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: "Invalid message ID" });
    }

    const message = await Message.findOne({ _id: messageId, senderId: userId });

    if (!message) {
      return res.status(404).json({ error: "Message not found or you are not the sender" });
    }

    message.isDeletedForEveryone = true;
    message.text = "Deleted message";
    message.image = undefined;
    
    await message.save();

    const receiverId = message.receiverId.toString();
    io.to(receiverId).emit("messageDeletedForEveryone", { messageId });
    io.to(userId.toString()).emit("messageDeletedForEveryone", { messageId });

    res.status(200).json({ message: "Message deleted for everyone", messageId });
  } catch (error) {
    console.error("Error in deleteMessageForEveryone: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};