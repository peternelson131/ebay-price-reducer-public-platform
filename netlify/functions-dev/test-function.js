exports.handler = async (event, context) => {
  console.log('Test function called');
  console.log('Method:', event.httpMethod);
  console.log('Query:', event.queryStringParameters);

  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    },
    body: JSON.stringify({
      message: 'Test function working',
      timestamp: new Date().toISOString(),
      method: event.httpMethod,
      query: event.queryStringParameters
    })
  };
};