require("dotenv").config();
const express = require("express");
const cors = require('cors');
const cookieParser = require('cookie-parser');
const connectDB = require("./lib/db");
const authRoutes = require("./routers/authRoutes");
const messageRoutes = require("./routers/messageRoutes");

const { app, server } = require("./lib/socket");

const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors({
    origin: "http://localhost:5173",
    credentials: true
}));

app.use(express.json());
app.use(cookieParser());

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/messages", messageRoutes);

// Database connection & Server start
connectDB().then(() => {
    server.listen(PORT, () => {
        console.log(`🚀 Server started on port ${PORT}`);
    });
}).catch(err => {
    console.log("DB connection error: ", err);
});
