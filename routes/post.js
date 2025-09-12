// routes/posts.js
const express = require('express');
const router = express.Router();
const Post = require('../models/post-model');
const alumniModel = require('../models/alumni-model');
const isLoggedIn = require('../middlewares/isLoggedin');

// CREATE POST (only alumni)
router.post('/', isLoggedIn, async (req, res) => {
    try {
        if (!req.user || req.user.role !== 'alumni') {
            return res.status(403).send("Only alumni can create posts");
        }

        const content = (req.body.content || '').trim();
        if (!content) return res.status(400).send("Post content cannot be empty");

        const post = await Post.create({
            author: req.user._id,
            content
        });

        // also push into alumni.posts array
        await alumniModel.findByIdAndUpdate(req.user._id, { $push: { posts: post._id } });

        res.redirect('/alumni/dashboard'); // after posting, go back to dashboard
    } catch (err) {
        console.error("❌ Error creating post:", err);
        res.status(500).send("Server error");
    }
});


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

        res.redirect(`/${req.user.role}/dashboard`);
    } catch (err) {
        console.error("❌ Error liking post:", err);
        res.status(500).json({ error: "Server error" });
    }
});




// EDIT POST (only author)
router.get('/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id).populate("author");
        if (!post) return res.status(404).send("Post not found");

        if (String(post.author._id) !== String(req.user._id)) {
            return res.status(403).send("Unauthorized");
        }

        res.render("edit-post", { post });
    } catch (err) {
        console.error("❌ Error fetching post for edit:", err);
        res.status(500).send("Server error");
    }
});

router.post('/edit/:id', isLoggedIn, async (req, res) => {
    try {
        const content = req.body.content.trim();
        const post = await Post.findById(req.params.id);

        if (!post) return res.status(404).send("Post not found");
        if (String(post.author) !== String(req.user._id)) {
            return res.status(403).send("Unauthorized");
        }

        post.content = content;
        await post.save();

        res.redirect('/alumni/dashboard');
    } catch (err) {
        console.error("❌ Error editing post:", err);
        res.status(500).send("Server error");
    }
});


// DELETE POST (only author)
router.post('/delete/:id', isLoggedIn, async (req, res) => {
    try {
        const post = await Post.findById(req.params.id);
        if (!post) return res.status(404).send("Post not found");

        if (String(post.author) !== String(req.user._id)) {
            return res.status(403).send("Unauthorized");
        }

        await Post.findByIdAndDelete(req.params.id);

        // also remove from alumni.posts array
        await alumniModel.findByIdAndUpdate(req.user._id, { $pull: { posts: req.params.id } });

        res.redirect('/alumni/dashboard');
    } catch (err) {
        console.error("❌ Error deleting post:", err);
        res.status(500).send("Server error");
    }
});

module.exports = router;
