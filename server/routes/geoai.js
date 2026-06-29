import express from "express";
import {
  findGeoKnowledgeAnswer,
  getUnsafeGeoAIResponse,
  isUnsafeGeoRequest
} from "../data/geoKnowledgeBase.js";
import { tryAnswerDatasetQuestion } from "../services/datasetAnalysisService.js";
import { askOllamaGeoAI, getAIProvider } from "../services/ollamaService.js";

const router = express.Router();

const routeMessages = {
  tr: {
    invalidMessage: "Ge\u00e7erli bir mesaj g\u00f6nderilmedi.",
    mockUnsupported:
      "Bu soru yerel bilgi taban\u0131nda bulunamad\u0131. AI_PROVIDER=mock oldu\u011fu i\u00e7in LLM'e istek g\u00f6nderilmedi.",
    serviceError:
      "GeoAI servisi \u00e7al\u0131\u015f\u0131rken hata olu\u015ftu. OpenAI uyumlu API adresi, model ad\u0131 ve ba\u011flant\u0131 ayarlar\u0131n\u0131 kontrol edin."
  },
  en: {
    invalidMessage: "A valid message was not provided.",
    mockUnsupported:
      "This question was not found in the local knowledge base. AI_PROVIDER=mock is active, so no LLM request was sent.",
    serviceError:
      "The GeoAI service failed while processing the request. Check the OpenAI-compatible API URL, model name, and connection settings."
  }
};

function shouldUseLocalAnswer(localAnswer, provider) {
  if (!localAnswer) {
    return false;
  }

  if (provider === "mock") {
    return true;
  }

  const action = localAnswer.response?.mapAction?.action;

  return (
    localAnswer.response?.type === "map_action" ||
    action === "show_location" ||
    action === "show_locations" ||
    action === "change_basemap" ||
    action === "clear_graphics" ||
    action === "geocode" ||
    action === "zoom_home"
  );
}

router.post("/", async (request, response) => {
  try {
    const { message, context } = request.body ?? {};
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

    if (isUnsafeGeoRequest(message)) {
      response.json(getUnsafeGeoAIResponse(language));
      return;
    }

    const provider = getAIProvider();
    const localAnswer = findGeoKnowledgeAnswer(message);
    if (shouldUseLocalAnswer(localAnswer, provider)) {
      response.json(localAnswer.response);
      return;
    }

    const datasetAnswer = await tryAnswerDatasetQuestion(message, {
      ...normalizedContext,
      language
    });
    if (datasetAnswer) {
      response.json(datasetAnswer);
      return;
    }

    if (provider === "mock") {
      response.json({
        type: "unsupported",
        answer: labels.mockUnsupported,
        mapAction: null
      });
      return;
    }

    const result = await askOllamaGeoAI(message, { ...normalizedContext, language });
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
