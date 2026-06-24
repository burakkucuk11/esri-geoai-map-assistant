import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import { solve } from "@arcgis/core/rest/route.js";
import FeatureSet from "@arcgis/core/rest/support/FeatureSet.js";
import RouteParameters from "@arcgis/core/rest/support/RouteParameters.js";
import { getArcGISApiKey, toFriendlyArcGISError } from "./arcgisAuth.js";

const ROUTE_URL =
  "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World";

function toStopGraphic(place) {
  return new Graphic({
    geometry: new Point({
      longitude: place.longitude,
      latitude: place.latitude,
      spatialReference: { wkid: 4326 }
    }),
    attributes: {
      name: place.name
    }
  });
}

export async function solveRoute(start, finish) {
  const apiKey = getArcGISApiKey("Rota servisi");

  const params = new RouteParameters({
    apiKey,
    stops: new FeatureSet({
      features: [toStopGraphic(start), toStopGraphic(finish)]
    }),
    returnDirections: true,
    directionsLengthUnits: "kilometers"
  });

  let response;
  try {
    response = await solve(ROUTE_URL, params);
  } catch (error) {
    throw toFriendlyArcGISError(error, "Rota servisi");
  }

  const routeResult = response.routeResults?.[0];

  if (!routeResult?.route) {
    throw new Error("Esri rota servisi rota döndürmedi.");
  }

  return {
    routeGraphic: routeResult.route,
    totalLengthKm: routeResult.directions?.totalLength,
    totalTimeMinutes: routeResult.directions?.totalTime
  };
}
