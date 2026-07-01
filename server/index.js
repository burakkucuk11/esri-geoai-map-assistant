import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import datasetsRouter from "./routes/datasets.js";
import aiQueryPlanRouter from "./routes/aiQueryPlanRoutes.js";
import geoaiRouter from "./routes/geoai.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "geoai-esri-backend",
    capabilities: {
      queryPlan: true,
      spatialTools: ["within_distance", "intersect", "nearest_feature", "buffer", "aggregate_by_polygon"]
    }
  });
});

app.use("/api/geoai", geoaiRouter);
app.use("/api/ai", aiQueryPlanRouter);
app.use("/api/datasets", datasetsRouter);

app.listen(port, () => {
  console.log(`GeoAI backend http://localhost:${port} üzerinde çalışıyor.`);
});
