const express = require('express');
const router = express.Router();
const Post = require('../models/post-model');
const alumniModel = require('../models/alumni-model');
const isLoggedIn = require('../middlewares/isLoggedin');
const multer = require("multer");

// Use memoryStorage to handle files as buffers, which is ideal for storing in MongoDB
const storage = multer.memoryStorage();
const upload = multer({ storage });

/**
 * @route   POST /post
 * @desc    Create a new post
 * @access  Private (Alumni)
 */
router.post("/", isLoggedIn, upload.single("image"), async (req, res) => {
    try {
        const newPost = new Post({
            content: req.body.content,
            author: req.user._id,
        });

        if (req.file) {
            newPost.image = req.file.buffer; // Save image as a Buffer
        }

        await newPost.save();

        // CORRECTION: After creating the post, add its ID to the author's posts array.
        // This keeps the user's post list in sync.
        await alumniModel.findByIdAndUpdate(req.user._id, { $push: { posts: newPost._id } });

        res.redirect(`/${req.user.role}/dashboard`);
    } catch (err) {
        console.error("❌ Error creating post:", err);
        res.status(500).send("Server Error");
    }
});

/**
 * @route   POST /post/like/:id
 * @desc    Like or unlike a post
 * @access  Private
 */
router.post('/like/:id', isLoggedIn, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });

        const userId = req.user._id;
        const idx = post.likes.findIndex(id => String(id) === String(userId));

        let liked;
        if (idx === -1) {
            post.likes.push(userId);
            liked = true;
        } else {
            post.likes.splice(idx, 1);
            liked = false;
        }

        await post.save();

        // This route correctly sends JSON back, which is great for client-side updates
        res.json({ liked, likesCount: post.likes.length });
    } catch (err) {
        console.error("❌ Error liking post:", err);
        res.status(500).json({ error: "Server error" });
    }
});

/**
 * @route   GET /post/edit/:id
 * @desc    Show the form to edit a post
 * @access  Private (Author only)
 */
router.get('/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).populate("author");
        if (!post) return res.status(404).send("Post not found");

        // Authorization check: ensure the logged-in user is the post author
        if (String(post.author._id) !== String(req.user._id)) {
            return res.status(403).send("Unauthorized");
        }

        res.render("edit-post", { post, user: req.user }); // Pass user object for consistency
    } catch (err) {
        console.error("❌ Error fetching post for edit:", err);
        res.status(500).send("Server error");
    }
});

/**
 * @route   POST /post/edit/:id
 * @desc    Update a post
 * @access  Private (Author only)
 */
// CORRECTION: Added multer middleware 'upload.single("image")' to handle file uploads on this route.
router.post('/edit/:id', isLoggedIn, upload.single("image"), async (req, res) => {
    try {
        const content = req.body.content.trim();
        const post = await Post.findById(req.params.id);

        if (!post) return res.status(404).send("Post not found");
        if (String(post.author) !== String(req.user._id)) {
            return res.status(403).send("Unauthorized");
        }

        post.content = content;

        // CORRECTION: Check if a new file was uploaded and update the post's image buffer.
        if (req.file) {
            post.image = req.file.buffer;
        }

        await post.save();

        res.redirect('/alumni/dashboard');
    } catch (err) {
        console.error("❌ Error editing post:", err);
        res.status(500).send("Server error");
    }
});

/**
 * @route   POST /post/delete/:id
 * @desc    Delete a post
 * @access  Private (Author only)
 */
router.post('/delete/:id', isLoggedIn, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).send("Post not found");

        if (String(post.author) !== String(req.user._id)) {
            return res.status(403).send("Unauthorized");
        }

        await Post.findByIdAndDelete(req.params.id);

        // Also remove from alumni.posts array to maintain data integrity
        await alumniModel.findByIdAndUpdate(req.user._id, { $pull: { posts: req.params.id } });

        res.redirect('/alumni/dashboard');
    } catch (err) {
        console.error("❌ Error deleting post:", err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
