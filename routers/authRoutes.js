const express = require("express");
const authController = require("../controllers/authController");
const upload = require("../lib/multer");
const { protectedRoute } = require("../middlewares/authMiddleware");

const router = express.Router();

// Register Route
router.post("/register", upload.single("profilePic"), authController.registerUser);

// Login Route
router.post("/login", authController.loginUser);

// Logout Route
router.post("/logout", authController.logoutUser);

// Check Auth Route
router.get("/check", protectedRoute, authController.checkAuth);

// Update Profile Route
router.put("/update-profile", protectedRoute, upload.single("profilePic"), authController.updateProfile);

// Update Password Route
router.put("/update-password", protectedRoute, authController.updatePassword);

module.exports = router;
