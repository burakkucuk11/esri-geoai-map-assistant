import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import { solve } from "@arcgis/core/rest/route.js";
import FeatureSet from "@arcgis/core/rest/support/FeatureSet.js";
import RouteParameters from "@arcgis/core/rest/support/RouteParameters.js";
import { getArcGISApiKey, toFriendlyArcGISError } from "./arcgisAuth.js";

const ROUTE_URL =
  "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World";

function toStopGraphic(place, sequence = 1) {
  return new Graphic({
    geometry: new Point({
      longitude: place.longitude,
      latitude: place.latitude,
      spatialReference: { wkid: 4326 }
    }),
    attributes: {
      name: place.name,
      sequence
    }
  });
}

export async function solveRouteForStops(stops, authMessages) {
  const featureName = authMessages?.routeFeatureName ?? "Rota servisi";
  const apiKey = getArcGISApiKey(featureName, authMessages);
  const validStops = Array.isArray(stops)
    ? stops.filter(
        (stop) =>
          Number.isFinite(Number(stop?.latitude)) &&
          Number.isFinite(Number(stop?.longitude))
      ).map((stop) => ({
        ...stop,
        latitude: Number(stop.latitude),
        longitude: Number(stop.longitude)
      }))
    : [];

  if (validStops.length < 2) {
    throw new Error(authMessages?.routeMissingInput ?? "Rota için en az iki durak gerekir.");
  }

  const params = new RouteParameters({
    apiKey,
    stops: new FeatureSet({
      features: validStops.map((stop, index) => toStopGraphic(stop, index + 1))
    }),
    findBestSequence: false,
    preserveFirstStop: true,
    preserveLastStop: true,
    returnDirections: true,
    directionsLengthUnits: "kilometers"
  });

  let response;
  try {
    response = await solve(ROUTE_URL, params);
  } catch (error) {
    throw toFriendlyArcGISError(error, featureName, authMessages);
  }

  const routeResult = response.routeResults?.[0];

  if (!routeResult?.route) {
    throw new Error("Esri rota servisi rota döndürmedi.");
  }

  return {
    routeGraphic: routeResult.route,
    totalLengthKm: routeResult.directions?.totalLength,
    totalTimeMinutes: routeResult.directions?.totalTime,
    stops: validStops
  };
}

export async function solveRoute(start, finish, authMessages) {
  return solveRouteForStops([start, finish], authMessages);
}
