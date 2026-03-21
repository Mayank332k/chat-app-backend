const bcrypt = require("bcrypt");
const cloudinary = require("../lib/cloudinary");
const jwt = require("jsonwebtoken");
const User = require("../models/userSchema");

exports.registerUser = async (req, res) => {
    try {
        const { username, fullName, password } = req.body;

        if (!username || !fullName || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const userExists = await User.findOne({ username });
        if (userExists) {
            return res.status(400).json({ message: "User already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        let profilePicUrl = "";

        if (req.file) {
            const uploadPromise = new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: "chat_app_profiles" },
                    (error, result) => {
                        if (error) reject(error);
                        else resolve(result.secure_url);
                    }
                );
                uploadStream.end(req.file.buffer);
            });

            profilePicUrl = await uploadPromise;
        }

        const newUser = await User.create({
            username,
            fullName,
            password: hashedPassword,
            profilePic: profilePicUrl || undefined
        });

        res.status(201).json({
            message: "User registered successfully!",
            user: {
                id: newUser._id,
                username: newUser.username,
                fullName: newUser.fullName,
                profilePic: newUser.profilePic
            }
        });

    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.loginUser = async (req, res) => {
    try {
        const { username, password } = req.body;
        if (!username || !password) {
            return res.status(400).json({ message: "All fields are required" });
        }

        const user = await User.findOne({ username });
        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        const isPasswordValid = await bcrypt.compare(password, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({ message: "Invalid password" });
        }

        // Token generation
        const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, { expiresIn: "1h" });
        
        // Setting Token in HttpOnly Cookie (More Secure)
        res.cookie("jwt", token, {
            httpOnly: true, 
            secure: process.env.NODE_ENV === "production", 
            sameSite: "strict", 
            maxAge: 3600000 
        });

        res.status(200).json({
            message: "Logged in successfully",
            user: {
                id: user._id,
                username: user.username,
                fullName: user.fullName,
                profilePic: user.profilePic
            }
        });


    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};




exports.logoutUser = async (req, res) => {
    try {
        res.cookie("jwt", "", { maxAge: 0 });
        res.status(200).json({ message: "Logged out successfully" });
        
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
};

exports.checkAuth = (req, res) => {
    try {
        res.status(200).json(req.user);
    } catch (error) {
        console.log("Error in checkAuth controller", error.message);
        res.status(500).json({ message: "Internal Server Error" });
    }
}