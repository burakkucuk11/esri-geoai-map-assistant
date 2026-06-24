import express from "express";
import { answerKnownGeoQuestion } from "../services/geoKnowledgeGuard.js";
import { askOllamaGeoAI } from "../services/ollamaService.js";

const router = express.Router();

const routeMessages = {
  tr: {
    invalidMessage: "Geçerli bir mesaj gönderilmedi.",
    serviceError:
      "GeoAI servisi çalışırken hata oluştu. Ollama'nın açık olduğundan ve qwen2.5:7b modelinin kurulu olduğundan emin olun."
  },
  en: {
    invalidMessage: "A valid message was not provided.",
    serviceError:
      "The GeoAI service failed while processing the request. Make sure Ollama is running and the qwen2.5:7b model is installed."
  }
};

router.post("/", async (request, response) => {
  try {
    const { message, context } = request.body;
    const normalizedContext = context && typeof context === "object" ? context : {};
    const language = normalizedContext.language === "en" ? "en" : "tr";
    const labels = routeMessages[language];

    if (!message || typeof message !== "string") {
      response.status(400).json({
        type: "unsupported",
        answer: labels.invalidMessage,
        mapAction: null
      });
      return;
    }

    const result =
      answerKnownGeoQuestion(message, language) ||
      (await askOllamaGeoAI(message, { ...normalizedContext, language }));
    response.json(result);
  } catch (error) {
    console.error("GeoAI error:", error);

    const language = request.body?.context?.language === "en" ? "en" : "tr";
    const labels = routeMessages[language];

    response.status(500).json({
      type: "unsupported",
      answer: labels.serviceError,
      mapAction: null
    });
  }
});

export default router;
