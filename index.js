import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import { createRemoteJWKSet, jwtVerify } from "jose";
import "dotenv/config";

const app = express();
const PORT = Number(process.env.PORT || 8000);
const MONGODB_URI = process.env.MONGODB_URI?.trim();
const AUTH_URL = process.env.BETTER_AUTH_URL?.trim();
const allowedOrigins = (process.env.FRONTEND_URL || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Validate environment variables
if (!MONGODB_URI) {
  throw new Error("MONGODB_URI is missing in Vercel Environment Variables");
}

if (!AUTH_URL) {
  throw new Error("BETTER_AUTH_URL is missing in Vercel Environment Variables");
}

console.log("Environment check:", {
  mongodb: Boolean(MONGODB_URI),
  authUrl: Boolean(AUTH_URL),
  frontendUrl: Boolean(process.env.FRONTEND_URL),
  environment: process.env.VERCEL_ENV,
});

const client = new MongoClient(MONGODB_URI);

const jwks = createRemoteJWKSet(new URL("/api/auth/jwks", AUTH_URL));

let db;

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Authorization, Content-Type",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET, POST, PATCH, DELETE, OPTIONS",
    );
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "1mb" }));

function sendError(res, status, message) {
  return res.status(status).json({ message });
}

function isValidText(value, maxLength = 200) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

