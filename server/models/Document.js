import mongoose from 'mongoose';

/* Stores metadata about each uploaded document. */
const documentSchema = new mongoose.Schema({
  filename:   { type: String, required: true },
  uploadedAt: { type: Date,   default: Date.now },
  chunkCount: { type: Number, required: true },
});

export default mongoose.model('Document', documentSchema);
