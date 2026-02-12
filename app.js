require('dotenv').config();
const express = require("express");
const app = express();
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const cookieParser = require('cookie-parser');
const expressSession = require("express-session");
const flash = require("connect-flash");
const jwt = require('jsonwebtoken');
const cookie = require('cookie');

// --- Model Imports for Socket.IO Logic ---
const Student = require('./models/student-model');
const Alumni = require('./models/alumni-model');
const Message = require('./models/message-model');

const studentRouter = require("./routes/student");
const alumniRouter = require("./routes/alumni");
const collegeRouter = require("./routes/college");
const indexRouter = require("./routes/index");
const postsRoutes = require('./routes/post');


const server = http.createServer(app);
const io = new Server(server);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, "public")));
app.set("view engine", "ejs");

const sessionMiddleware = expressSession({
    secret: process.env.SESSION_SECRET || "averylongandsecretkey",
    resave: false,
    saveUninitialized: false,
});
app.use(sessionMiddleware);
app.use(flash());

// ===================================================
// --- 1. MIDDLEWARE TO DISPLAY FLASH MESSAGES (ADDED) ---
// ===================================================
app.use((req, res, next) => {
    // These variables will now be available in all your .ejs files
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    next();
});
// ===================================================


//Already Login Check
const passUserToViews = require('./middlewares/passUserToViews');
app.use(passUserToViews);

// Routers
app.use("/student", studentRouter);
app.use("/alumni", alumniRouter);
app.use("/college", collegeRouter);
app.use('/', indexRouter);
app.use('/post', postsRoutes);

// Quick migration to fill defaults for existing users
const updateDefaults = async () => {
    await studentModel.updateMany({}, { $set: { age: 20, objectives: "Career Growth" } });
    await alumniModel.updateMany({}, { $set: { age: 30, seniority: "Senior", companySize: 1000 } });
    console.log("Database migrated for AI features");
};


const initializeSocketHandlers = require('./utils/mapSocket');



// ===================================================
// --- 5. SERVER-SIDE SOCKET.IO LOGIC (JWT Corrected) ---
// ===================================================

const onlineUsers = new Map();

io.use(async (socket, next) => {
    try {
        const cookies = socket.request.headers.cookie;
        if (!cookies) {
            return next(new Error('Authentication error: No cookies found.'));
        }

        const parsedCookies = cookie.parse(cookies);
        const token = parsedCookies.token;
        if (!token) {
            return next(new Error('Authentication error: Token not found.'));
        }

        const decoded = jwt.verify(token, process.env.JWT_KEY);

        let Model;
        if (decoded.role === "alumni") Model = Alumni;
        else if (decoded.role === "student") Model = Student;
        else return next(new Error('Authentication error: Invalid user role.'));

        const user = await Model.findOne({ email: decoded.email }).select("-password");
        if (!user) {
            return next(new Error('Authentication error: User not found.'));
        }

        socket.user = user;
        next();
    } catch (err) {
        console.error("SOCKET: JWT Authentication Error", err.message);
        next(new Error('Authentication error: Invalid token.'));
    }
});


io.on('connection', (socket) => {
    const user = socket.user;
    const userId = user._id;
    const userRole = user.role;
    const collegeId = user.college; // Get college ID from the authenticated user

    onlineUsers.set(userId.toString(), socket.id);
    console.log(`SOCKET: User connected: ${userId} (Role: ${userRole}) from College: ${collegeId}`);

    socket.on('disconnect', () => {
        onlineUsers.delete(userId.toString());
        console.log(`SOCKET: User disconnected: ${userId}`);
    });

    socket.on('private_message', async ({ content, to, toModel }) => {
        console.log(`SOCKET: Received message from ${userId} to ${to}`);
        try {
            if (!user.connections.some(connId => connId.equals(to))) {
                console.log(`SOCKET: Authorization Failed! User ${userId} is not connected to ${to}.`);
                return socket.emit('auth_error', { message: 'You are not connected with this user.' });
            }

            // FIX: Include the college ID when creating the message
            const message = await Message.create({
                content,
                from: userId,
                to: to,
                fromModel: userRole,
                toModel: toModel,
                college: collegeId // Save the message with the college context
            });
            console.log(`DATABASE: Message saved with ID: ${message._id} for college ${collegeId}`);

            const recipientSocketId = onlineUsers.get(to.toString());
            if (recipientSocketId) {
                console.log(`SOCKET: Sending message to recipient ${to} at socket ${recipientSocketId}`);
                io.to(recipientSocketId).emit('new_message', message);
            }

            console.log(`SOCKET: Sending message back to sender ${userId} at socket ${socket.id}`);
            socket.emit('new_message', message);

        } catch (error) {
            console.error("SOCKET: Error handling private message:", error);
        }
    });
});



initializeSocketHandlers(io);
// --- END OF SOCKET.IO LOGIC ---

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});