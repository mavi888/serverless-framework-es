const { v4: uuidv4 } = require('uuid');

const { SQSClient, SendMessageCommand } = require ("@aws-sdk/client-sqs");

// Create an SQS client
const sqsClient = new SQSClient({ region: process.env.REGION });

const { DynamoDBClient } = require ("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, GetCommand } = require ("@aws-sdk/lib-dynamodb");

// Create a DynamoDB client
const client = new DynamoDBClient({ region: process.env.REGION }); 

// Create a DynamoDB document client
const docClient = DynamoDBDocumentClient.from(client);

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

  // Save order in the database
  await saveItemToDynamoDB(order);

    // Send message to the queue
  const PENDING_ORDERS_QUEUE_URL = process.env.PENDING_ORDERS_QUEUE;
  await sendMessageToSQS(order, PENDING_ORDERS_QUEUE_URL);

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

  try {
    const order = await getItemFromDynamoDB(orderId);
    console.log(order)
    return {
      statusCode: 200,
      body: JSON.stringify(order)
    };
   } catch (error) {
    console.error("Error retrieving order:", error);

    if (error.name === "ItemNotFoundException") {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: "Order not found" }),
      };
    } else {
      return {
        statusCode: 500,
        body: JSON.stringify({ message: "Error retrieving order" }),
      };
    }
  }
}

exports.prepOrder = async (event) => {
  console.log(event);

  const body = JSON.parse(event.Records[0].body);
  const orderId = body.orderId;

  await updateStatusInOrder(orderId, "COMPLETED");

  return;
};

exports.sendOrder = async (event) => {
  console.log(event);

  if (event.Records[0].eventName === 'MODIFY') {
    const eventBody = event.Records[0].dynamodb;
    console.log(eventBody)

    const orderDetails = eventBody.NewImage;

    const order = {
      orderId: orderDetails.orderId.S,
      pizza: orderDetails.pizza.S,
      customerId: orderDetails.customerId.S,
      order_status: orderDetails.order_status.S
    }

    console.log(order)

    const ORDERS_TO_SEND_QUEUE_URL = process.env.ORDERS_TO_SEND_QUEUE

    await sendMessageToSQS(order, ORDERS_TO_SEND_QUEUE_URL);
  }

  return;
}


async function sendMessageToSQS(message, queueURL) {

  const params = {
    QueueUrl: queueURL,
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

async function saveItemToDynamoDB(item) {

  const params = {
    TableName: process.env.ORDERS_TABLE,
    Item: item
  };

  console.log(params);

  try {
    const command = new PutCommand(params);
    const response = await docClient.send(command);
    console.log("Item saved successfully:", response);
    return response;
  } catch (error) {
    console.error("Error saving item:", error);
    throw error;
  }
}

async function updateStatusInOrder(orderId, status) {

  const params = {
    TableName: process.env.ORDERS_TABLE,
    Key:{orderId},
    UpdateExpression: "SET order_status = :c",
    ExpressionAttributeValues: {
        ":c": status
    },
    ReturnValues: "ALL_NEW"
};

console.log(params);

try {
  const command = new UpdateCommand(params);
  const response = await docClient.send(command);
  console.log("Item updated successfully:", response.Attributes);
  return response.Attributes;
} catch (err) {
  console.error("Error updating item:", err);
  throw err;
}
}


async function getItemFromDynamoDB(orderId) {

  const params = {
    TableName: process.env.ORDERS_TABLE,
    Key:{orderId},
  };

  console.log(params);

  try {
    const command = new GetCommand(params);
    const response = await docClient.send(command);
    
    if (response.Item) {
      console.log("Item retrieved successfully:", response.Item);
      return response.Item;
    } else {
      console.log("Item not found");
      
      let notFoundError = new Error("Item not found");
      notFoundError.name = "ItemNotFoundException";
      throw notFoundError;
    }

  } catch (error) {
    console.error("Error retrieving item:", error);
    throw error;
  }

}