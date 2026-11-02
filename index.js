const express = require('express');
const cors = require('cors');
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

// Root health check route
app.get('/', (req, res) => {
  res.send({
    status: 'success',
    message: 'Social Development Events Platform Server is Running!',
    timestamp: new Date().toISOString()
  });
});

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
