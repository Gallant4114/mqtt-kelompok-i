// config/auth.js
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Simple user database (in production, use real database)
const users = new Map();

// Create default admin user
const createDefaultUser = async () => {
  const hashedPassword = await bcrypt.hash('admin123', 10);
  users.set('admin', {
    username: 'admin',
    password: hashedPassword,
    role: 'admin'
  });
  
  const hashedUserPassword = await bcrypt.hash('user123', 10);
  users.set('user1', {
    username: 'user1',
    password: hashedUserPassword,
    role: 'user'
  });
};

const authenticateUser = async (username, password) => {
  const user = users.get(username);
  if (!user) return null;
  
  const isValid = await bcrypt.compare(password, user.password);
  return isValid ? user : null;
};

const generateToken = (user) => {
  return jwt.sign(
    { username: user.username, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: '24h' }
  );
};

const verifyToken = (token) => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    return null;
  }
};

module.exports = {
  createDefaultUser,
  authenticateUser,
  generateToken,
  verifyToken,
  users
};