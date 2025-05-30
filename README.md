 # Bitespeed Identity Service

A contact identity resolution service for Bitespeed, built with Node.js, TypeScript, Express, and Prisma (PostgreSQL).

### Deployment URL : `https://bitespeed-8orq.onrender.com`
![image](https://github.com/user-attachments/assets/b2f02598-b70e-46cb-8f4c-381751e51098)

## Features
- **/identify**: Resolve and link contacts by email and/or phone number

## Tech Stack
- Node.js
- TypeScript
- Express
- Prisma ORM
- PostgreSQL

## Getting Started

### Prerequisites
- Node.js (v18 or higher)
- npm
- PostgreSQL database

### Installation
1. **Clone the repository:**
   ```sh
   git clone <repo-url>
   cd Bitespeed
   ```
2. **Install dependencies:**
   ```sh
   npm install
   ```
3. **Set up environment variables:**
   Create a `.env` file in the root directory with the following:
   ```env
   DATABASE_URL=postgresql://<user>:<password>@<host>:<port>/<database>
   PORT=3000 # optional, defaults to 3000
   ```
4. **Set up the database:**
   ```sh
   npx prisma migrate dev --name init
   npx prisma generate
   ```

### Running the Service
- **Development mode:**
  ```sh
  npm run dev
  ```
- **Production build:**
  ```sh
  npm run build
  npm start
  ```

## API Documentation

### POST `/identify`
Identify and link contacts by email and/or phone number.

**Request Body:**
```json
{
  "email": "user@example.com", // optional
  "phoneNumber": "1234567890"  // optional
}
```
At least one of `email` or `phoneNumber` must be provided.

**Response:**
```json
{
  "contact": {
    "primaryContatctId": 1,
    "emails": ["user@example.com"],
    "phoneNumbers": ["1234567890"],
    "secondaryContactIds": [2, 3]
  }
}
```

### GET `/health`
Health check endpoint. Returns status and timestamp.

**Response:**
```json
{
  "status": "OK",
  "timestamp": "2023-01-01T00:00:00.000Z"
}
```

## Database Schema
See [`prisma/schema.prisma`](prisma/schema.prisma) for the full schema. The main model is `Contact` with fields for email, phone number, linkage, and timestamps.

## Scripts
- `npm run dev` — Start in development mode with hot reload
- `npm run build` — Compile TypeScript
- `npm start` — Start compiled app
- `npm run db:migrate` — Run Prisma migrations
- `npm run db:generate` — Generate Prisma client

## License
MIT
