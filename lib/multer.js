const multer = require("multer");

// Memory Storage setup taaki file seedha humein buffer mein mile
const storage = multer.memoryStorage();

const upload = multer({ 
    storage,
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit rakha hai images ke liye
});

module.exports = upload;
