// Test function to debug OAuth callback
exports.handler = async (event, context) => {
  const { code, state } = event.queryStringParameters || {};

  console.log('OAuth Callback Test');
  console.log('Code received:', code ? 'Yes' : 'No');
  console.log('State received:', state ? 'Yes' : 'No');
  console.log('Code length:', code ? code.length : 0);
  console.log('State:', state);

  // Test if we can call the callback handler
  try {
    const callbackHandler = require('./ebay-oauth-callback');
    console.log('Callback handler loaded successfully');

    // Call it
    const result = await callbackHandler.handler(event, context);
    console.log('Callback handler result status:', result.statusCode);

    return result;
  } catch (error) {
    console.error('Error calling callback handler:', error.message);
    console.error('Stack:', error.stack);

    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'text/html'
      },
      body: `
        <!DOCTYPE html>
        <html>
        <head><title>OAuth Debug</title></head>
        <body>
          <h1>OAuth Callback Debug</h1>
          <p>Code: ${code ? 'Received' : 'Missing'}</p>
          <p>State: ${state ? 'Received' : 'Missing'}</p>
          <p>Error: ${error.message}</p>
          <pre>${error.stack}</pre>
        </body>
        </html>
      `
    };
  }
};