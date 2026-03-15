const { supabase } = require('../lib/supabase');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'No token provided' });
    }
    const token = authHeader.replace('Bearer ', '').trim();
    const result = await supabase.auth.getUser(token);
    const user = result?.data?.user;
    const error = result?.error;

    if (error || !user) {
      console.error('❌ AuthMiddleware Token Validation Failed!');
      console.error('Error:', error);
      console.error('Token starts with:', token?.substring(0, 10));
      return res.status(401).json({ error: 'Unauthorized' });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(500).json({ error: 'Internal server error' });
  }
};

module.exports = authMiddleware;
