const mongoose = require("mongoose");
// to handshake with mongoDB

const connectDB = async () => {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log("MongoDB connected successfully");
    } catch (err) {
        console.error("MongoDB connection failed");
        console.error(err.message);
        process.exit(1);
    }
};

module.exports = connectDB;
