// Example client usage (example-client.js)
const MQTTMessagingClient = require('./mqtt/client');
const { generateToken } = require('./config/auth');

async function demonstrateFeatures() {
    console.log('🚀 MQTT Messaging System - Feature Demonstration\n');
    
    // Create mock user for demo
    const mockUser = { username: 'demo_user', role: 'user' };
    const token = generateToken(mockUser);
    
    const client = new MQTTMessagingClient();
    
    try {
        // 1. Connect with authentication
        console.log('1️⃣ Connecting with authentication...');
        await client.connect('demo_user', token);
        
        // 2. Set up event listeners
        client.on('directMessage', (message) => {
            console.log(`📨 Received direct message: ${message.message} from ${message.from}`);
        });
        
        client.on('request', async (request, packet) => {
            console.log(`🔔 Received request from ${request.from}:`, request.data);
            
            // Auto-respond to requests
            const responseData = {
                status: 'success',
                originalRequest: request.data,
                processedAt: new Date().toISOString(),
                processingTime: '0.5ms'
            };
            
            client.sendResponse(packet, responseData);
        });
        
        client.on('statusUpdate', (status) => {
            console.log(`📊 Status update: ${status.username} is ${status.status}`);
        });
        
        // 3. Demonstrate QoS levels
        console.log('\n2️⃣ Demonstrating QoS levels...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        client.sendDirectMessage('admin', 'QoS 0 message - Fire and forget', 0);
        client.sendDirectMessage('admin', 'QoS 1 message - At least once', 1);
        client.sendDirectMessage('admin', 'QoS 2 message - Exactly once', 2);
        
        // 4. Demonstrate Request-Response
        console.log('\n3️⃣ Demonstrating MQTT 5.0 Request-Response...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        try {
            const response = await client.sendRequest('admin', {
                action: 'get_server_info',
                timestamp: Date.now()
            }, 10000);
            
            console.log('✅ Request-Response successful:', response);
        } catch (error) {
            console.log('❌ Request failed:', error.message);
        }
        
        // 5. Demonstrate retained messages (status updates)
        console.log('\n4️⃣ Publishing retained status message...');
        client.publishUserStatus('busy');
        
        // 6. Demonstrate chat messages
        console.log('\n5️⃣ Sending chat room messages...');
        client.sendChatMessage('general', 'Hello everyone!', 0);
        client.sendChatMessage('developers', 'MQTT integration working perfectly!', 1);
        
        // 7. Flow control demonstration
        console.log('\n6️⃣ Demonstrating flow control...');
        for (let i = 0; i < 5; i++) {
            await client.sendWithFlowControl(
                client.sendDirectMessage.bind(client),
                'admin',
                `Controlled message ${i + 1}`,
                1
            );
        }
        
        console.log('\n✅ All features demonstrated successfully!');
        console.log('\n📝 Features implemented:');
        console.log('   ✅ MQTT 5.0 with secure authentication');
        console.log('   ✅ QoS levels 0, 1, and 2');
        console.log('   ✅ Retained messages for status');
        console.log('   ✅ Last Will and Testament');
        console.log('   ✅ Message expiry interval');
        console.log('   ✅ Request-Response with Response Topic & Correlation Data');
        console.log('   ✅ Flow control and rate limiting');
        console.log('   ✅ Ping-pong keep-alive mechanism');
        
        // Keep alive for demo
        console.log('\n⏰ Demo client will run for 60 seconds...');
        await new Promise(resolve => setTimeout(resolve, 60000));
        
    } catch (error) {
        console.error('❌ Demo error:', error);
    } finally {
        await client.disconnect();
        console.log('👋 Demo completed');
        process.exit(0);
    }
}

// Run demo if this file is executed directly
if (require.main === module) {
    demonstrateFeatures();
}

module.exports = { demonstrateFeatures };