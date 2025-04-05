const express = require('express');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketIO = require('socket.io');
const bcrypt = require('bcrypt');

const app = express();
const server = http.createServer(app);
const io = socketIO(server);

app.use(express.json());
app.use(express.static('frontend'));

// Store users (in-memory for simplicity)
let users = [
    { username: 'admin', password: bcrypt.hashSync('admin123', 10), isAdmin: true }
];

// Chat directory
const chatDir = path.join(__dirname, 'chat_logs');
if (!fs.existsSync(chatDir)) fs.mkdirSync(chatDir);

// User login
app.post('/login', (req, res) => {
    const { username, password } = req.body;
    const user = users.find(u => u.username === username);
    if (user && bcrypt.compareSync(password, user.password)) {
        return res.json({ success: true, isAdmin: user.isAdmin });
    }
    res.status(401).json({ success: false, message: 'Invalid credentials' });
});

// Create new users (Admin only)
app.post('/createUser', (req, res) => {
    const { name, username, password } = req.body;
    users.push({ name, username, password: bcrypt.hashSync(password, 10), isAdmin: false });
    res.json({ success: true, message: 'User created successfully' });
});

// Fetch chat files (Admin only)
app.get('/chats', (req, res) => {
    const files = fs.readdirSync(chatDir).map(file => ({
        fileName: file,
        content: fs.readFileSync(path.join(chatDir, file), 'utf-8')
    }));
    res.json(files);
});

// Socket.IO for real-time communication
io.on('connection', (socket) => {
    console.log('New user connected');

    socket.on('userMessage', (data) => {
        const { username, message } = data;

        // Save message to file
        const date = new Date().toISOString().split('T')[0];
        const filePath = path.join(chatDir, `${username}_${date}.txt`);
        const logMessage = `[${new Date().toISOString()}] ${username}: ${message}\n`;

        fs.appendFileSync(filePath, logMessage);

        // Notify admin of new message
        socket.emit('adminResponse', { message: 'Message received!' });
        io.emit('userList', { username, message });
    });

    socket.on('selectUser', (username) => {
        const date = new Date().toISOString().split('T')[0];
        const filePath = path.join(chatDir, `${username}_${date}.txt`);

        if (fs.existsSync(filePath)) {
            const history = fs.readFileSync(filePath, 'utf-8').split('\n');
            socket.emit('chatHistory', history); // Send chat history to admin
        }
    });

    socket.on('adminReply', (data) => {
        const { username, message } = data;
        const date = new Date().toISOString().split('T')[0];
        const filePath = path.join(chatDir, `${username}_${date}.txt`);
        const logMessage = `[${new Date().toISOString()}] admin: ${message}\n`;

        fs.appendFileSync(filePath, logMessage);

        io.emit('adminResponse', { username, message });
    });

    socket.on('disconnect', () => {
        console.log('User disconnected');
    });
});

// Start server
const PORT = 3000;
server.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
