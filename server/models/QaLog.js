import mongoose from 'mongoose';

/* Audit log: every question asked, its answer, and any errors. */
const qaLogSchema = new mongoose.Schema({
  documentId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Document' },
  question:      { type: String, required: true },
  answer:        { type: String, default: '' },
  found:         { type: Boolean },
  sourceChunkIds:[{ type: mongoose.Schema.Types.ObjectId, ref: 'Chunk' }],
  latencyMs:     { type: Number },
  error:         { type: String, default: null }, // null means success
  createdAt:     { type: Date, default: Date.now },
});

export default mongoose.model('QaLog', qaLogSchema);
