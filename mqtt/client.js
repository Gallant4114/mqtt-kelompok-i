// mqtt/client.js
const mqtt = require('mqtt');
const { verifyToken } = require('../config/auth');

class MQTTMessagingClient {
  constructor(options = {}) {
    this.brokerUrl = options.brokerUrl || process.env.MQTT_BROKER_URL;
    this.client = null;
    this.isConnected = false;
    this.subscriptions = new Map();
    this.pendingRequests = new Map();
    this.messageHandlers = new Map();
    this.userToken = null;
    this.username = null;
    
    // MQTT 5.0 properties for request-response
    this.correlationCounter = 0;
  }

  // Connect with authentication and security
  async connect(username, token) {
    return new Promise((resolve, reject) => {
      // Verify token
      const decoded = verifyToken(token);
      if (!decoded || decoded.username !== username) {
        return reject(new Error('Invalid authentication token'));
      }

      this.userToken = token;
      this.username = username;

      // MQTT connection options with security
      const options = {
        clientId: `messaging_client_${username}_${Date.now()}`,
        username: process.env.MQTT_USERNAME,
        password: process.env.MQTT_PASSWORD,
        clean: true,
        protocolVersion: 5, // MQTT 5.0
        keepalive: 60,
        connectTimeout: 30000,
        reconnectPeriod: 1000,
        
        // Will message (Last Will and Testament)
        will: {
          topic: `users/${username}/status`,
          payload: JSON.stringify({
            status: 'offline',
            timestamp: Date.now(),
            reason: 'unexpected_disconnect'
          }),
          qos: 1,
          retain: true,
          properties: {
            messageExpiryInterval: 300 // 5 minutes
          }
        },
        
        // Connection properties
        properties: {
          sessionExpiryInterval: 3600, // 1 hour
          receiveMaximum: 100,
          maximumPacketSize: 65536,
          topicAliasMaximum: 10
        }
      };

      this.client = mqtt.connect(this.brokerUrl, options);

      this.client.on('connect', (connack) => {
        console.log(`✅ Connected to MQTT broker as ${username}`);
        this.isConnected = true;
        
        // Publish online status with retained message
        this.publishUserStatus('online');
        
        // Subscribe to user's personal topics
        this.subscribeToPersonalTopics();
        
        // Set up ping interval for keep-alive
        this.setupPingPong();
        
        resolve(connack);
      });

      this.client.on('error', (error) => {
        console.error('❌ MQTT connection error:', error);
        reject(error);
      });

      this.client.on('message', (topic, message, packet) => {
        this.handleIncomingMessage(topic, message, packet);
      });

      this.client.on('disconnect', () => {
        console.log('🔌 Disconnected from MQTT broker');
        this.isConnected = false;
      });

      this.client.on('reconnect', () => {
        console.log('🔄 Reconnecting to MQTT broker...');
      });
    });
  }

  // Publish user status with retained message
  publishUserStatus(status) {
    if (!this.isConnected) return;

    const statusMessage = {
      status: status,
      timestamp: Date.now(),
      username: this.username
    };

    this.client.publish(
      `users/${this.username}/status`,
      JSON.stringify(statusMessage),
      {
        qos: 1,
        retain: true, // Retained message
        properties: {
          messageExpiryInterval: status === 'online' ? 0 : 300 // No expiry for online, 5min for offline
        }
      }
    );
  }

  // Subscribe to personal topics
  subscribeToPersonalTopics() {
    const topics = [
      `users/${this.username}/messages`,
      `users/${this.username}/requests`,
      `chat/+/messages`, // Wildcard for chat rooms
      `system/announcements`
    ];

    topics.forEach(topic => this.subscribe(topic, 1));
  }

