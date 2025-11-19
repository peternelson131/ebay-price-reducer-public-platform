// Test disconnect function

exports.handler = async (event, context) => {
  console.log('Test disconnect called');
  console.log('Method:', event.httpMethod);
  console.log('Query params:', event.queryStringParameters);
  console.log('Headers:', event.headers);

  // Import the main OAuth handler
  const oauthHandler = require('./ebay-oauth');

  // Add disconnect action to query params
  const modifiedEvent = {
    ...event,
    queryStringParameters: {
      ...event.queryStringParameters,
      action: 'disconnect'
    }
  };

  console.log('Calling OAuth handler with disconnect action');

  try {
    const result = await oauthHandler.handler(modifiedEvent, context);
    console.log('Result status:', result.statusCode);
    console.log('Result body:', result.body);
    return result;
  } catch (error) {
    console.error('Error calling OAuth handler:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        error: 'Test failed',
        message: error.message
      })
    };
  }
};