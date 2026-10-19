import mongoose from 'mongoose';

/* One chunk of text from a document. Source text always comes from here — never from model output. */
const chunkSchema = new mongoose.Schema({
  documentId: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Document',
    required: true,
    index:    true,
  },
  index: { type: Number, required: true }, // position in document, 0-based
  text:  { type: String, required: true },
});

export default mongoose.model('Chunk', chunkSchema);
