# Social Development Events Platform - Server API

Backend server built with **Express.js**, **MongoDB**, and **JWT authentication** for the Social Development Events Platform.

## 🚀 Live Server API
- **Base URL:** `http://localhost:5000` (Local) / Production Deployment URL

## 🛠️ Tech Stack
- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB Atlas (Native MongoDB Driver)
- **Authentication:** JSON Web Tokens (JWT) & bcryptjs
- **Security:** CORS, Environment Variables (dotenv)

## 📦 Setup & Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/Developer-Ashraf/social-development-events-server.git
   cd social-development-events-server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Configure environment variables in `.env`:
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_connection_string
   DB_NAME=social_events_db
   JWT_SECRET=your_jwt_secret
   CLIENT_URL=http://localhost:3000
   ```
4. Start the development server:
   ```bash
   npm run dev
   ```
