const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
require('dotenv').config();

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

    // ==========================================
    // 2. EVENTS MANAGEMENT API ENDPOINTS
    // ==========================================

    // POST /api/events - Create a new community event (Private Route)
    app.post('/api/events', verifyToken, async (req, res) => {
      try {
        const { title, description, eventType, thumbnail, location, eventDate } = req.body;

        // Validation: required fields
        if (!title || !description || !eventType || !location || !eventDate) {
          return res.status(400).send({
            success: false,
            message: 'All fields (title, description, eventType, location, eventDate) are required.'
          });
        }

        // Strict future date validation
        const parsedDate = new Date(eventDate);
        const today = new Date();
        today.setHours(0, 0, 0, 0); // Start of today

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

    // GET /api/events - Get upcoming events with search, category filter, and limit
    app.get('/api/events', async (req, res) => {
      try {
        const { search, category, limit } = req.query;

        // Base filter: Only events whose dates have NOT passed (upcoming events only)
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const query = {
          eventDate: { $gte: today }
        };

        // Category / Event Type filter
        if (category && category !== 'All') {
          query.eventType = { $regex: new RegExp(`^${category}$`, 'i') };
        }

        // Search filter (matches title or location)
        if (search && search.trim() !== '') {
          const searchRegex = new RegExp(search.trim(), 'i');
          query.$or = [
            { title: searchRegex },
            { location: searchRegex }
          ];
        }

        let cursor = eventsCollection.find(query).sort({ eventDate: 1 });

        // If limit is specified (e.g. limit=6 for homepage), apply MongoDB .limit()
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

    // ==========================================
    // 3. EVENT DETAILS, JOIN & PARTICIPATION
    // ==========================================

    // GET /api/events/user/joined - Get all events joined by logged-in user (Sorted by event date)
    app.get('/api/events/user/joined', verifyToken, async (req, res) => {
      try {
        const userEmail = req.user.email.toLowerCase();

        // Find all records where userEmail matches and sort chronologically by event date
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

    // GET /api/events/:id - Get single event details (Public view + checks user join status)
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

        // Count current joined volunteers
        const totalJoined = await joinedEventsCollection.countDocuments({ eventId: id });

        // Check if the current authenticated user has joined
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

    // POST /api/events/:id/join - Join an event (Private Route)
    app.post('/api/events/:id/join', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email.toLowerCase();
        const userName = req.user.name;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: 'Invalid Event ID.' });
        }

        const event = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!event) {
          return res.status(404).send({ success: false, message: 'Event not found.' });
        }

        // Check if already joined
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

        // Record the participation
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

        // Increment event attendees count
        await eventsCollection.updateOne(
          { _id: new ObjectId(id) },
          { $inc: { attendeesCount: 1 } }
        );

        res.send({
          success: true,
          message: 'You have successfully joined this event! Thank you for gathering for good.',
          joinedAt: joinRecord.joinedAt
        });

      } catch (error) {
        console.error('Join Event Error:', error);
        res.status(500).send({ success: false, message: 'Failed to join event.' });
      }
    });

    // ==========================================
    // 4. MANAGE EVENTS (USER'S CREATED EVENTS)
    // ==========================================

    // GET /api/events/user/created - Get all events created by logged-in user (Private Route)
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

    // PUT /api/events/:id - Update an event with strict ownership check (Private Route)
    app.put('/api/events/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email.toLowerCase();
        const { title, description, eventType, thumbnail, location, eventDate } = req.body;

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: 'Invalid Event ID.' });
        }

        // Check if event exists and verify ownership
        const existingEvent = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!existingEvent) {
          return res.status(404).send({ success: false, message: 'Event not found.' });
        }

        // Ownership enforcement: Only the creator can update the event
        if (existingEvent.creatorEmail !== userEmail) {
          return res.status(403).send({
            success: false,
            message: 'Forbidden. You do not have permission to edit this event.'
          });
        }

        // Date validation: Ensure updated date is not in the past
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

        // Also update joined events snapshot info for consistency
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

    // DELETE /api/events/:id - Delete an event with strict ownership check (Private Route)
    app.delete('/api/events/:id', verifyToken, async (req, res) => {
      try {
        const { id } = req.params;
        const userEmail = req.user.email.toLowerCase();

        if (!ObjectId.isValid(id)) {
          return res.status(400).send({ success: false, message: 'Invalid Event ID.' });
        }

        const existingEvent = await eventsCollection.findOne({ _id: new ObjectId(id) });
        if (!existingEvent) {
          return res.status(404).send({ success: false, message: 'Event not found.' });
        }

        // Ownership enforcement: Only the creator can delete the event
        if (existingEvent.creatorEmail !== userEmail) {
          return res.status(403).send({
            success: false,
            message: 'Forbidden. You do not have permission to delete this event.'
          });
        }

        // Delete from events collection
        await eventsCollection.deleteOne({ _id: new ObjectId(id) });

        // Clean up any joined event records associated with this deleted event
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
