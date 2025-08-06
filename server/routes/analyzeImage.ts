// server/routes/analyzeImage.ts
import { Router } from 'express';
import { openAIService } from '../OpenAIService';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { base64Image } = req.body;
    const result = await openAIService.analyzeImage(base64Image);
    res.json(result);
  } catch (error) {
    console.error('analyze-image error:', error);
    res.status(500).json({ error: 'Image analysis failed' });
  }
});

module.exports = router; // ✅ just export the router
