import express from "express";
import { createQueryPlan, getPlanDatasetAndCatalog } from "../ai/queryPlanner.js";
import { takePlan } from "../ai/planTokenStore.js";
import { executeConfirmedPlan } from "../gis/spatialExecutors.js";

const router = express.Router();

function getRequestContext(request) {
  const body = request.body || {};
  return body.context && typeof body.context === "object"
    ? body.context
    : body.mapContext && typeof body.mapContext === "object"
      ? body.mapContext
      : {};
}

router.post("/query-plan", async (request, response) => {
  try {
    const question = String(request.body?.question || request.body?.message || "").trim();
    if (!question) {
      response.status(400).json({
        success: false,
        fallbackAllowed: false,
        answer: "Gecerli bir soru gonderilmedi.",
        securityStatus: "blocked"
      });
      return;
    }

    const result = await createQueryPlan({
      question,
      context: getRequestContext(request)
    });

    response.json(result);
  } catch (error) {
    console.error("Query plan error:", error);
    response.status(500).json({
      success: false,
      fallbackAllowed: false,
      answer: error.message || "Sorgu plani uretilirken hata olustu.",
      securityStatus: "blocked"
    });
  }
});

router.post("/execute-plan", async (request, response) => {
  try {
    const planToken = String(request.body?.planToken || "").trim();
    const plan = planToken ? takePlan(planToken) : null;

    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      response.status(400).json({
        success: false,
        answer: "Plan bulunamadi veya suresi doldu. Sorguyu tekrar calistirin.",
        mapAction: null
      });
      return;
    }

    if (!plan.requires_confirmation) {
      response.status(400).json({
        success: false,
        answer: "Onay gerektirmeyen planlar calistirilmaz.",
        mapAction: null
      });
      return;
    }

    const context = getRequestContext(request);
    const { dataset, catalog } = getPlanDatasetAndCatalog(plan, context);
    const result = await executeConfirmedPlan({
      dataset,
      catalog,
      plan,
      context
    });

    response.json(result);
  } catch (error) {
    console.error("Execute plan error:", error);
    response.status(400).json({
      success: false,
      answer: error.message || "Plan calistirilirken hata olustu.",
      mapAction: null
    });
  }
});

export default router;

