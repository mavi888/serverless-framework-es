const { v4: uuidv4 } = require('uuid');

const { SQSClient, SendMessageCommand } = require ("@aws-sdk/client-sqs");

// Create an SQS client
const sqsClient = new SQSClient({ region: process.env.REGION });


exports.newOrder = async (event) => {

  const orderId = uuidv4();
  console.log(orderId);

  let orderDetails;
  try {
    orderDetails = JSON.parse(event.body); 
  } catch (error) {
    console.error("Error parsing order details:", error);
    return {
      statusCode: 400,
      body: JSON.stringify({ message: "Invalid JSON format in order details" }),
    };
  }

  console.log(orderDetails)

  const order = {orderId, ...orderDetails}

  await sendMessageToSQS(order);

  return {
    statusCode: 200,
    body: JSON.stringify({
      message: order  
    }),
  };
}

exports.getOrder = async (event) => {
  console.log(event);

  const orderId = event.pathParameters.orderId

  const orderDetails = {
    "pizza": "Margarita",
    "customerId": 1,
    "order_status": "COMPLETED"
  }

  const order = {orderId, ...orderDetails}

  console.log(order);

  return {
    statusCode: 200,
    body: JSON.stringify({message: order})
  };
}

exports.prepOrder = async (event) => {
  console.log(event);

  return;
};


async function sendMessageToSQS(message) {

  const params = {
    QueueUrl: process.env.PENDING_ORDERS_QUEUE,
    MessageBody: JSON.stringify(message)
  };

  console.log(params);

  try {
    const command = new SendMessageCommand(params);
    const data = await sqsClient.send(command);
    console.log("Message sent successfully:", data.MessageId);
    return data;
  } catch (error) {
    console.error("Error sending message:", error);
    throw error;
  }
}