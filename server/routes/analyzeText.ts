// server/routes/analyzeText.ts
import { Router } from 'express';
const { openAIService } = require('../OpenAIService');

const router = Router();

router.post('/', async (req, res) => {
  try {
    console.log()
    const { email_subject, email_body } = req.body;
    const result = await openAIService.analyzeEmailText(email_subject, email_body);
    res.json(result);
  } catch (error) {
    console.error('analyze-text error:', error);
    res.status(500).json({ error: 'Text analysis failed' });
  }
});

module.exports = router; // ✅ just export the router
