const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_ANON_KEY || ''
);

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      // For development, use a mock user if no auth header
      if (process.env.NODE_ENV === 'development') {
        req.user = {
          id: '00000000-0000-0000-0000-000000000001',
          email: 'demo@example.com',
          name: 'Demo User'
        };
        return next();
      }

      return res.status(401).json({
        success: false,
        message: 'No authentication token provided'
      });
    }

    const token = authHeader.substring(7);

    // Verify the token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      // For development, use mock user if verification fails
      if (process.env.NODE_ENV === 'development') {
        req.user = {
          id: '00000000-0000-0000-0000-000000000001',
          email: 'demo@example.com',
          name: 'Demo User'
        };
        return next();
      }

      return res.status(401).json({
        success: false,
        message: 'Invalid or expired token'
      });
    }

    // Attach user to request
    req.user = {
      id: user.id,
      email: user.email,
      name: user.user_metadata?.name || user.email?.split('@')[0] || 'User'
    };

    next();
  } catch (error) {
    console.error('Authentication error:', error);

    // For development, use mock user on any error
    if (process.env.NODE_ENV === 'development') {
      req.user = {
        id: '00000000-0000-0000-0000-000000000001',
        email: 'demo@example.com',
        name: 'Demo User'
      };
      return next();
    }

    res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Optional middleware to check if user has specific permissions
const requirePermission = (permission) => {
  return (req, res, next) => {
    // For now, we'll allow all authenticated users
    // In production, you would check user roles/permissions here
    if (!req.user) {
      return res.status(403).json({
        success: false,
        message: 'Permission denied'
      });
    }
    next();
  };
};

module.exports = {
  authenticate,
  requirePermission
};