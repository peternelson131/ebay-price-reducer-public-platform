const { Handler } = require('@netlify/functions');
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { userId, type, title, message, data } = JSON.parse(event.body || '{}');

    if (!userId || !type || !title || !message) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({
          error: 'Missing required fields: userId, type, title, message'
        })
      };
    }

    // Create notification
    const { data: notification, error } = await supabase
      .from('notifications')
      .insert({
        user_id: userId,
        type,
        title,
        message,
        data: data || {},
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to create notification: ${error.message}`);
    }

    // Get user's notification preferences
    const { data: user } = await supabase
      .from('users')
      .select('email, notification_preferences')
      .eq('id', userId)
      .single();

    // Send email if enabled (placeholder - implement actual email service)
    if (user?.notification_preferences?.email && process.env.EMAIL_HOST) {
      await sendEmailNotification(user.email, title, message);
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        success: true,
        notification,
        timestamp: new Date().toISOString()
      })
    };

  } catch (error) {
    console.error('Notification service failed:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      })
    };
  }
};

// Placeholder for email service
async function sendEmailNotification(email, title, message) {
  // TODO: Implement actual email service (SendGrid, AWS SES, etc.)
  console.log(`Email notification sent to ${email}: ${title}`);
}

module.exports = { handler };