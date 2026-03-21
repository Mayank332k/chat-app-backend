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

module.exports = router;
