// server.js
const express = require('express');
const path = require('path');
require('dotenv').config();

const { createDefaultUser, authenticateUser, generateToken } = require('./config/auth');
const MQTTMessagingClient = require('./mqtt/client');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Store active MQTT clients
const activeClients = new Map();

// Initialize default users
createDefaultUser();

// Routes
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await authenticateUser(username, password);
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    
    const token = generateToken(user);
    res.json({ token, username: user.username });
    
  } catch (error) {
    res.status(500).json({ error: 'Login failed' });
  }
});

app.post('/api/connect-mqtt', async (req, res) => {
  try {
    const { username, token } = req.body;
    
    // Disconnect existing client if any
    if (activeClients.has(username)) {
      await activeClients.get(username).disconnect();
    }
    
    const client = new MQTTMessagingClient();
    await client.connect(username, token);
    
    activeClients.set(username, client);
    
    res.json({ success: true, message: 'Connected to MQTT' });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-message', (req, res) => {
  try {
    const { from, to, message, qos = 1 } = req.body;
    
    const client = activeClients.get(from);
    if (!client || !client.isConnected) {
      return res.status(400).json({ error: 'MQTT client not connected' });
    }
    
    const messageId = client.sendDirectMessage(to, message, parseInt(qos));
    res.json({ success: true, messageId });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/send-request', async (req, res) => {
  try {
    const { from, to, requestData, timeout = 30000 } = req.body;
    
    const client = activeClients.get(from);
    if (!client || !client.isConnected) {
      return res.status(400).json({ error: 'MQTT client not connected' });
    }
    
    const response = await client.sendRequest(to, requestData, timeout);
    res.json({ success: true, response });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  
  for (const [username, client] of activeClients) {
    console.log(`Disconnecting ${username}...`);
    await client.disconnect();
  }
  
  process.exit(0);
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📚 Default users:`);
  console.log(`   - admin:admin123`);
  console.log(`   - user1:user123`);
});
