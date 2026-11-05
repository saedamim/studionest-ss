# StudioNest Server — Backend API

The backend REST API for StudioNest, a peer-to-peer creative studio booking platform.

💻 **Server Repository:** [Add Your Server GitHub URL]

---

## About the Backend

StudioNest Server is built with Node.js, Express.js, and MongoDB.

It provides RESTful APIs for studio management, user-specific listings, and booking operations. Better Auth and JWT-based authentication are used to secure protected backend resources.

## Technology Stack

- Node.js
- Express.js
- MongoDB
- MongoDB Native Driver
- Better Auth
- JWT Authentication
- dotenv
- CORS

## Key Features

- RESTful API architecture.
- MongoDB database integration.
- Retrieve all available studios.
- Retrieve featured studios.
- Retrieve individual studio details.
- Add new studio listings.
- Update existing studio listings.
- Delete studio listings.
- Retrieve authenticated user's studio listings.
- Create studio bookings.
- Retrieve user's bookings.
- Cancel pending bookings.
- JWT-based authentication and authorization.
- Request validation and error handling.



### Studio APIs

| Method | Endpoint | Description |
|---|---|---|
| GET | `/` | Server health check |
| GET | `/studios` | Get all studios |
| GET | `/studios/featured` | Get featured studios |
| GET | `/studios/:id` | Get studio by ID |
| POST | `/studios` | Create a studio |
| PATCH | `/studios/:id` | Update a studio |
| DELETE | `/studios/:id` | Delete a studio |
| GET | `/my-listings` | Get user's listings |

### Booking APIs

| Method | Endpoint | Description |
|---|---|---|
| POST | `/bookings` | Create a booking |
| GET | `/my-bookings` | Get user's bookings |
| PATCH | `/bookings/:id/cancel` | Cancel a pending booking |

**Authentication:** Protected endpoints must receive a valid authentication token. The backend verifies the token and checks user ownership before allowing protected operations.

## Local Setup

### Prerequisites

- Node.js
- npm
- MongoDB Atlas account or local MongoDB
- Git


## Author

**Name:**Saeda Yeasmin

**GitHub:** [Your GitHub Profile](YOUR_GITHUB_PROFILE_URL)

**Project:** StudioNest

---

Developed with ❤️ using Node.js, Express.js, and MongoDB.
