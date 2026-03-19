const express = require('express');
const router = express.Router();
const Post = require('../models/post-model');
const alumniModel = require('../models/alumni-model');
const isLoggedIn = require('../middlewares/isLoggedin');
const multer = require("multer");
const isVerified = require('../middlewares/isVerified');

const storage = multer.memoryStorage();
const upload = multer({ storage });
const POST_POINTS = 100;

router.post("/", isLoggedIn, isVerified, upload.single("image"), async (req, res) => {
    try {
        const newPost = new Post({
            content: req.body.content,
            author: req.user._id,
            college: req.user.college
        });

        if (req.file) {
            newPost.image = req.file.buffer;
        }

        await newPost.save();

        await alumniModel.findByIdAndUpdate(req.user._id, { $push: { posts: newPost._id } });
        await alumniModel.findByIdAndUpdate(
            req.user._id,
            { $inc: { points: POST_POINTS } }
        );
        res.redirect(`/${req.user.role}/dashboard`);
    } catch (err) {
        console.error(" Error creating post:", err);
        res.status(500).send("Server Error");
    }
});

router.post('/like/:id', isLoggedIn, isVerified, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).json({ error: "Post not found" });
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

router.get('/edit/:id', isLoggedIn, isVerified, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).populate("author");
        if (!post) return res.status(404).send("Post not found");

        if (String(post.author._id) !== String(req.user._id)) {
            return res.status(403).send("Unauthorized");
        }

        if (post.college.toString() !== req.user.college.toString()) {
            return res.status(403).send("Unauthorized");
        }

        res.render("edit-post", { post, user: req.user });
    } catch (err) {
        console.error("❌ Error fetching post for edit:", err);
        res.status(500).send("Server error");
    }
});

router.post('/edit/:id', isLoggedIn, isVerified, upload.single("image"), async (req, res) => {
    try {
        const content = req.body.content.trim();
        const post = await Post.findById(req.params.id);

        if (!post) return res.status(404).send("Post not found");

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

router.post('/delete/:id', isLoggedIn, isVerified, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).send("Post not found");

        if (String(post.author) !== String(req.user._id) || post.college.toString() !== req.user.college.toString()) {
            return res.status(403).send("Unauthorized");
        }

        await Post.findByIdAndDelete(req.params.id);

        await alumniModel.findByIdAndUpdate(req.user._id, { $pull: { posts: req.params.id } });

        res.redirect('/alumni/dashboard');
    } catch (err) {
        console.error("❌ Error deleting post:", err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
