const Message = require("../models/messageSchema");
const User = require("../models/userSchema");
const cloudinary = require("../lib/cloudinary");
const { getReceiverSocketId, io } = require("../lib/socket");

// 1. Sidebar ke liye users ki list
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

// 2. Chat history dhoondna
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

// 3. Naya message bhejna (Real-time update ke saath)
exports.sendMessage = async (req, res) => {
  try {
    const { text, image } = req.body;
    const { id: receiverId } = req.params;
    const senderId = req.user._id;

    let imageUrl;
    if (image) {
      // Base64 image ko Cloudinary pe upload karna
      const uploadResponse = await cloudinary.uploader.upload(image);
      imageUrl = uploadResponse.secure_url;
    }

    const newMessage = new Message({
      senderId,
      receiverId,
      text,
      image: imageUrl,
    });

    await newMessage.save();

    // === REAL-TIME SOCKET LOGIC ===
    const receiverSocketId = getReceiverSocketId(receiverId);
    
    // Agar receiver online hai, toh use turant notification/message bhej do
    if (receiverSocketId) {
      // 'io.to()' sirf us ek specific socket (receiver) ko message bhejta hai
      io.to(receiverSocketId).emit("newMessage", newMessage);
    }

    res.status(201).json(newMessage);
  } catch (error) {
    console.log("Error in sendMessage: ", error.message);
    res.status(500).json({ error: "Internal server error" });
  }
};
