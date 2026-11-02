const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const verifyToken = require('./middleware/auth');

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

// Helper function to create JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret_key', {
    expiresIn: '7d'
  });
};

async function run() {
  try {
    // Connect to database
    await client.connect();
    
    const db = client.db(process.env.DB_NAME || 'social_events_db');
    const usersCollection = db.collection('users');
    const eventsCollection = db.collection('events');
    const joinedEventsCollection = db.collection('joined_events');

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

    // ==========================================
    // 1. AUTHENTICATION & USER MANAGEMENT ROUTES
    // ==========================================

    // Register a new user with password validation
    app.post('/api/auth/register', async (req, res) => {
      try {
        const { name, email, photoURL, password } = req.body;

        // Validation: required fields
        if (!name || !email || !password) {
          return res.status(400).send({
            success: false,
            message: 'Name, email, and password are required.'
          });
        }

        // Password requirements validation:
        // Must contain at least 1 uppercase letter, 1 lowercase letter, min 6 chars
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasMinLength = password.length >= 6;

        if (!hasUpperCase || !hasLowerCase || !hasMinLength) {
          return res.status(400).send({
            success: false,
            message: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, and be at least 6 characters long.'
          });
        }

        // Check if user already exists
        const existingUser = await usersCollection.findOne({ email: email.toLowerCase() });
        if (existingUser) {
          return res.status(409).send({
            success: false,
            message: 'An account with this email already exists. Please log in.'
          });
        }

        // Hash the password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
          name,
          email: email.toLowerCase(),
          photoURL: photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          password: hashedPassword,
          createdAt: new Date()
        };

        const result = await usersCollection.insertOne(newUser);

        // Generate JWT token
        const token = generateToken({
          id: result.insertedId,
          email: newUser.email,
          name: newUser.name
        });

        res.status(201).send({
          success: true,
          message: 'Account registered successfully! Welcome to the platform.',
          token,
          user: {
            id: result.insertedId,
            name: newUser.name,
            email: newUser.email,
            photoURL: newUser.photoURL
          }
        });

      } catch (error) {
        console.error('Registration Error:', error);
        res.status(500).send({ success: false, message: 'Internal server error during registration.' });
      }
    });

    // Login user with email & password
    app.post('/api/auth/login', async (req, res) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).send({
            success: false,
            message: 'Please provide both email and password.'
          });
        }

        const user = await usersCollection.findOne({ email: email.toLowerCase() });
        if (!user) {
          return res.status(401).send({
            success: false,
            message: 'Invalid email or password.'
          });
        }

        // Verify password
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).send({
            success: false,
            message: 'Invalid email or password.'
          });
        }

        // Generate JWT token
        const token = generateToken({
          id: user._id,
          email: user.email,
          name: user.name
        });

        res.send({
          success: true,
          message: 'Logged in successfully! Welcome back.',
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            photoURL: user.photoURL
          }
        });

      } catch (error) {
        console.error('Login Error:', error);
        res.status(500).send({ success: false, message: 'Internal server error during login.' });
      }
    });

    // Google Sign-in / Social Auth sync endpoint
    app.post('/api/auth/google', async (req, res) => {
      try {
        const { name, email, photoURL } = req.body;

        if (!email) {
          return res.status(400).send({ success: false, message: 'Email is required for Google login.' });
        }

        const normalizedEmail = email.toLowerCase();
        let user = await usersCollection.findOne({ email: normalizedEmail });

        if (!user) {
          // If first time Google login, create the user record
          const newUser = {
            name: name || 'Community Volunteer',
            email: normalizedEmail,
            photoURL: photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            authProvider: 'google',
            createdAt: new Date()
          };
          const result = await usersCollection.insertOne(newUser);
          user = { ...newUser, _id: result.insertedId };
        }

        const token = generateToken({
          id: user._id,
          email: user.email,
          name: user.name
        });

        res.send({
          success: true,
          message: 'Google login successful!',
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            photoURL: user.photoURL
          }
        });

      } catch (error) {
        console.error('Google Auth Error:', error);
        res.status(500).send({ success: false, message: 'Failed to authenticate with Google.' });
      }
    });

    // Get current authenticated user profile
    app.get('/api/auth/me', verifyToken, async (req, res) => {
      try {
        const user = await usersCollection.findOne(
          { email: req.user.email },
          { projection: { password: 0 } }
        );

        if (!user) {
          return res.status(404).send({ success: false, message: 'User not found.' });
        }

        res.send({
          success: true,
          user
        });
      } catch (error) {
        res.status(500).send({ success: false, message: 'Failed to fetch user data.' });
      }
    });

  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
}

run().catch(console.dir);

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
