// server/routes/analyzePdf.ts
import { Router } from 'express';
import { openAIService } from '../OpenAIService';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { base64Pdf } = req.body;
    const result = await openAIService.analyzePdf(base64Pdf);
    res.json(result);
  } catch (error) {
    console.error('analyze-pdf error:', error);
    res.status(500).json({ error: 'PDF analysis failed' });
  }
});

module.exports = router; // ✅ just export the router
