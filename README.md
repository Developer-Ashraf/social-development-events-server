# 🌍 CivicPulse - Citizen Action Platform Server API

The backend REST API server for the **CivicPulse Social Development Events Platform**, built with **Node.js, Express.js, nodemon, MongoDB Atlas**, and **JWT Authentication**.

## 🔗 Live & Repository Links
- **Live Client Application:** [https://social-development-events-client-liart.vercel.app](https://social-development-events-client-liart.vercel.app)
- **Live Server API:** [https://social-development-events-server-nine.vercel.app](https://social-development-events-server-nine.vercel.app)
- **Client Repository:** [https://github.com/Developer-Ashraf/social-development-events-client](https://github.com/Developer-Ashraf/social-development-events-client)
- **Server Repository:** [https://github.com/Developer-Ashraf/social-development-events-server](https://github.com/Developer-Ashraf/social-development-events-server)

---

## ✨ Core Features & Highlights
1. **JWT-Secured Protected Routes:** Middleware verification ensures that event creation, updating, deletion, and joining require authenticated user tokens.
2. **Strict Ownership Validation:** Users can exclusively edit or delete their own created events (`creatorEmail` match).
3. **Future Date Validation:** Server-side date validation prevents events from being created or updated with past dates.
4. **Dynamic Upcoming Event Filtering:** Excludes past events automatically, sorting active community drives chronologically.
5. **MongoDB Native Driver & Indexing:** Utilizes official MongoDB Node.js driver with optimized `.limit(6)` query for recent homepage events.
6. **Volunteer Attendance Tracking:** Automatically maintains participation counts and synchronizes joined records.
7. **OAuth Profile Synchronization:** Live profile updates and OAuth synchronization for Google and GitHub accounts.
8. **Nodemon Watcher:** Pre-configured `npm run dev` script using `nodemon` for active live reloading.

---

## 🛠️ Tech Stack
- **Runtime:** Node.js (v20+)
- **Framework:** Express.js
- **Dev Watcher:** nodemon
- **Database:** MongoDB Atlas (Native MongoDB Driver v6)
- **Security & Auth:** JSON Web Tokens (JWT), bcryptjs
- **Environment Management:** dotenv, CORS

---

## 📡 API Endpoint Reference

### 🔐 Authentication
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/auth/register` | Public | Register with name, email, photoURL, and validated password |
| `POST` | `/api/auth/login` | Public | Authenticate with email & password, returns JWT |
| `POST` | `/api/auth/google` | Public | Social Google auth login & profile sync |
| `POST` | `/api/auth/github` | Public | Social GitHub auth login & profile sync |
| `GET` | `/api/auth/me` | Private | Retrieve authenticated user profile |
| `PUT` | `/api/auth/profile` | Private | Update user display name and avatar photo |

### 📅 Community Events
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/events` | Public | Get all upcoming events (supports `?search=`, `?category=`, `?limit=`) |
| `GET` | `/api/events/recent-upcoming` | Public | Top 6 upcoming events using `.limit(6)` for home banner |
| `GET` | `/api/events/:id` | Public | Get event details with volunteer attendance count |
| `POST` | `/api/events` | Private | Create an event (future date validation required) |
| `PUT` | `/api/events/:id` | Private | Update event details (creator ownership enforced) |
| `DELETE` | `/api/events/:id` | Private | Delete event (creator ownership enforced) |

### 🤝 Event Participation (Join/Leave)
| Method | Endpoint | Access | Description |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/events/:id/join` | Private | Join a community event as a volunteer |
| `POST` | `/api/events/:id/leave` | Private | Cancel volunteer registration |
| `GET` | `/api/events/user/joined` | Private | Get user's joined events (sorted by event date) |
| `GET` | `/api/events/user/created` | Private | Get user's managed/created events |

---

## 🚀 Setup & Local Execution
1. Clone the repository:
   ```bash
   git clone https://github.com/Developer-Ashraf/social-development-events-server.git
   cd social-development-events-server
   ```
2. Install dependencies:
   ```bash
   npm install
   ```
3. Create `.env` file in root directory (refer to `.env.example`):
   ```env
   PORT=5000
   MONGODB_URI=your_mongodb_atlas_connection_string
   DB_NAME=social_events_db
   JWT_SECRET=your_secret_jwt_key
   CLIENT_URL=http://localhost:3000
   ```
4. Run server:
   ```bash
   npm run dev
   # Server runs on http://localhost:5000 with nodemon
   ```
