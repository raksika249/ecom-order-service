const AWS = require("aws-sdk");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");

const dynamodb = new AWS.DynamoDB.DocumentClient();

const ORDERS_TABLE = process.env.ORDERS_TABLE;
const NOTIFICATIONS_TABLE = process.env.NOTIFICATIONS_TABLE;
const JWT_SECRET = process.env.JWT_SECRET;

exports.handler = async (event) => {
  try {
    /* ---------------- AUTH ---------------- */
    const headers = event.headers || {};
    const authHeader =
      headers.authorization ||
      headers.Authorization ||
      headers.AUTHORIZATION;

    if (!authHeader) {
      return { statusCode: 401, body: JSON.stringify({ message: "Unauthorized" }) };
    }

    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    const email = decoded.email;

    /* ---------------- BODY ---------------- */
    const body = JSON.parse(event.body || "{}");
    const items = body.items;

    if (!items || items.length === 0) {
      return {
        statusCode: 400,
        body: JSON.stringify({ message: "Cart is empty" })
      };
    }

    /* ---------------- CALCULATION ---------------- */
    let totalAmount = 0;
    items.forEach(item => {
      totalAmount += item.price * item.quantity;
    });

    const orderID = "ORD-" + Date.now();

    /* ---------------- SAVE ORDER ---------------- */
    await dynamodb.put({
      TableName: ORDERS_TABLE,
      Item: {
        orderID,
        userEmail: email,
        items,
        totalAmount,
        orderStatus: "CONFIRMED",
        createdAt: new Date().toISOString()
      }
    }).promise();

    /* ---------------- SAVE NOTIFICATION ---------------- */
    await dynamodb.put({
      TableName: NOTIFICATIONS_TABLE,
      Item: {
        notificationId: Date.now().toString(),
        userEmail: email,
        message: `✅ Order placed successfully (${orderID})`,
        isRead: false,
        createdAt: new Date().toISOString()
      }
    }).promise();

    /* ---------------- EMAIL ---------------- */
    const itemsText = items
      .map(i => `${i.name} x ${i.quantity} = ₹${i.price * i.quantity}`)
      .join("\n");

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    await transporter.sendMail({
      from: `"Product Shop" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "Order Confirmed",
      text: `
Your order was placed successfully!

Order ID: ${orderID}

Items:
${itemsText}

Total Amount: ₹${totalAmount}

Thank you for shopping with us!
`
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        message: "Order placed successfully",
        orderID
      })
    };

  } catch (error) {
    console.error("ORDER ERROR:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
