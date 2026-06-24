import express from "express";
import { answerKnownGeoQuestion } from "../services/geoKnowledgeGuard.js";
import { askOllamaGeoAI } from "../services/ollamaService.js";

const router = express.Router();

router.post("/", async (request, response) => {
  try {
    const { message, context } = request.body;

    if (!message || typeof message !== "string") {
      response.status(400).json({
        type: "unsupported",
        answer: "Geçerli bir mesaj gönderilmedi.",
        mapAction: null
      });
      return;
    }

    const result = answerKnownGeoQuestion(message) || (await askOllamaGeoAI(message, context || {}));
    response.json(result);
  } catch (error) {
    console.error("GeoAI error:", error);

    response.status(500).json({
      type: "unsupported",
      answer:
        "GeoAI servisi çalışırken hata oluştu. Ollama'nın açık olduğundan ve qwen2.5:7b modelinin kurulu olduğundan emin olun.",
      mapAction: null
    });
  }
});

export default router;