function isHttpUrl(value) {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function parseStudioInput(body, partial = false) {
  body = body && typeof body === "object" && !Array.isArray(body) ? body : {};
  const allowedFields = [
    "name",
    "category",
    "location",
    "hourlyRate",
    "securityDeposit",
    "capacity",
    "description",
    "imageUrl",
    "images",
    "amenities",
    "availability",
  ];
  const input = {};
  for (const field of allowedFields) {
    if (Object.hasOwn(body, field)) input[field] = body[field];
  }

  const requiredTextFields = ["name", "category", "location", "description"];
  for (const field of requiredTextFields) {
    if (
      (!partial || Object.hasOwn(input, field)) &&
      !isValidText(input[field], field === "description" ? 10000 : 160)
    ) {
      return { error: `${field} is required and must be valid.` };
    }
  }
  for (const field of ["hourlyRate", "securityDeposit", "capacity"]) {
    if (partial && !Object.hasOwn(input, field)) continue;
    const value = input[field];
    if (
      typeof value !== "number" ||
      !Number.isFinite(value) ||
      value < (field === "capacity" ? 1 : 0)
    ) {
      return { error: `${field} must be a valid non-negative number.` };
    }
    if (field === "capacity" && !Number.isInteger(value))
      return { error: "capacity must be a whole number." };
  }
  if (
    Object.hasOwn(input, "imageUrl") &&
    input.imageUrl &&
    !isHttpUrl(input.imageUrl)
  ) {
    return { error: "imageUrl must be an http or https URL." };
  }
  for (const field of ["images", "amenities", "availability"]) {
    if (
      Object.hasOwn(input, field) &&
      (!Array.isArray(input[field]) ||
        input[field].some((item) => typeof item !== "string"))
    ) {
      return { error: `${field} must be an array of strings.` };
    }
  }
  return { value: input };
}

async function requireAuth(req, res, next) {
  const authorization = req.headers.authorization;
  if (!authorization?.startsWith("Bearer "))
    return sendError(res, 401, "Authentication required.");

  try {
    const { payload } = await jwtVerify(authorization.slice(7), jwks, {
      issuer: AUTH_URL,
      audience: AUTH_URL,
    });
    if (typeof payload.sub !== "string" || !payload.sub)
      return sendError(res, 401, "Invalid access token.");
    req.user = {
      id: payload.sub,
      email: typeof payload.email === "string" ? payload.email : "",
      name: typeof payload.name === "string" ? payload.name : "",
      image: typeof payload.image === "string" ? payload.image : null,
      emailVerified: payload.emailVerified === true,
    };
    next();
  } catch {
    return sendError(res, 401, "Invalid or expired access token.");
  }
}

function isValidId(id) {
  return ObjectId.isValid(id) && new ObjectId(id).toString() === id;
}

function studioOwnerFilter(user) {
  const owners = [{ ownerId: user.id }];

  if (user.emailVerified && user.email) owners.push({ ownerEmail: user.email });
  return { $or: owners };
}

function isoDateIsValid(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return (
    Number.isFinite(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === value
  );
}

function publicStudio(studio) {
  if (!studio) return studio;
  const { ownerId, ownerEmail, ...publicFields } = studio;
  return publicFields;
}

function timeToMinutes(value) {
  if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value))
    return null;
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

app.get("/", (_req, res) =>
  res.json({ message: "StudioNest server is running" }),
);

app.post("/add-sample-studios", async (req, res) => {
  const studios = [
    {
      name: "Podcast Recording Studio",
      category: "Podcast",
      location: "Dhaka",
      hourlyRate: 1200,
      securityDeposit: 500,
      capacity: 5,
      description: "Professional podcast recording space.",
      imageUrl: "https://images.unsplash.com/photo-1598488035139-bdbb2231ce04",
      status: "Active",
      rating: 4.7,
      reviewCount: 12,
      createdAt: new Date(),
    },
    {
      name: "Music Production Studio",
      category: "Music",
      location: "Dhaka",
      hourlyRate: 1800,
      securityDeposit: 500,
      capacity: 6,
      description: "Creative music production space.",
      imageUrl: "https://images.unsplash.com/photo-1593078166037-9f2c8b7b6b5b",
      status: "Active",
      rating: 4.9,
      reviewCount: 15,
      createdAt: new Date(),
    },
    {
      name: "Creative Film Studio",
      category: "Film & Production",
      location: "Chittagong",
      hourlyRate: 2500,
      securityDeposit: 1000,
      capacity: 10,
      description: "Studio for professional film production.",
      imageUrl: "https://images.unsplash.com/photo-1492619375914-88005aa9e8fb",
      status: "Active",
      rating: 4.8,
      reviewCount: 10,
      createdAt: new Date(),
    },
    {
      name: "Art Workshop Studio",
      category: "Art",
      location: "Dhaka",
      hourlyRate: 1000,
      securityDeposit: 300,
      capacity: 8,
      description: "A peaceful creative art workspace.",
      imageUrl: "https://images.unsplash.com/photo-1513364776144-60967b0f800f",
      status: "Active",
      rating: 4.6,
      reviewCount: 8,
      createdAt: new Date(),
    },
    {
      name: "Photography Studio",
      category: "Photography",
      location: "Sylhet",
      hourlyRate: 1500,
      securityDeposit: 500,
      capacity: 6,
      description: "Modern photography studio.",
      imageUrl: "https://images.unsplash.com/photo-1497366754035-f200968a6e72",
      status: "Active",
      rating: 4.5,
      reviewCount: 9,
      createdAt: new Date(),
    },
  ];

  const result = await db.collection("studios").insertMany(studios);
  res.json({ message: "5 studios added", insertedCount: result.insertedCount });
});

app.get("/studios", async (req, res, next) => {
  try {
    const filter = { status: { $ne: "Draft" } };
    if (typeof req.query.category === "string" && req.query.category)
      filter.category = req.query.category;
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const limit = Math.min(
      50,
      Math.max(1, Number.parseInt(req.query.limit, 10) || 24),
    );
    const [studios, total] = await Promise.all([
      db
        .collection("studios")
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .toArray(),
      db.collection("studios").countDocuments(filter),
    ]);
    res.json({ studios: studios.map(publicStudio), page, limit, total });
  } catch (error) {
    next(error);
  }
});

app.get("/studios/featured", async (_req, res, next) => {
  try {
    const studios = await db
      .collection("studios")
      .find({ status: { $ne: "Draft" } })
      .sort({ rating: -1, createdAt: -1 })
      .limit(6)
      .toArray();
    res.json(studios.map(publicStudio));
  } catch (error) {
    next(error);
  }
});

app.get("/studios/:id", async (req, res, next) => {
  if (!isValidId(req.params.id))
    return sendError(res, 400, "Invalid studio ID.");
  try {
    const studio = await db
      .collection("studios")
      .findOne({ _id: new ObjectId(req.params.id), status: { $ne: "Draft" } });
    if (!studio) return sendError(res, 404, "Studio not found.");
    res.json(publicStudio(studio));
  } catch (error) {
    next(error);
  }
});

app.post("/studios", requireAuth, async (req, res, next) => {
  const parsed = parseStudioInput(req.body);
  if (parsed.error) return sendError(res, 400, parsed.error);
  try {
    const studio = {
      ...parsed.value,
      ownerId: req.user.id,
      ownerName: req.user.name,
      ownerEmail: req.user.email,
      status: "Active",
      rating: 0,
      reviewCount: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const result = await db.collection("studios").insertOne(studio);
    res.status(201).json({ ...studio, _id: result.insertedId });
  } catch (error) {
    next(error);
  }
});

app.get("/my-listings", requireAuth, async (req, res, next) => {
  try {
    const studios = await db
      .collection("studios")
      .find(studioOwnerFilter(req.user))
      .sort({ createdAt: -1 })
      .toArray();
    res.json(studios);
  } catch (error) {
    next(error);
  }
});

app.get("/my-listings/:id", requireAuth, async (req, res, next) => {
  if (!isValidId(req.params.id))
    return sendError(res, 400, "Invalid studio ID.");
  try {
    const studio = await db.collection("studios").findOne({
      _id: new ObjectId(req.params.id),
      ...studioOwnerFilter(req.user),
    });
    if (!studio)
      return sendError(res, 404, "Studio listing not found for this user.");
    res.json(studio);
  } catch (error) {
    next(error);
  }
});

app.patch("/studios/:id", requireAuth, async (req, res, next) => {
  if (!isValidId(req.params.id))
    return sendError(res, 400, "Invalid studio ID.");
  const parsed = parseStudioInput(req.body, true);
  if (parsed.error) return sendError(res, 400, parsed.error);
  if (Object.keys(parsed.value).length === 0)
    return sendError(res, 400, "Provide at least one studio field to update.");
  try {
    const result = await db
      .collection("studios")
      .updateOne(
        { _id: new ObjectId(req.params.id), ...studioOwnerFilter(req.user) },
        { $set: { ...parsed.value, updatedAt: new Date() } },
      );
    if (!result.matchedCount)
      return sendError(res, 404, "Studio not found or you do not own it.");
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.delete("/studios/:id", requireAuth, async (req, res, next) => {
  if (!isValidId(req.params.id))
    return sendError(res, 400, "Invalid studio ID.");
  try {
    const studioId = new ObjectId(req.params.id);
    const studio = await db
      .collection("studios")
      .findOne({ _id: studioId, ...studioOwnerFilter(req.user) });
    if (!studio)
      return sendError(res, 404, "Studio not found or you do not own it.");
    const activeBooking = await db.collection("bookings").findOne({
      studioId: studioId.toString(),
      status: { $in: ["Pending", "Confirmed"] },
    });
    if (activeBooking)
      return sendError(
        res,
        409,
        "This studio has active bookings and cannot be deleted yet.",
      );
    await db
      .collection("studios")
      .deleteOne({ _id: studioId, ownerId: req.user.id });
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.post("/bookings", requireAuth, async (req, res, next) => {
  const {
    studioId,
    bookingDate,
    startTime,
    endTime,
    guests,
    requirements = "",
  } = req.body ?? {};
  if (typeof studioId !== "string" || !isValidId(studioId))
    return sendError(res, 400, "A valid studioId is required.");
  if (!isoDateIsValid(bookingDate))
    return sendError(res, 400, "bookingDate must use YYYY-MM-DD format.");
  const start = timeToMinutes(startTime);
  const end = timeToMinutes(endTime);
  if (start === null || end === null || end <= start)
    return sendError(res, 400, "End time must be later than start time.");
  if (!Number.isInteger(guests) || guests < 1)
    return sendError(res, 400, "Guests must be a positive whole number.");
  if (typeof requirements !== "string" || requirements.length > 3000)
    return sendError(res, 400, "Requirements must be under 3000 characters.");
  const today = new Date().toISOString().slice(0, 10);
  if (
    bookingDate < today ||
    (bookingDate === today &&
      start <= new Date().getUTCHours() * 60 + new Date().getUTCMinutes())
  ) {
    return sendError(res, 400, "Choose a future date and time.");
  }

  try {
    const studio = await db
      .collection("studios")
      .findOne({ _id: new ObjectId(studioId), status: { $ne: "Draft" } });
    if (!studio) return sendError(res, 404, "Studio not found.");
    const isOwnStudio =
      studio.ownerId === req.user.id ||
      (req.user.emailVerified &&
        req.user.email &&
        studio.ownerEmail === req.user.email);
    if (isOwnStudio)
      return sendError(res, 403, "You cannot book your own studio.");
    if (Number.isInteger(studio.capacity) && guests > studio.capacity)
      return sendError(res, 400, "Guest count exceeds studio capacity.");

    const conflict = await db.collection("bookings").findOne({
      studioId,
      bookingDate,
      status: { $in: ["Pending", "Confirmed"] },
      startMinutes: { $lt: end },
      endMinutes: { $gt: start },
    });
    if (conflict)
      return sendError(
        res,
        409,
        "This studio is already booked for part of that time.",
      );

    const hourlyRate = studio.hourlyRate;
    const securityDeposit = Number(studio.securityDeposit || 0);
    const durationHours = (end - start) / 60;
    const bookingCost = Math.round(hourlyRate * durationHours * 100) / 100;
    const booking = {
      studioId,
      studioName: studio.name,
      userId: req.user.id,
      userName: req.user.name,
      userEmail: req.user.email,
      bookingDate,
      startTime,
      endTime,
      startMinutes: start,
      endMinutes: end,
      guests,
      requirements: requirements.trim(),
      hourlyRate,
      durationHours,
      securityDeposit,
      bookingCost,
      totalAmount: Math.round((bookingCost + securityDeposit) * 100) / 100,
      status: "Pending",
      createdAt: new Date(),
    };
    const result = await db.collection("bookings").insertOne(booking);
    res.status(201).json({ booking: { ...booking, _id: result.insertedId } });
  } catch (error) {
    next(error);
  }
});

app.get("/my-bookings", requireAuth, async (req, res, next) => {
  try {
    const bookings = await db
      .collection("bookings")
      .find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .toArray();
    res.json(bookings);
  } catch (error) {
    next(error);
  }
});

app.patch("/bookings/:id/cancel", requireAuth, async (req, res, next) => {
  if (!isValidId(req.params.id))
    return sendError(res, 400, "Invalid booking ID.");
  try {
    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(req.params.id),
        userId: req.user.id,
        status: "Pending",
      },
      { $set: { status: "Cancelled", cancelledAt: new Date() } },
    );
    if (!result.matchedCount)
      return sendError(res, 404, "Pending booking not found for this user.");
    res.json({ success: true });
  } catch (error) {
    next(error);
  }
});

app.use((error, _req, res, _next) => {
  console.error("API error:", error);
  if (error?.type === "entity.too.large")
    return sendError(res, 413, "Request body is too large.");
  return sendError(res, 500, "An unexpected server error occurred.");
});

async function startServer() {
  await client.connect();

  db = client.db("studionest");

  console.log("MongoDB connected successfully!");

  await Promise.all([
    db.collection("studios").createIndex({ ownerId: 1 }),
    db.collection("studios").createIndex({ status: 1, rating: -1 }),
    db.collection("bookings").createIndex({ userId: 1, createdAt: -1 }),
    db.collection("bookings").createIndex({
      studioId: 1,
      bookingDate: 1,
      status: 1,
      startMinutes: 1,
      endMinutes: 1,
    }),
  ]);

  // Local development fallback (Vercel will ignore this block)
  if (process.env.NODE_ENV !== "production") {
    app.listen(PORT, () =>
      console.log(`StudioNest API listening locally on port ${PORT}`),
    );
  }
}
export default app;
startServer().catch((error) => {
  console.error("Could not start StudioNest API:", error);
  process.exitCode = 1;
});
