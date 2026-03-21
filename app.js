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
const allowedOrigins = [process.env.FRONTEND_URL, "http://localhost:5173"].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl)
        if (!origin) return callback(null, true);
        
        const isAllowed = allowedOrigins.some(allowed => {
            const normalizedAllowed = allowed.replace(/\/$/, "");
            const normalizedOrigin = origin.replace(/\/$/, "");
            return normalizedAllowed === normalizedOrigin;
        });

        if (isAllowed) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
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
