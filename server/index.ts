// server/index.ts
require('dotenv').config(); // if using require()
const express = require('express');
const cors = require('cors');
const analyzeTextRoute = require('./routes/analyzeText');
const analyzeImageRoute = require('./routes/analyzeImage');
const analyzePdfRoute = require('./routes/analyzePdf');



const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Routes
app.use('/api/analyze-text', analyzeTextRoute);
app.use('/api/analyze-image', analyzeImageRoute);
app.use('/api/analyze-pdf', analyzePdfRoute);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
