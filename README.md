# MQTT Kelompok I

|Nama|NRP|
|-|-|
|Ricko Mianto Jaya S|5027231031|
|Gallant Damas H|5027231037|
***
## Prerequisites

1. Install Dependencies
```bash
npm install
```

```bash
npm install mqtt express bcryptjs jsonwebtoken dotenv # ini kurang tau, masih ada error tapi bisa jalan
npm install --save-dev nodemon
```

```bash
npm run dev
```

***

# tutorial

```bash
# Clone atau extract project
cd mqtt-messaging-system

# Install Node.js dependencies
npm install

# Install MQTT Broker (Mosquitto)
# Windows: Download dari https://mosquitto.org/download/
# Ubuntu/Debian:
sudo apt-get install mosquitto mosquitto-clients

### 2. Konfigurasi Environment

Buat file `.env`:
```env
JWT_SECRET=your_jwt_secret_key_here
MQTT_BROKER_URL=mqtt://localhost:1883
MQTT_USERNAME=admin
MQTT_PASSWORD=password123
PORT=3000
```

### 3. Jalankan MQTT Broker

```bash
# Linux/MacOS
mosquitto -c mosquitto.conf

# Windows (jika installed as service)
net start mosquitto

# Atau jalankan manual
mosquitto -c "C:\Program Files\mosquitto\mosquitto.conf"
```

### 4. Jalankan Aplikasi

```bash
# Development mode
npm run dev

# Production mode
npm start
```

### 5. Akses Aplikasi

Buka browser dan kunjungi: `http://localhost:3000`

**Default Users:**
- Username: `admin`, Password: `admin123`
- Username: `user1`, Password: `user123`

## 📋 Cara Kerja Sistem

### 1. Authentication Flow
```
User Login → JWT Token Generation → MQTT Connection with Token → Topic Subscription
```

### 2. Message Flow dengan QoS
```
QoS 0: Publisher → Broker → Subscriber (Fire and forget)
QoS 1: Publisher ↔ Broker ↔ Subscriber (At least once, with ACK)
QoS 2: Publisher ↔ Broker ↔ Subscriber (Exactly once, with 4-way handshake)
```

### 3. Request-Response Flow (MQTT 5.0)
```
Client A → Request (with Response Topic & Correlation Data) → Client B
Client B → Process Request → Response (with Correlation Data) → Client A
```

### 4. Retained Message
```
Status Update → Broker (stores message) → New Subscriber (receives last status)
```

### 5. Last Will Testament
```
Client Disconnect (unexpected) → Broker → Publishes Will Message → Other Clients
```

## 🔧 Testing Features

### Test QoS Levels
1. Login ke sistem
2. Pilih QoS level (0, 1, atau 2)
3. Kirim message dan perhatikan behavior berbeda

### Test Request-Response
1. Login dengan 2 user berbeda di browser/tab berbeda
2. Kirim request dari user pertama ke user kedua
3. System akan otomatis respond dengan correlation data

### Test Retained Messages
1. Login dan logout user
2. Login kembali - status terakhir akan tetap tersimpan
3. User baru akan melihat status terakhir dari user lain

## 🏗️ Arsitektur Sistem

```
Frontend (HTML/JS)
    ↓
Express.js Server (REST API)
    ↓
MQTT Client Library
    ↓
Mosquitto MQTT Broker
    ↓
Other MQTT Clients
```

### Core Components:

1. **Authentication Module** (`config/auth.js`)
   - JWT token management
   - User authentication
   - Password hashing dengan bcrypt

2. **MQTT Client** (`mqtt/client.js`)
   - MQTT 5.0 connection handling
   - QoS implementation
   - Request-Response pattern
   - Message routing

3. **Web Server** (`server.js`)
   - REST API endpoints
   - Static file serving
   - Client management

4. **Frontend** (`public/index.html`)
   - User interface
   - Real-time messaging
   - Feature demonstration

## 📊 Monitoring dan Debugging

### MQTT Topic Structure
```
users/{username}/messages     - Direct messages
users/{username}/requests     - Request messages
users/{username}/status       - User status (retained)
chat/{room}/messages         - Chat room messages
response/{username}/{id}     - Response messages
system/ping                  - Keep-alive ping
system/announcements         - System messages
```

### Log Monitoring
- Server logs: Console output
- MQTT logs: Mosquitto log files
- Client logs: Browser console

## 🔒 Security Features

1. **JWT Authentication**: Secure token-based auth
2. **Password Hashing**: bcrypt dengan salt
3. **Topic Authorization**: User-specific topics
4. **Connection Security**: Username/password untuk broker
5. **Message Expiry**: Automatic cleanup

## 🚨 Troubleshooting

### Common Issues:

1. **MQTT Broker tidak running**
   ```bash
   # Check if Mosquitto is running
   sudo systemctl status mosquitto
   
   # Start if not running
   sudo systemctl start mosquitto
   ```

2. **Connection refused**
   - Pastikan broker berjalan di port 1883
   - Check firewall settings
   - Verify broker configuration

3. **Authentication gagal**
   - Cek username/password di .env
   - Pastikan JWT_SECRET di-set dengan benar

4. **Messages tidak diterima**
   - Cek topic subscription
   - Verify QoS levels
   - Check message expiry settings

## 📚 Penjelasan Teknis untuk Tugas

### 1. MQTT 5.0 Request-Response Implementation
```javascript
// Property 1: Response Topic
properties: {
    responseTopic: `response/${username}/${responseId}`
}

// Property 2: Correlation Data  
properties: {
    correlationData: Buffer.from(correlationId)
}
```

### 2. QoS Level Differences
- **QoS 0**: Fastest, no guarantee delivery
- **QoS 1**: Guaranteed delivery, possible duplicates
- **QoS 2**: Exactly once delivery, slowest but most reliable

### 3. Message Expiry
```javascript
properties: {
    messageExpiryInterval: 3600 // 1 hour in seconds
}
```

### 4. Flow Control
- Rate limiting: 100ms minimum interval between messages
- Connection limits: Max 100 inflight messages
- Queue management: Max 1000 queued messages

## 📖 Dokumentasi API

### POST /api/login
Authenticate user dan generate JWT token.

### POST /api/connect-mqtt  
Connect ke MQTT broker dengan authentication.

### POST /api/send-message
Kirim direct message dengan QoS level.

### POST /api/send-request
Kirim request dan tunggu response (MQTT 5.0).

---