  // Subscribe with different QoS levels
  subscribe(topic, qos = 0) {
    if (!this.isConnected) return false;

    this.client.subscribe(topic, { qos }, (error, granted) => {
      if (error) {
        console.error(`❌ Subscription error for ${topic}:`, error);
        return;
      }
      
      granted.forEach(sub => {
        console.log(`📡 Subscribed to ${sub.topic} with QoS ${sub.qos}`);
        this.subscriptions.set(sub.topic, sub.qos);
      });
    });
    
    return true;
  }

  // Send direct message to user
  sendDirectMessage(toUsername, message, qos = 1) {
    if (!this.isConnected) return false;

    const messagePayload = {
      from: this.username,
      to: toUsername,
      message: message,
      timestamp: Date.now(),
      messageId: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    // QoS demonstration - different levels for different message types
    const topic = `users/${toUsername}/messages`;
    
    this.client.publish(topic, JSON.stringify(messagePayload), {
      qos: qos, // QoS 0, 1, or 2
      properties: {
        messageExpiryInterval: 3600, // 1 hour expiry
        contentType: 'application/json'
      }
    });

    console.log(`📤 Message sent to ${toUsername} (QoS ${qos})`);
    return messagePayload.messageId;
  }

  // Send chat room message
  sendChatMessage(roomId, message, qos = 0) {
    if (!this.isConnected) return false;

    const messagePayload = {
      from: this.username,
      room: roomId,
      message: message,
      timestamp: Date.now(),
      messageId: `chat_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    };

    this.client.publish(`chat/${roomId}/messages`, JSON.stringify(messagePayload), {
      qos: qos,
      properties: {
        messageExpiryInterval: 7200, // 2 hours for chat messages
        contentType: 'application/json'
      }
    });

    console.log(`💬 Chat message sent to room ${roomId}`);
    return messagePayload.messageId;
  }

  // MQTT 5.0 Request-Response implementation
  sendRequest(toUsername, requestData, timeoutMs = 30000) {
    if (!this.isConnected) return Promise.reject(new Error('Not connected'));

    return new Promise((resolve, reject) => {
      // Generate correlation data
      const correlationId = `req_${++this.correlationCounter}_${Date.now()}`;
      const responseTopicSuffix = Math.random().toString(36).substr(2, 9);
      const responseTopic = `response/${this.username}/${responseTopicSuffix}`;

      // Store pending request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(correlationId);
        reject(new Error('Request timeout'));
      }, timeoutMs);

      this.pendingRequests.set(correlationId, { resolve, reject, timeout });

      // Subscribe to response topic temporarily
      this.client.subscribe(responseTopic, { qos: 1 });

      // Prepare request payload
      const requestPayload = {
        from: this.username,
        to: toUsername,
        data: requestData,
        timestamp: Date.now(),
        requestId: correlationId
      };

      // Send request with MQTT 5.0 request-response properties
      this.client.publish(`users/${toUsername}/requests`, JSON.stringify(requestPayload), {
        qos: 1,
        properties: {
          responseTopic: responseTopic,        // Property 1: Response Topic
          correlationData: Buffer.from(correlationId), // Property 2: Correlation Data
          messageExpiryInterval: Math.floor(timeoutMs / 1000)
        }
      });

      console.log(`🔄 Request sent to ${toUsername} (correlation: ${correlationId})`);
    });
  }

  // Send response to a request
  sendResponse(originalPacket, responseData) {
    if (!this.isConnected) return false;

    const responseTopic = originalPacket.properties?.responseTopic;
    const correlationData = originalPacket.properties?.correlationData;

    if (!responseTopic || !correlationData) {
      console.error('❌ Cannot send response: missing response topic or correlation data');
      return false;
    }

    const responsePayload = {
      from: this.username,
      data: responseData,
      timestamp: Date.now(),
      correlationId: correlationData.toString()
    };

    this.client.publish(responseTopic, JSON.stringify(responsePayload), {
      qos: 1,
      properties: {
        correlationData: correlationData
      }
    });

    console.log(`📤 Response sent (correlation: ${correlationData.toString()})`);
    return true;
  }

  // Handle incoming messages
  handleIncomingMessage(topic, message, packet) {
    try {
      const payload = JSON.parse(message.toString());
      
      // Handle responses for pending requests
      if (topic.startsWith(`response/${this.username}/`)) {
        this.handleResponse(payload, packet);
        return;
      }

      // Handle different message types
      if (topic === `users/${this.username}/messages`) {
        this.handleDirectMessage(payload, packet);
      } else if (topic === `users/${this.username}/requests`) {
        this.handleRequest(payload, packet);
      } else if (topic.includes('/messages')) {
        this.handleChatMessage(topic, payload, packet);
      } else if (topic.includes('/status')) {
        this.handleStatusUpdate(payload, packet);
      }

    } catch (error) {
      console.error('❌ Error handling message:', error);
    }
  }

  // Handle request-response correlation
  handleResponse(payload, packet) {
    const correlationData = packet.properties?.correlationData;
    if (!correlationData) return;

    const correlationId = correlationData.toString();
    const pendingRequest = this.pendingRequests.get(correlationId);

    if (pendingRequest) {
      clearTimeout(pendingRequest.timeout);
      this.pendingRequests.delete(correlationId);
      pendingRequest.resolve(payload);
      
      console.log(`✅ Response received (correlation: ${correlationId})`);
    }
  }

  // Message handlers
  handleDirectMessage(payload, packet) {
    console.log(`📨 Direct message from ${payload.from}: ${payload.message}`);
    this.emit('directMessage', payload, packet);
  }

  handleRequest(payload, packet) {
    console.log(`🔔 Request from ${payload.from}:`, payload.data);
    this.emit('request', payload, packet);
  }

  handleChatMessage(topic, payload, packet) {
    const roomMatch = topic.match(/chat\/(.+)\/messages/);
    if (roomMatch) {
      console.log(`💬 [${roomMatch[1]}] ${payload.from}: ${payload.message}`);
      this.emit('chatMessage', { room: roomMatch[1], ...payload }, packet);
    }
  }

  handleStatusUpdate(payload, packet) {
    console.log(`📊 Status update: ${payload.username} is ${payload.status}`);
    this.emit('statusUpdate', payload, packet);
  }

  // Event emitter functionality
  on(event, handler) {
    if (!this.messageHandlers.has(event)) {
      this.messageHandlers.set(event, []);
    }
    this.messageHandlers.get(event).push(handler);
  }

  emit(event, ...args) {
    const handlers = this.messageHandlers.get(event) || [];
    handlers.forEach(handler => handler(...args));
  }

  // Ping-pong mechanism for connection health
  setupPingPong() {
    // MQTT has built-in keep-alive, but we can add application-level ping
    setInterval(() => {
      if (this.isConnected) {
        this.client.publish(`system/ping`, JSON.stringify({
          from: this.username,
          timestamp: Date.now()
        }), { qos: 0 });
      }
    }, 30000); // Every 30 seconds
  }

  // Flow control - limit message rate
  async sendWithFlowControl(publishFn, ...args) {
    // Simple rate limiting
    const now = Date.now();
    if (!this.lastMessageTime) this.lastMessageTime = 0;
    
    const timeSinceLastMessage = now - this.lastMessageTime;
    const minInterval = 100; // Minimum 100ms between messages
    
    if (timeSinceLastMessage < minInterval) {
      await new Promise(resolve => setTimeout(resolve, minInterval - timeSinceLastMessage));
    }
    
    this.lastMessageTime = Date.now();
    return publishFn.apply(this, args);
  }

  // Graceful disconnect
  async disconnect() {
    if (this.isConnected) {
      // Publish offline status
      this.publishUserStatus('offline');
      
      // Wait a bit for the message to be sent
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Close connection
      this.client.end();
      this.isConnected = false;
      console.log('👋 Disconnected gracefully');
    }
  }
}

module.exports = MQTTMessagingClient;
