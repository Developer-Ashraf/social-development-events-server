const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const { verifyToken, verifyTokenOptional } = require('./middleware/auth');

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

// Helper function to create JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET || 'secret_key', {
    expiresIn: '7d'
  });
};

// Root Health Check Route
app.get('/', (req, res) => {
  res.send({
    success: true,
    message: 'Social Development Events Platform Server is running healthy!',
    version: '1.0.0',
    timestamp: new Date()
  });
});

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
    // Connect to database
    await client.connect();
    
    const db = client.db(process.env.DB_NAME || 'social_events_db');
    const usersCollection = db.collection('users');
    const eventsCollection = db.collection('events');
    const joinedEventsCollection = db.collection('joined_events');

    await db.command({ ping: 1 });
    console.log("Successfully connected to MongoDB Atlas!");

    // ==========================================
    // 1. AUTHENTICATION & USER MANAGEMENT
    // ==========================================

    // Register a new user with password validation
    app.post('/api/auth/register', async (req, res) => {
      try {
        const { name, email, photoURL, password } = req.body;

        if (!name || !email || !password) {
          return res.status(400).send({
            success: false,
            message: 'Name, email, and password are required.'
          });
        }

        // Password criteria: min 6 chars, at least 1 uppercase, at least 1 lowercase
        const hasUpperCase = /[A-Z]/.test(password);
        const hasLowerCase = /[a-z]/.test(password);
        const hasMinLength = password.length >= 6;

        if (!hasUpperCase || !hasLowerCase || !hasMinLength) {
          return res.status(400).send({
            success: false,
            message: 'Password must contain at least 1 uppercase letter, 1 lowercase letter, and be at least 6 characters long.'
          });
        }

        const normalizedEmail = email.toLowerCase().trim();
        const existingUser = await usersCollection.findOne({ email: normalizedEmail });
        if (existingUser) {
          return res.status(409).send({
            success: false,
            message: 'An account with this email already exists. Please log in.'
          });
        }

        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(password, salt);

        const newUser = {
          name: name.trim(),
          email: normalizedEmail,
          photoURL: photoURL ? photoURL.trim() : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
          password: hashedPassword,
          createdAt: new Date()
        };

        const result = await usersCollection.insertOne(newUser);

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

        const normalizedEmail = email.toLowerCase().trim();
        const user = await usersCollection.findOne({ email: normalizedEmail });
        if (!user) {
          return res.status(401).send({
            success: false,
            message: 'Invalid email or password.'
          });
        }

        if (!user.password) {
          return res.status(400).send({
            success: false,
            message: 'This account was created via Google. Please log in with Google.'
          });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
          return res.status(401).send({
            success: false,
            message: 'Invalid email or password.'
          });
        }

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

    // Google Sign-in sync endpoint
    app.post('/api/auth/google', async (req, res) => {
      try {
        const { name, email, photoURL } = req.body;

        if (!email) {
          return res.status(400).send({ success: false, message: 'Email is required for Google login.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let user = await usersCollection.findOne({ email: normalizedEmail });

        if (!user) {
          const newUser = {
            name: name || 'Google Volunteer',
            email: normalizedEmail,
            photoURL: photoURL || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            authProvider: 'google',
            createdAt: new Date()
          };
          const result = await usersCollection.insertOne(newUser);
          user = { ...newUser, _id: result.insertedId };
        } else {
          // Update existing user with fresh Google photoURL & name
          const updateFields = {};
          if (photoURL) updateFields.photoURL = photoURL;
          if (name) updateFields.name = name;
          updateFields.authProvider = user.authProvider || 'google';

          await usersCollection.updateOne({ _id: user._id }, { $set: updateFields });
          user = { ...user, ...updateFields };
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

    // GitHub Sign-in sync endpoint
    app.post('/api/auth/github', async (req, res) => {
      try {
        const { name, email, photoURL } = req.body;

        if (!email) {
          return res.status(400).send({ success: false, message: 'Email is required for GitHub login.' });
        }

        const normalizedEmail = email.toLowerCase().trim();
        let user = await usersCollection.findOne({ email: normalizedEmail });

        if (!user) {
          const newUser = {
            name: name || 'GitHub Developer',
            email: normalizedEmail,
            photoURL: photoURL || 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150',
            authProvider: 'github',
            createdAt: new Date()
          };
          const result = await usersCollection.insertOne(newUser);
          user = { ...newUser, _id: result.insertedId };
        } else {
          // Always update existing user with fresh GitHub photoURL & name
          const updateFields = {};
          if (photoURL) updateFields.photoURL = photoURL;
          if (name) updateFields.name = name;
          updateFields.authProvider = user.authProvider || 'github';

          await usersCollection.updateOne({ _id: user._id }, { $set: updateFields });
          user = { ...user, ...updateFields };
        }

        const token = generateToken({
          id: user._id,
          email: user.email,
          name: user.name
        });

        res.send({
          success: true,
          message: 'GitHub login successful!',
          token,
          user: {
            id: user._id,
            name: user.name,
            email: user.email,
            photoURL: user.photoURL
          }
        });

      } catch (error) {
        console.error('GitHub Auth Error:', error);
        res.status(500).send({ success: false, message: 'Failed to authenticate with GitHub.' });
      }
    });

    // Get current authenticated user profile
    app.get('/api/auth/me', verifyToken, async (req, res) => {
      try {
        const user = await usersCollection.findOne(
          { email: req.user.email.toLowerCase() },
          { projection: { password: 0 } }
        );

        if (!user) {
          return res.status(404).send({ success: false, message: 'User not found.' });
        }

        res.send({
          success: true,
          user: {
            id: user._id,
            _id: user._id,
            name: user.name,
            email: user.email,
            photoURL: user.photoURL,
            authProvider: user.authProvider || 'email'
          }
        });
      } catch (error) {
        console.error('Auth Me Error:', error);
        res.status(500).send({ success: false, message: 'Failed to fetch user data.' });
      }
    });

    // PUT /api/auth/profile - Update user profile (Name & photoURL)
    app.put('/api/auth/profile', verifyToken, async (req, res) => {
      try {
        const { name, photoURL } = req.body;
        const userEmail = req.user.email.toLowerCase();

        if (!name || name.trim() === '') {
          return res.status(400).send({ success: false, message: 'Name cannot be empty.' });
        }

        const updateDoc = {
          $set: {
            name: name.trim(),
            photoURL: photoURL ? photoURL.trim() : 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
            updatedAt: new Date()
          }
        };

        const result = await usersCollection.updateOne(
          { email: userEmail },
          updateDoc
        );

        if (result.matchedCount === 0) {
          return res.status(404).send({ success: false, message: 'User not found.' });
        }

        // Sync name updates across events and joined records
        await eventsCollection.updateMany(
          { creatorEmail: userEmail },
          { $set: { creatorName: updateDoc.$set.name } }
        );

        await joinedEventsCollection.updateMany(
          { userEmail: userEmail },
          { $set: { userName: updateDoc.$set.name } }
        );

        res.send({
          success: true,
          message: 'Profile updated successfully!',
          user: {
            name: updateDoc.$set.name,
            photoURL: updateDoc.$set.photoURL,
            email: userEmail
          }
        });

      } catch (error) {
        console.error('Update Profile Error:', error);
        res.status(500).send({ success: false, message: 'Failed to update profile.' });
      }
    });

    // ==========================================
    // 2. SPECIFIC EVENT ROUTES (MUST PRECEDE /:id)
    // ==========================================

    // GET /api/events/recent-upcoming - 6 upcoming events for home page
    app.get('/api/events/recent-upcoming', async (req, res) => {
      try {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const events = await eventsCollection
          .find({ eventDate: { $gte: today } })
          .sort({ eventDate: 1 })
          .limit(6)
          .toArray();

        res.send({
          success: true,
          count: events.length,
          events
        });
      } catch (error) {
        console.error('Fetch Recent Upcoming Events Error:', error);
        res.status(500).send({ success: false, message: 'Failed to retrieve recent upcoming events.' });
      }
    });

    // GET /api/events/user/joined - Get all events joined by current user (sorted by event date)
    app.get('/api/events/user/joined', verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email.toLowerCase();

        const joinedList = await joinedEventsCollection
          .find({ userEmail })
          .sort({ eventDate: 1 })
          .toArray();

        res.send({
          success: true,
          count: joinedList.length,
          joinedEvents: joinedList
        });
      } catch (error) {
        console.error('Fetch Joined Events Error:', error);
        res.status(500).send({ success: false, message: 'Failed to retrieve joined events.' });
      }
    });

    // GET /api/events/user/created - Get all events created by current user
    app.get('/api/events/user/created', verifyToken, async (req, res) => {
      try {
        const creatorEmail = req.user.email.toLowerCase();

        const myEvents = await eventsCollection
          .find({ creatorEmail })
          .sort({ createdAt: -1 })
          .toArray();

        res.send({
          success: true,
          count: myEvents.length,
          events: myEvents
        });
      } catch (error) {
        console.error('Fetch My Events Error:', error);
        res.status(500).send({ success: false, message: 'Failed to retrieve your created events.' });
      }
    });

    // GET /api/events - Get upcoming events with search, category filter, and pagination
    app.get('/api/events', async (req, res) => {
      try {
        const { search, category, limit } = req.query;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const query = {
          eventDate: { $gte: today }
        };

        if (category && category !== 'All') {
          query.eventType = { $regex: new RegExp(`^${category}$`, 'i') };
        }

        if (search && search.trim() !== '') {
          const searchRegex = new RegExp(search.trim(), 'i');
          query.$or = [
            { title: searchRegex },
            { location: searchRegex }
          ];
        }

        let cursor = eventsCollection.find(query).sort({ eventDate: 1 });

        if (limit) {
          const parsedLimit = parseInt(limit);
          if (!isNaN(parsedLimit) && parsedLimit > 0) {
            cursor = cursor.limit(parsedLimit);
          }
        }

        const events = await cursor.toArray();

        res.send({
          success: true,
          count: events.length,
          events
        });

      } catch (error) {
        console.error('Fetch Events Error:', error);
        res.status(500).send({ success: false, message: 'Failed to retrieve upcoming events.' });
      }
    });

    // POST /api/events - Create a new event (Private Route)
    app.post('/api/events', verifyToken, async (req, res) => {
      try {
        const { title, description, eventType, thumbnail, location, eventDate } = req.body;

        if (!title || !description || !eventType || !location || !eventDate) {
          return res.status(400).send({
            success: false,
            message: 'All fields (title, description, eventType, location, eventDate) are required.'
          });
        }

        const parsedDate = new Date(eventDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (isNaN(parsedDate.getTime()) || parsedDate < today) {
          return res.status(400).send({
            success: false,
            message: 'Event date must be a valid future date. Past dates are not allowed.'
          });
        }

        const newEvent = {
          title: title.trim(),
          description: description.trim(),
          eventType: eventType.trim(),
          thumbnail: thumbnail || 'https://images.unsplash.com/photo-1593113598332-cd288d649433?w=800',
          location: location.trim(),
          eventDate: parsedDate,
          creatorEmail: req.user.email.toLowerCase(),
          creatorName: req.user.name || 'Community Leader',
          createdAt: new Date(),
          attendeesCount: 0
        };

        const result = await eventsCollection.insertOne(newEvent);

        res.status(201).send({
          success: true,
          message: 'Event created successfully!',
          eventId: result.insertedId,
          event: { ...newEvent, _id: result.insertedId }
        });

      } catch (error) {
        console.error('Create Event Error:', error);
        res.status(500).send({ success: false, message: 'Failed to create event.' });
      }
    });

    // ==========================================
    // 3. PARAMETERIZED EVENT ROUTES (/:id)
    // ==========================================

    // GET /api/events/:id - Get single event details
    app.get('/api/events/:id', verifyTokenOptional, async (req, res) => {
      try {
        const { id } = req.params;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: 'Invalid Event ID format.' });
        }

        const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!event) {
          return res.status(404).send({ success: false, message: 'Event not found.' });
        }

        const totalJoined = await joinedEventsCollection.countDocuments({ eventId: id });

        let hasJoined = false;
        if (req.user && req.user.email) {
          const userJoinRecord = await joinedEventsCollection.findOne({
            eventId: id,
            userEmail: req.user.email.toLowerCase()
          });
          if (userJoinRecord) {
            hasJoined = true;
          }
        }

        res.send({
          success: true,
          event: {
            ...event,
            attendeesCount: totalJoined,
            isJoined: hasJoined
          }
        });

      } catch (error) {
        console.error('Fetch Event Details Error:', error);
        res.status(500).send({ success: false, message: 'Failed to load event details.' });
      }
    });

    // PUT /api/events/:id - Update an event with strict ownership check
    app.put('/api/events/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email.toLowerCase();
        const { title, description, eventType, thumbnail, location, eventDate } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: 'Invalid Event ID format.' });
        }

        const existingEvent = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!existingEvent) {
          return res.status(404).send({ success: false, message: 'Event not found.' });
        }

        if (existingEvent.creatorEmail !== userEmail) {
          return res.status(403).send({
            success: false,
            message: 'Forbidden. You do not have permission to edit this event.'
          });
        }

        let parsedDate = existingEvent.eventDate;
        if (eventDate) {
          parsedDate = new Date(eventDate);
          const today = new Date();
          today.setHours(0, 0, 0, 0);

          if (isNaN(parsedDate.getTime()) || parsedDate < today) {
            return res.status(400).send({
              success: false,
              message: 'Event date must be in the future. Past dates cannot be selected.'
            });
          }
        }

        const updateDoc = {
          $set: {
            title: title ? title.trim() : existingEvent.title,
            description: description ? description.trim() : existingEvent.description,
            eventType: eventType ? eventType.trim() : existingEvent.eventType,
            thumbnail: thumbnail || existingEvent.thumbnail,
            location: location ? location.trim() : existingEvent.location,
            eventDate: parsedDate,
            updatedAt: new Date()
          }
        };

        await eventsCollection.updateOne({ _id: new ObjectId(id) }, updateDoc);

        // Update joined events cache records
        await joinedEventsCollection.updateMany(
          { eventId: id },
          {
            $set: {
              eventTitle: updateDoc.$set.title,
              eventDate: updateDoc.$set.eventDate,
              location: updateDoc.$set.location,
              thumbnail: updateDoc.$set.thumbnail,
              eventType: updateDoc.$set.eventType
            }
          }
        );

        res.send({
          success: true,
          message: 'Event updated successfully!',
          updatedEvent: { ...existingEvent, ...updateDoc.$set }
        });

      } catch (error) {
        console.error('Update Event Error:', error);
        res.status(500).send({ success: false, message: 'Failed to update event.' });
      }
    });

    // DELETE /api/events/:id - Delete an event with strict ownership check
    app.delete('/api/events/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email.toLowerCase();

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: 'Invalid Event ID format.' });
        }

        const existingEvent = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!existingEvent) {
          return res.status(404).send({ success: false, message: 'Event not found.' });
        }

        // Ownership enforcement
        if (existingEvent.creatorEmail !== userEmail) {
          return res.status(403).send({
            success: false,
            message: 'Forbidden. You do not have permission to delete this event.'
          });
        }

        // Delete event from events collection
        await eventsCollection.deleteOne({ _id: new ObjectId(id) });

        // Clean up any joined records for this event
        await joinedEventsCollection.deleteMany({ eventId: id });

        res.send({
          success: true,
          message: 'Event deleted successfully.'
        });

      } catch (error) {
        console.error('Delete Event Error:', error);
        res.status(500).send({ success: false, message: 'Failed to delete event.' });
      }
    });

    // POST /api/events/:id/join - Join an event
    app.post('/api/events/:id/join', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email.toLowerCase();
        const userName = req.user.name;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: 'Invalid Event ID format.' });
        }

        const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!event) {
          return res.status(404).send({ success: false, message: 'Event not found.' });
        }

        const existingJoin = await joinedEventsCollection.findOne({
          eventId: id,
          userEmail
        });

        if (existingJoin) {
          return res.status(400).send({
            success: false,
            message: 'You have already joined this event.'
          });
        }

        const joinRecord = {
          eventId: id,
          eventTitle: event.title,
          eventDate: event.eventDate,
          location: event.location,
          thumbnail: event.thumbnail,
          eventType: event.eventType,
          userEmail,
          userName,
          joinedAt: new Date()
        };

        await joinedEventsCollection.insertOne(joinRecord);

        await eventsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { attendeesCount: 1 } }
        );

        res.send({
          success: true,
          message: 'You have successfully joined this event! Thank you for participating.',
          joinedAt: joinRecord.joinedAt
        });

      } catch (error) {
        console.error('Join Event Error:', error);
        res.status(500).send({ success: false, message: 'Failed to join event.' });
      }
    });

    // POST /api/events/:id/leave - Leave an event
    app.post('/api/events/:id/leave', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email.toLowerCase();

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: 'Invalid Event ID format.' });
        }

        const existingJoin = await joinedEventsCollection.findOne({
          eventId: id,
          userEmail
        });

        if (!existingJoin) {
          return res.status(400).send({
            success: false,
            message: 'You have not joined this event yet.'
          });
        }

        await joinedEventsCollection.deleteOne({
          eventId: id,
          userEmail
        });

        await eventsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { attendeesCount: -1 } }
        );

        res.send({
          success: true,
          message: 'You have left the event.'
        });

      } catch (error) {
        console.error('Leave Event Error:', error);
        res.status(500).send({ success: false, message: 'Failed to leave event.' });
      }
    });

    // ==========================================
    // 4. NOT FOUND & ERROR HANDLING MIDDLEWARE
    // ==========================================

    // 404 handler for unmatched routes
    app.use((req, res) => {
      res.status(404).send({
        success: false,
        message: `Route not found: ${req.method} ${req.originalUrl}`
      });
    });

    // Global error handler
    app.use((err, req, res, next) => {
      console.error('Global Error Handler:', err.stack);
      res.status(500).send({
        success: false,
        message: 'Something went wrong on the server!',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
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
