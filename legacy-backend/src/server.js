require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const connectDB = require('./config/database');
const PriceMonitorService = require('./services/priceMonitorService');

// Import routes
const listingsRoutes = require('./routes/listings');
const keepaRoutes = require('./routes/keepa');

const app = express();
const PORT = process.env.PORT || 3001;

// Connect to database
connectDB();

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Simple auth middleware (in production, use proper JWT auth)
app.use('/api', (req, res, next) => {
  // For development, we'll mock a user
  req.user = {
    id: '507f1f77bcf86cd799439011', // Mock user ID
    email: 'demo@example.com',
    name: 'Demo User'
  };
  next();
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// API routes
app.use('/api/listings', listingsRoutes);
app.use('/api/keepa', keepaRoutes);

// Price monitoring status endpoint
app.get('/api/monitor/status', (req, res) => {
  const priceMonitor = new PriceMonitorService();
  res.json(priceMonitor.getStatus());
});

// Start/stop price monitoring
app.post('/api/monitor/start', (req, res) => {
  try {
    const priceMonitor = new PriceMonitorService();
    priceMonitor.start();
    res.json({ message: 'Price monitoring started' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/monitor/stop', (req, res) => {
  try {
    const priceMonitor = new PriceMonitorService();
    priceMonitor.stop();
    res.json({ message: 'Price monitoring stopped' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Error:', error);

  if (error.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation Error',
      details: Object.values(error.errors).map(e => e.message)
    });
  }

  if (error.name === 'CastError') {
    return res.status(400).json({
      error: 'Invalid ID format'
    });
  }

  if (error.code === 11000) {
    return res.status(400).json({
      error: 'Duplicate entry',
      field: Object.keys(error.keyPattern)[0]
    });
  }

  res.status(500).json({
    error: 'Internal Server Error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🔧 Environment: ${process.env.NODE_ENV || 'development'}`);

  // Start price monitoring service
  const priceMonitor = new PriceMonitorService();
  priceMonitor.start();
  console.log('💰 Price monitoring service started');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  server.close(() => {
    console.log('Process terminated');
  });
});

module.exports = app;