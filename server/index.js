import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import geoaiRouter from "./routes/geoai.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    service: "geoai-esri-backend"
  });
});

app.use("/api/geoai", geoaiRouter);

app.listen(port, () => {
  console.log(`GeoAI backend http://localhost:${port} üzerinde çalışıyor.`);
});
