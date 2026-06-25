import Graphic from "@arcgis/core/Graphic.js";
import Point from "@arcgis/core/geometry/Point.js";
import { solve } from "@arcgis/core/rest/route.js";
import FeatureSet from "@arcgis/core/rest/support/FeatureSet.js";
import RouteParameters from "@arcgis/core/rest/support/RouteParameters.js";
import { getArcGISApiKey, toFriendlyArcGISError } from "./arcgisAuth.js";

const ROUTE_URL =
  "https://route-api.arcgis.com/arcgis/rest/services/World/Route/NAServer/Route_World";
const DEFAULT_TRAVEL_MODE = "driving";

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

function normalizeStops(stops) {
  return Array.isArray(stops)
    ? stops
        .filter(
          (stop) =>
            Number.isFinite(Number(stop?.latitude)) &&
            Number.isFinite(Number(stop?.longitude))
        )
        .map((stop) => ({
          ...stop,
          latitude: Number(stop.latitude),
          longitude: Number(stop.longitude)
        }))
    : [];
}

async function solveValidStops(validStops, apiKey, featureName, authMessages) {
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
    throw new Error("Esri rota servisi rota dondurmedi.");
  }

  return {
    routeGraphic: routeResult.route,
    directions: routeResult.directions,
    totalLengthKm: routeResult.directions?.totalLength,
    totalTimeMinutes: routeResult.directions?.totalTime,
    travelMode: DEFAULT_TRAVEL_MODE
  };
}

function sumNumericValues(values) {
  let hasValue = false;
  const total = values.reduce((sum, value) => {
    const numericValue = Number(value);

    if (!Number.isFinite(numericValue)) {
      return sum;
    }

    hasValue = true;
    return sum + numericValue;
  }, 0);

  return hasValue ? total : undefined;
}

export async function solveRouteForStops(stops, authMessages) {
  const featureName = authMessages?.routeFeatureName ?? "Rota servisi";
  const apiKey = getArcGISApiKey(featureName, authMessages);
  const validStops = normalizeStops(stops);

  if (validStops.length < 2) {
    throw new Error(authMessages?.routeMissingInput ?? "Rota icin en az iki durak gerekir.");
  }

  const route = await solveValidStops(validStops, apiKey, featureName, authMessages);

  return {
    ...route,
    stops: validStops
  };
}

export async function solveRouteSegments(stops, authMessages) {
  const featureName = authMessages?.routeFeatureName ?? "Rota servisi";
  const apiKey = getArcGISApiKey(featureName, authMessages);
  const validStops = normalizeStops(stops);

  if (validStops.length < 2) {
    throw new Error(authMessages?.routeMissingInput ?? "Rota icin en az iki durak gerekir.");
  }

  const segments = await Promise.all(
    validStops.slice(0, -1).map(async (start, index) => {
      const finish = validStops[index + 1];
      const route = await solveValidStops([start, finish], apiKey, featureName, authMessages);

      return {
        index,
        fromIndex: index + 1,
        toIndex: index + 2,
        from: start,
        to: finish,
        ...route
      };
    })
  );

  return {
    segments,
    stops: validStops,
    totalLengthKm: sumNumericValues(segments.map((segment) => segment.totalLengthKm)),
    totalTimeMinutes: sumNumericValues(segments.map((segment) => segment.totalTimeMinutes)),
    travelMode: DEFAULT_TRAVEL_MODE
  };
}

export async function solveRoute(start, finish, authMessages) {
  return solveRouteForStops([start, finish], authMessages);
}
