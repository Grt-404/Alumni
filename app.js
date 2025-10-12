require('dotenv').config();
const express = require("express");
const app = express();
const http = require('http');
const { Server } = require("socket.io");
const path = require('path');
const cookieParser = require('cookie-parser');
const expressSession = require("express-session");
const flash = require("connect-flash");
const jwt = require('jsonwebtoken'); // <-- Add for JWT verification
const cookie = require('cookie');   // <-- Add for cookie parsing

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

// Routers
app.use("/student", studentRouter);
app.use("/alumni", alumniRouter);
app.use("/college", collegeRouter);
app.use('/', indexRouter);
app.use('/post', postsRoutes);


const initializeSocketHandlers = require('./utils/mapSocket'); 



// ===================================================
// --- 5. SERVER-SIDE SOCKET.IO LOGIC (JWT Corrected) ---
// ===================================================

// A map to keep track of online users and their socket IDs. (userId -> socketId)
const onlineUsers = new Map();

// This is a custom middleware for Socket.IO that runs on every connection.
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

        // Attach the user object to the socket for use in event handlers
        socket.user = user;
        next();
    } catch (err) {
        console.error("SOCKET: JWT Authentication Error", err.message);
        next(new Error('Authentication error: Invalid token.'));
    }
});


io.on('connection', (socket) => {
    // Thanks to our middleware, we now have `socket.user` available.
    const user = socket.user;
    const userId = user._id;
    const userRole = user.role;

    // 2. Track the user as online
    onlineUsers.set(userId.toString(), socket.id);
    console.log(`SOCKET: User connected: ${userId} (Role: ${userRole})`);

    // 3. Handle disconnection
    socket.on('disconnect', () => {
        onlineUsers.delete(userId.toString());
        console.log(`SOCKET: User disconnected: ${userId}`);
    });

    // 4. Listen for incoming private messages
    socket.on('private_message', async ({ content, to, toModel }) => {
        console.log(`SOCKET: Received message from ${userId} to ${to}`);
        try {
            // SECURITY CHECK is now simpler as we already have the sender's full user object.
            if (!user.connections.some(connId => connId.equals(to))) {
                console.log(`SOCKET: Authorization Failed! User ${userId} is not connected to ${to}.`);
                return socket.emit('auth_error', { message: 'You are not connected with this user.' });
            }

            // 5. Save the message to the database
            const message = await Message.create({
                content,
                from: userId,
                to: to,
                fromModel: userRole,
                toModel: toModel
            });
            console.log(`DATABASE: Message saved with ID: ${message._id}`);

            // 6. Relay the message to the recipient (if they are online)
            const recipientSocketId = onlineUsers.get(to.toString());
            if (recipientSocketId) {
                console.log(`SOCKET: Sending message to recipient ${to} at socket ${recipientSocketId}`);
                io.to(recipientSocketId).emit('new_message', message);
            }

            // 7. Send the message back to the sender so their UI updates
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

