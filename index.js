
import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import "dotenv/config";

const app = express();
const PORT = process.env.PORT || 8000;

app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);

let db;

const startServer = async () => {
  try {
    await client.connect();
    db = client.db("studionest");

    console.log("MongoDB connected successfully!");

    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error("Server error:", error);
  }
};

// Home
app.get("/", (req, res) => {
  res.send("StudioNest server is running");
});

// ================= STUDIOS =================

// Get all studios
app.get("/studios", async (req, res) => {
  try {
    const { category } = req.query;
    const filter = category ? { category } : {};

    const studios = await db.collection("studios")
      .find(filter)
      .toArray();

    res.send(studios);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch studios" });
  }
});

// Featured studios
app.get("/studios/featured", async (req, res) => {
  try {
    const studios = await db.collection("studios")
      .find()
      .sort({ rating: -1 })
      .limit(6)
      .toArray();

    res.send(studios);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch featured studios" });
  }
});

// Add studio
app.post("/studios", async (req, res) => {
  try {
    const studioData = req.body;

    const result = await db.collection("studios").insertOne({
      ...studioData,
      createdAt: new Date(),
    });

    res.status(201).send({
      success: true,
      insertedId: result.insertedId,
      message: "Studio added successfully",
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to add studio" });
  }
});

// My listings
app.get("/my-listings", async (req, res) => {
  try {
    const email = req.query.email;

    const studios = await db.collection("studios")
      .find({ ownerEmail: email })
      .toArray();

    res.send(studios);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch listings" });
  }
});

// Get single studio
app.get("/studios/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid studio ID" });
    }

    const studio = await db.collection("studios")
      .findOne({ _id: new ObjectId(id) });

    if (!studio) {
      return res.status(404).send({ message: "Studio not found" });
    }

    res.send(studio);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch studio" });
  }
});

// Update studio
app.patch("/studios/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid studio ID" });
    }

    const { _id, ...updateData } = req.body;

    const result = await db.collection("studios").updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );

    res.send({
      success: result.modifiedCount > 0,
      message: "Studio update completed",
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to update studio" });
  }
});

// Delete studio
app.delete("/studios/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid studio ID" });
    }

    const result = await db.collection("studios").deleteOne({
      _id: new ObjectId(id),
    });

    res.send({
      success: result.deletedCount > 0,
      message: "Studio deleted",
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to delete studio" });
  }
});

// ================= BOOKINGS =================

// Add booking
app.post("/bookings", async (req, res) => {
  try {
    const bookingData = req.body;

    const result = await db.collection("bookings").insertOne({
      ...bookingData,
      status: "Pending",
      createdAt: new Date(),
    });

    res.status(201).send({
      success: true,
      insertedId: result.insertedId,
      message: "Booking added successfully",
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to add booking" });
  }
});

// My bookings
app.get("/my-bookings", async (req, res) => {
  try {
    const email = req.query.email;

    const bookings = await db.collection("bookings")
      .find({ userEmail: email })
      .toArray();

    res.send(bookings);
  } catch (error) {
    res.status(500).send({ message: "Failed to fetch bookings" });
  }
});

// Cancel booking
app.patch("/bookings/:id/cancel", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid booking ID" });
    }

    const result = await db.collection("bookings").updateOne(
      {
        _id: new ObjectId(id),
        status: "Pending",
      },
      { $set: { status: "Cancelled" } }
    );

    res.send({
      success: result.modifiedCount > 0,
      message: "Booking cancellation completed",
    });
  } catch (error) {
    res.status(500).send({ message: "Failed to cancel booking" });
  }
});

startServer();
