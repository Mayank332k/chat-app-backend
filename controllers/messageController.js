const Message = require("../models/messageSchema");
const User = require("../models/userSchema");
const cloudinary = require("../lib/cloudinary");
const { io } = require("../lib/socket");

// 1. Sidebar ke liye 
exports.getUsersForSidebar = async (req, res) => {
  try {
    const loggedInUserId = req.user._id;
    const filteredUsers = await User.find({ _id: { $ne: loggedInUserId } }).select("-password");
    res.status(200).json(filteredUsers);
  } catch (error) {
    console.error("Error in getUsersForSidebar: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};

// for chat history
exports.getMessages = async (req, res) => {
  try {
    const { id: userToChatId } = req.params;
    const senderId = req.user._id;

    const conversation = await Message.find({
      $or: [
        { senderId: senderId, receiverId: userToChatId },
        { senderId: userToChatId, receiverId: senderId },
      ],
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


    io.to(receiverId).emit("newMessage", newMessage);

    // Deliver to the sender's OTHER tabs (so they stays in sync)
    io.to(senderId).emit("newMessage", newMessage);

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

    // Update all unread messages from this sender to the current user
    await Message.updateMany(
      { senderId: senderId, receiverId: receiverId, isRead: false },
      { $set: { isRead: true } }
    );

    // Notify BOTH the sender and the receiver (multi-tab sync)
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
