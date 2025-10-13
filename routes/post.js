const express = require('express');
const router = express.Router();
const Post = require('../models/post-model');
const alumniModel = require('../models/alumni-model');
const isLoggedIn = require('../middlewares/isLoggedin');
const multer = require("multer");
const isVerified = require('../middlewares/isVerified');

// Use memoryStorage to handle files as buffers, which is ideal for storing in MongoDB
const storage = multer.memoryStorage();
const upload = multer({ storage });
const POST_POINTS = 100;

/**
 * @route   POST /post
 * @desc    Create a new post
 * @access  Private (Alumni)
 */
router.post("/", isLoggedIn, isVerified, upload.single("image"), async (req, res) => {
    try {
        const newPost = new Post({
            content: req.body.content,
            author: req.user._id,
            college: req.user.college // Associate post with the author's college
        });

        if (req.file) {
            newPost.image = req.file.buffer; // Save image as a Buffer
        }

        await newPost.save();

        // Add the post's ID to the author's posts array.
        await alumniModel.findByIdAndUpdate(req.user._id, { $push: { posts: newPost._id } });
        await alumniModel.findByIdAndUpdate(
            req.user._id,
            { $inc: { points: POST_POINTS } }
        );
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
router.post('/like/:id', isLoggedIn, isVerified, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });

        // Security: Ensure the user and the post belong to the same college
        if (post.college.toString() !== req.user.college.toString()) {
            return res.status(403).json({ error: "You can only interact with posts from your college." });
        }

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
router.get('/edit/:id', isLoggedIn, isVerified, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).populate("author");
        if (!post) return res.status(404).send("Post not found");

        // Authorization check: ensure the logged-in user is the post author
        if (String(post.author._id) !== String(req.user._id)) {
            return res.status(403).send("Unauthorized");
        }

        // Security: Redundant check, but good practice. Ensures post is from user's college.
        if (post.college.toString() !== req.user.college.toString()) {
            return res.status(403).send("Unauthorized");
        }

        res.render("edit-post", { post, user: req.user });
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
router.post('/edit/:id', isLoggedIn, isVerified, upload.single("image"), async (req, res) => {
    try {
        const content = req.body.content.trim();
        const post = await Post.findById(req.params.id);

        if (!post) return res.status(404).send("Post not found");

        // Authorization checks
        if (String(post.author) !== String(req.user._id) || post.college.toString() !== req.user.college.toString()) {
            return res.status(403).send("Unauthorized");
        }

        post.content = content;

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
router.post('/delete/:id', isLoggedIn, isVerified, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).send("Post not found");

        // Authorization checks
        if (String(post.author) !== String(req.user._id) || post.college.toString() !== req.user.college.toString()) {
            return res.status(403).send("Unauthorized");
        }

        await Post.findByIdAndDelete(req.params.id);

        // Also remove from alumni.posts array
        await alumniModel.findByIdAndUpdate(req.user._id, { $pull: { posts: req.params.id } });

        res.redirect('/alumni/dashboard');
    } catch (err) {
        console.error("❌ Error deleting post:", err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
