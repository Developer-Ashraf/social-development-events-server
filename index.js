const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// Middleware configuration
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://social-development-events-client.vercel.app'
  ],
  credentials: true
}));
app.use(express.json());

// MongoDB Atlas connection URI
const uri = process.env.MONGODB_URI;
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server
    await client.connect();
    
    // Database and Collections
    const db = client.db(process.env.DB_NAME || 'social_events_db');
    const usersCollection = db.collection('users');
    const eventsCollection = db.collection('events');
    const joinedEventsCollection = db.collection('joined_events');

    // Confirm successful connection with a ping
    await db.command({ ping: 1 });
    console.log("Successfully connected to MongoDB Atlas!");

    // Root health check route
    app.get('/', (req, res) => {
      res.send({
        status: 'success',
        message: 'Social Development Events Platform Server is Running!',
        database: 'Connected to MongoDB Atlas',
        timestamp: new Date().toISOString()
      });
    });

  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
