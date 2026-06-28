import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef
} from "react";
import Map from "@arcgis/core/Map.js";
import ArcGISMapView from "@arcgis/core/views/MapView.js";
import Graphic from "@arcgis/core/Graphic.js";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer.js";
import Extent from "@arcgis/core/geometry/Extent.js";
import Multipoint from "@arcgis/core/geometry/Multipoint.js";
import Point from "@arcgis/core/geometry/Point.js";
import Polygon from "@arcgis/core/geometry/Polygon.js";
import Polyline from "@arcgis/core/geometry/Polyline.js";
import { getDictionary } from "../i18n.js";
import { geocodePlace } from "../utils/geocoder.js";
import { solveRoute, solveRouteSegments } from "../utils/routeService.js";
import { MOCK_SERVICE_POINTS } from "../data/mockServicePoints.js";

const TURKEY_CENTER = [35.2433, 38.9637];
const DEFAULT_BASEMAP_ID = "topo-vector";
const DEFAULT_LABELS = getDictionary("tr").map;
const SUPPORTED_BASEMAP_IDS = new Set([
  "topo-vector",
  "streets-vector",
  "satellite",
  "hybrid",
  "dark-gray-vector",
  "gray-vector",
  "oceans",
  "osm"
]);
const ROUTE_SEGMENT_COLORS = [
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#db2777",
  "#475569"
];
const DATASET_LAYER_COLORS = [
  "#0f766e",
  "#2563eb",
  "#f97316",
  "#16a34a",
  "#7c3aed",
  "#dc2626",
  "#0891b2",
  "#ca8a04",
  "#db2777"
];

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createPoint({ longitude, latitude }) {
  return new Point({
    longitude,
    latitude,
    spatialReference: { wkid: 4326 }
  });
}

function geoJsonGeometryToEsriGeometry(geometry) {
  if (!geometry?.type || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  const spatialReference = { wkid: 4326 };

  if (geometry.type === "Point") {
    return new Point({
      x: geometry.coordinates[0],
      y: geometry.coordinates[1],
      spatialReference
    });
  }

  if (geometry.type === "MultiPoint") {
    return new Multipoint({
      points: geometry.coordinates,
      spatialReference
    });
  }

  if (geometry.type === "LineString") {
    return new Polyline({
      paths: [geometry.coordinates],
      spatialReference
    });
  }

  if (geometry.type === "MultiLineString") {
    return new Polyline({
      paths: geometry.coordinates,
      spatialReference
    });
  }

  if (geometry.type === "Polygon") {
    return new Polygon({
      rings: geometry.coordinates,
      spatialReference
    });
  }

  if (geometry.type === "MultiPolygon") {
    return new Polygon({
      rings: geometry.coordinates.flat(),
      spatialReference
    });
  }

  return null;
}

function normalizeDatasetGeometry(geometry) {
  if (!geometry) {
    return null;
  }

  if (geometry.type && geometry.coordinates) {
    return geoJsonGeometryToEsriGeometry(geometry);
  }

  if (Number.isFinite(Number(geometry.x)) && Number.isFinite(Number(geometry.y))) {
    return new Point(geometry);
  }

  if (Array.isArray(geometry.points)) {
    return new Multipoint(geometry);
  }

  if (Array.isArray(geometry.paths)) {
    return new Polyline(geometry);
  }

  if (Array.isArray(geometry.rings)) {
    return new Polygon(geometry);
  }

  return geometry;
}

function haversineDistanceKm(a, b) {
  const earthRadiusKm = 6371;
  const toRadians = (degree) => (degree * Math.PI) / 180;
  const dLat = toRadians(b.latitude - a.latitude);
  const dLon = toRadians(b.longitude - a.longitude);
  const lat1 = toRadians(a.latitude);
  const lat2 = toRadians(b.latitude);

  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(h));
}

function pointSymbol(color, size = 14) {
  return {
    type: "simple-marker",
    color,
    size,
    outline: {
      color: "#ffffff",
      width: 2
    }
  };
}

function markerNumberSymbol(number) {
  return {
    type: "text",
    text: String(number),
    color: "#ffffff",
    font: {
      family: "Arial",
      size: 11,
      weight: "bold"
    },
    horizontalAlignment: "center",
    verticalAlignment: "middle"
  };
}

function buildPopupContent(location, labels) {
  const details = location.details ?? [];
  const rows = [
    `<strong>${escapeHtml(labels.popupName)}:</strong> ${escapeHtml(location.name)}`,
    location.description
      ? `<strong>${escapeHtml(labels.popupDescription)}:</strong> ${escapeHtml(location.description)}`
      : null,
    ...details.map(
      (detail) => `<strong>${escapeHtml(detail.label)}:</strong> ${escapeHtml(detail.value)}`
    )
  ].filter(Boolean);

  return `<div class="geo-popup">${rows.map((row) => `<p>${row}</p>`).join("")}</div>`;
}

function formatDistanceKm(value, labels) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${numericValue.toFixed(1)} km` : labels.noDistance;
}

function formatDurationMinutes(value, labels) {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? `${Math.round(numericValue)} dk` : labels.noDuration;
}

function getTravelModeLabel(mode, labels) {
  return labels.travelModes?.[mode] ?? mode ?? labels.unknownTravelMode;
}

function getPolylineLabelPoint(geometry) {
  const path = geometry?.paths?.find((candidate) => candidate.length);
  const coordinate = path?.[Math.floor((path.length - 1) / 2)];

  if (!coordinate) {
    return null;
  }

  return new Point({
    x: coordinate[0],
    y: coordinate[1],
    spatialReference: geometry.spatialReference
  });
}

function routeLabelSymbol(text, color) {
  return {
    type: "text",
    text,
    color,
    haloColor: "#ffffff",
    haloSize: 2.5,
    yoffset: -10,
    font: {
      family: "Arial",
      size: 10,
      weight: "bold"
    }
  };
}

function buildRouteSegmentPopupContent(segment, labels) {
  const rows = [
    `<strong>${escapeHtml(labels.distanceLabel)}:</strong> ${escapeHtml(segment.distanceText)}`,
    `<strong>${escapeHtml(labels.durationLabel)}:</strong> ${escapeHtml(segment.durationText)}`,
    `<strong>${escapeHtml(labels.travelModeLabel)}:</strong> ${escapeHtml(segment.modeText)}`
  ];

  return `<div class="geo-popup">${rows.map((row) => `<p>${row}</p>`).join("")}</div>`;
}

function normalizeGeometryType(value) {
  return String(value || "").toLowerCase();
}

function hexToRgb(hexColor) {
  const normalized = String(hexColor || "").replace("#", "");
  if (normalized.length !== 6) {
    return [15, 118, 110];
  }

  return [
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16)
  ];
}

function getDatasetLayerColor(layerIndex = 0) {
  return DATASET_LAYER_COLORS[layerIndex % DATASET_LAYER_COLORS.length];
}

function datasetSymbol(geometryType, layerIndex = 0) {
  const normalizedType = normalizeGeometryType(geometryType);
  const color = getDatasetLayerColor(layerIndex);
  const [red, green, blue] = hexToRgb(color);

  if (normalizedType.includes("polygon")) {
    return {
      type: "simple-fill",
      color: [red, green, blue, 0.18],
      outline: {
        color,
        width: 1.4
      }
    };
  }

  if (normalizedType.includes("polyline") || normalizedType.includes("line")) {
    return {
      type: "simple-line",
      color,
      width: 3,
      cap: "round",
      join: "round"
    };
  }

  return pointSymbol(color, 10);
}

function highlightSymbol(geometryType) {
  const normalizedType = normalizeGeometryType(geometryType);

  if (normalizedType.includes("polygon")) {
    return {
      type: "simple-fill",
      color: [250, 204, 21, 0.24],
      outline: {
        color: "#dc2626",
        width: 3
      }
    };
  }

  if (normalizedType.includes("polyline") || normalizedType.includes("line")) {
    return {
      type: "simple-line",
      color: "#dc2626",
      width: 5,
      cap: "round",
      join: "round"
    };
  }

  return {
    type: "simple-marker",
    color: "#dc2626",
    size: 16,
    outline: {
      color: "#ffffff",
      width: 2
    }
  };
}

function buildDatasetPopupContent(layer, feature, labels) {
  const attributes = feature.attributes && typeof feature.attributes === "object"
    ? feature.attributes
    : {};
  const rows = Object.entries(attributes)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .slice(0, 10)
    .map(
      ([key, value]) =>
        `<strong>${escapeHtml(key)}:</strong> ${escapeHtml(value)}`
    );

  const objectIdLabel = labels.objectIdLabel || "Object ID";
  rows.unshift(
    `<strong>${escapeHtml(objectIdLabel)}:</strong> ${escapeHtml(feature.objectId ?? "-")}`
  );

  return `<div class="geo-popup"><p><strong>${escapeHtml(labels.datasetLayerLabel || "Katman")}:</strong> ${escapeHtml(layer.name)}</p>${rows
    .map((row) => `<p>${row}</p>`)
    .join("")}</div>`;
}

function createDatasetGraphic(layer, feature, symbolFactory, labels, layerIndex = 0) {
  const geometry = normalizeDatasetGeometry(feature?.geometry);

  if (!geometry) {
    return null;
  }

  return new Graphic({
    geometry,
    symbol: symbolFactory(layer.geometryType, layerIndex),
    attributes: {
      ...(feature.attributes || {}),
      objectId: feature.objectId,
      layerId: layer.id,
      layerName: layer.name
    },
    popupTemplate: {
      title: `${layer.name} #${feature.objectId ?? ""}`.trim(),
      content: buildDatasetPopupContent(layer, feature, labels)
    }
  });
}

function isValidExtent(extent) {
  return (
    Number.isFinite(Number(extent?.xmin)) &&
    Number.isFinite(Number(extent?.ymin)) &&
    Number.isFinite(Number(extent?.xmax)) &&
    Number.isFinite(Number(extent?.ymax))
  );
}

function getDatasetExtent(dataset) {
  const layers = Array.isArray(dataset?.layers) ? dataset.layers : [];
  const extentValues = layers.map((layer) => layer.extent).filter(isValidExtent);

  if (!extentValues.length) {
    return null;
  }

  const merged = extentValues.reduce(
    (result, extent) => ({
      xmin: Math.min(result.xmin, Number(extent.xmin)),
      ymin: Math.min(result.ymin, Number(extent.ymin)),
      xmax: Math.max(result.xmax, Number(extent.xmax)),
      ymax: Math.max(result.ymax, Number(extent.ymax))
    }),
    {
      xmin: Number(extentValues[0].xmin),
      ymin: Number(extentValues[0].ymin),
      xmax: Number(extentValues[0].xmax),
      ymax: Number(extentValues[0].ymax)
    }
  );

  const minSpan = 0.01;
  if (merged.xmax - merged.xmin < minSpan) {
    const center = (merged.xmin + merged.xmax) / 2;
    merged.xmin = center - minSpan / 2;
    merged.xmax = center + minSpan / 2;
  }
  if (merged.ymax - merged.ymin < minSpan) {
    const center = (merged.ymin + merged.ymax) / 2;
    merged.ymin = center - minSpan / 2;
    merged.ymax = center + minSpan / 2;
  }

  return new Extent({
    ...merged,
    spatialReference: { wkid: 4326 }
  });
}

const GeoMapView = forwardRef(function GeoMapView(
  { labels = DEFAULT_LABELS, onReadyChange, onSelectionChange },
  ref
) {
  const mapContainerRef = useRef(null);
  const labelsRef = useRef(labels);
  const viewRef = useRef(null);
  const markerLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const serviceLayerRef = useRef(null);
  const datasetLayerRef = useRef(null);
  const datasetHighlightLayerRef = useRef(null);
  const selectedPointRef = useRef(null);

  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  useEffect(() => {
    const currentLabels = labelsRef.current;
    const markerLayer = new GraphicsLayer({ title: currentLabels.markerLayerTitle });
    const routeLayer = new GraphicsLayer({ title: currentLabels.routeLayerTitle });
    const serviceLayer = new GraphicsLayer({ title: currentLabels.serviceLayerTitle });
    const datasetLayer = new GraphicsLayer({ title: currentLabels.datasetLayerTitle || "GDB verisi" });
    const datasetHighlightLayer = new GraphicsLayer({
      title: currentLabels.datasetHighlightLayerTitle || "GDB vurgusu"
    });

    markerLayerRef.current = markerLayer;
    routeLayerRef.current = routeLayer;
    serviceLayerRef.current = serviceLayer;
    datasetLayerRef.current = datasetLayer;
    datasetHighlightLayerRef.current = datasetHighlightLayer;

    const map = new Map({
      basemap: DEFAULT_BASEMAP_ID,
      layers: [datasetLayer, serviceLayer, routeLayer, datasetHighlightLayer, markerLayer]
    });

    const view = new ArcGISMapView({
      container: mapContainerRef.current,
      map,
      center: TURKEY_CENTER,
      zoom: 6,
      constraints: {
        minZoom: 3
      },
      popup: {
        dockEnabled: true,
        dockOptions: {
          position: "top-right",
          breakpoint: false
        }
      }
    });

    viewRef.current = view;
    view.ui.move("zoom", "top-right");

    view.when(() => {
      onReadyChange(true);
    });

    const clickHandle = view.on("click", (event) => {
      const longitude = event.mapPoint.longitude;
      const latitude = event.mapPoint.latitude;

      selectedPointRef.current = {
        longitude,
        latitude,
        name: labelsRef.current.selectedPointName
      };
      onSelectionChange(selectedPointRef.current);
    });

    return () => {
      clickHandle?.remove();
      onReadyChange(false);
      view.destroy();
      viewRef.current = null;
    };
  }, [onReadyChange, onSelectionChange]);

  function openPopup(view, graphic, point) {
    const options = {
      features: [graphic]
    };

    if (point) {
      options.location = point;
    }

    if (typeof view.openPopup === "function") {
      view.openPopup(options);
      return;
    }

    view.popup.open(options);
  }

  async function addLocationGraphic(location, options = {}) {
    const view = viewRef.current;
    const markerLayer = markerLayerRef.current;
    const currentLabels = labelsRef.current;

    if (!view || !markerLayer) {
      throw new Error(currentLabels.mapNotReady);
    }

    if (!options.keepExisting) {
      markerLayer.removeAll();
    }

    const point = createPoint(location);
    const graphic = new Graphic({
      geometry: point,
      symbol: pointSymbol(options.color ?? "#0f766e", options.size ?? 15),
      attributes: {
        name: location.name
      },
      popupTemplate: {
        title: location.name,
        content: buildPopupContent(location, currentLabels)
      }
    });

    markerLayer.add(graphic);

    await view.goTo(
      {
        center: [location.longitude, location.latitude],
        zoom: location.zoom ?? 10
      },
      { duration: 750 }
    );

    openPopup(view, graphic, point);
    return graphic;
  }

  async function addNumberedLocationGraphics({ locations, description, zoom }) {
    const view = viewRef.current;
    const markerLayer = markerLayerRef.current;
    const currentLabels = labelsRef.current;

    if (!view || !markerLayer) {
      throw new Error(currentLabels.mapNotReady);
    }

    markerLayer.removeAll();

    const markerGraphics = [];
    const allGraphics = [];

    locations.forEach((location, index) => {
      const order = index + 1;
      const point = createPoint(location);
      const popupLocation = {
        ...location,
        name: `${order}. ${location.name}`,
        description: location.description || description
      };
      const popupTemplate = {
        title: popupLocation.name,
        content: buildPopupContent(popupLocation, currentLabels)
      };
      const markerGraphic = new Graphic({
        geometry: point,
        symbol: pointSymbol("#0f766e", 24),
        attributes: {
          name: location.name,
          order
        },
        popupTemplate
      });
      const numberGraphic = new Graphic({
        geometry: point,
        symbol: markerNumberSymbol(order),
        attributes: {
          name: location.name,
          order
        },
        popupTemplate
      });

      markerGraphics.push(markerGraphic);
      allGraphics.push(markerGraphic, numberGraphic);
    });

    markerLayer.addMany(allGraphics);

    if (markerGraphics.length === 1) {
      const location = locations[0];
      await view.goTo(
        {
          center: [location.longitude, location.latitude],
          zoom: zoom || location.zoom || 12
        },
        { duration: 750 }
      );
    } else {
      await view.goTo(
        {
          target: markerGraphics,
          padding: 90
        },
        { duration: 750 }
      );
    }

    openPopup(view, markerGraphics[0], markerGraphics[0].geometry);

    return {
      answer: currentLabels.multipleLocationsShown(markerGraphics.length)
    };
  }

  async function drawRouteForStops(locations) {
    const view = viewRef.current;
    const routeLayer = routeLayerRef.current;
    const currentLabels = labelsRef.current;

    if (!view || !routeLayer) {
      throw new Error(currentLabels.mapNotReady);
    }

    const routeResult = await solveRouteSegments(locations, currentLabels.auth);
    const routeGraphics = [];
    const labelGraphics = [];
    const segments = routeResult.segments.map((segment, index) => {
      const color = ROUTE_SEGMENT_COLORS[index % ROUTE_SEGMENT_COLORS.length];
      const distanceText = formatDistanceKm(segment.totalLengthKm, currentLabels);
      const durationText = formatDurationMinutes(segment.totalTimeMinutes, currentLabels);
      const modeText = getTravelModeLabel(segment.travelMode, currentLabels);
      const segmentSummary = {
        fromIndex: segment.fromIndex,
        toIndex: segment.toIndex,
        fromName: segment.from.name,
        toName: segment.to.name,
        totalLengthKm: segment.totalLengthKm,
        totalTimeMinutes: segment.totalTimeMinutes,
        travelMode: segment.travelMode,
        color,
        distanceText,
        durationText,
        modeText
      };
      const popupTemplate = {
        title: currentLabels.routeSegmentTitle(segmentSummary),
        content: buildRouteSegmentPopupContent(segmentSummary, currentLabels)
      };

      segment.routeGraphic.symbol = {
        type: "simple-line",
        color,
        width: 5,
        cap: "round",
        join: "round"
      };
      segment.routeGraphic.attributes = {
        fromIndex: segment.fromIndex,
        toIndex: segment.toIndex,
        fromName: segment.from.name,
        toName: segment.to.name,
        distanceText,
        durationText,
        modeText
      };
      segment.routeGraphic.popupTemplate = popupTemplate;
      routeGraphics.push(segment.routeGraphic);

      const labelPoint = getPolylineLabelPoint(segment.routeGraphic.geometry);
      if (labelPoint) {
        labelGraphics.push(
          new Graphic({
            geometry: labelPoint,
            symbol: routeLabelSymbol(
              currentLabels.routeSegmentMapLabel(segmentSummary),
              color
            ),
            attributes: segment.routeGraphic.attributes,
            popupTemplate
          })
        );
      }

      return segmentSummary;
    });

    routeLayer.removeAll();
    routeLayer.addMany([...routeGraphics, ...labelGraphics]);

    await view.goTo(
      {
        target: routeGraphics,
        padding: 110
      },
      { duration: 750 }
    );

    return {
      stopCount: routeResult.stops.length,
      totalLengthKm: routeResult.totalLengthKm,
      totalTimeMinutes: routeResult.totalTimeMinutes,
      travelMode: routeResult.travelMode,
      segments,
      stops: routeResult.stops
    };
  }

  function getDatasetPreviewGraphics(
    dataset,
    symbolFactory,
    labels,
    layerId,
    objectIds,
    explicitFeatures
  ) {
    const objectIdSet = Array.isArray(objectIds) && objectIds.length
      ? new Set(objectIds.map((id) => String(id)))
      : null;
    const layers = Array.isArray(dataset?.layers) ? dataset.layers : [];

    if (Array.isArray(explicitFeatures) && explicitFeatures.length) {
      const targetLayerIndex = Math.max(0, layers.findIndex((layer) => layer.id === layerId));
      const targetLayer =
        layers.find((layer) => layer.id === layerId) ||
        (layerId ? { id: layerId, name: layerId, geometryType: "Unknown" } : null);

      if (!targetLayer) {
        return [];
      }

      return explicitFeatures
        .filter((feature) => !objectIdSet || objectIdSet.has(String(feature.objectId)))
        .map((feature) =>
          createDatasetGraphic(targetLayer, feature, symbolFactory, labels, targetLayerIndex)
        )
        .filter(Boolean);
    }

    return layers.flatMap((layer, layerIndex) => {
      if (layerId && layer.id !== layerId) {
        return [];
      }

      const features = Array.isArray(layer.features) ? layer.features : [];
      return features
        .filter((feature) => !objectIdSet || objectIdSet.has(String(feature.objectId)))
        .map((feature) => createDatasetGraphic(layer, feature, symbolFactory, labels, layerIndex))
        .filter(Boolean);
    });
  }

  async function showDatasetOnMap(dataset) {
    const view = viewRef.current;
    const datasetLayer = datasetLayerRef.current;
    const highlightLayer = datasetHighlightLayerRef.current;
    const currentLabels = labelsRef.current;

    if (!view || !datasetLayer) {
      throw new Error(currentLabels.mapNotReady);
    }

    const graphics = getDatasetPreviewGraphics(dataset, datasetSymbol, currentLabels);

    datasetLayer.removeAll();
    highlightLayer?.removeAll();

    if (!graphics.length) {
      throw new Error(currentLabels.datasetNoPreview || "GDB icin harita onizlemesi bulunamadi.");
    }

    datasetLayer.addMany(graphics);

    const datasetExtent = getDatasetExtent(dataset);
    await view.goTo(
      datasetExtent
        ? {
            target: datasetExtent.expand(1.12),
            padding: 80
          }
        : {
            target: graphics,
            padding: 90
          },
      { duration: 750 }
    );

    return {
      answer: (currentLabels.datasetShown || ((name, count) => `${name} haritada gosterildi (${count} detay).`))(
        dataset.name,
        graphics.length
      )
    };
  }

  async function highlightDatasetOnMap({ dataset, layerId, objectIds, features }) {
    const view = viewRef.current;
    const highlightLayer = datasetHighlightLayerRef.current;
    const currentLabels = labelsRef.current;

    if (!view || !highlightLayer) {
      throw new Error(currentLabels.mapNotReady);
    }

    const graphics = getDatasetPreviewGraphics(
      dataset,
      highlightSymbol,
      currentLabels,
      layerId,
      objectIds,
      features
    );

    highlightLayer.removeAll();

    if (!graphics.length) {
      throw new Error(
        currentLabels.datasetNoMatchingFeatures ||
          "Bu cevapla eslesen harita detayi onizlemede bulunamadi."
      );
    }

    highlightLayer.addMany(graphics);

    await view.goTo(
      {
        target: graphics,
        padding: 110
      },
      { duration: 750 }
    );

    openPopup(view, graphics[0]);

    return {
      answer: (currentLabels.datasetHighlighted || ((count) => `${count} detay vurgulandi.`))(
        graphics.length
      )
    };
  }

  useImperativeHandle(ref, () => ({
    async showPointOnMap(location) {
      await addLocationGraphic(location);
      return {
        answer: labelsRef.current.shownOnMap(location.name)
      };
    },

    async showKnownLocation(location) {
      await addLocationGraphic(location);
      return {
        answer: labelsRef.current.shownOnMap(location.name)
      };
    },

    async showLocationsOnMap(options) {
      return addNumberedLocationGraphics(options);
    },

    async routeLocationsOnMap(locations) {
      return drawRouteForStops(locations);
    },

    async showDataset(dataset) {
      return showDatasetOnMap(dataset);
    },

    async highlightDatasetFeatures(options) {
      return highlightDatasetOnMap(options);
    },

    changeBasemap(basemapId) {
      const view = viewRef.current;
      const currentLabels = labelsRef.current;
      const normalizedBasemapId = String(basemapId || "").trim();

      if (!view) {
        throw new Error(currentLabels.mapNotReady);
      }

      if (!SUPPORTED_BASEMAP_IDS.has(normalizedBasemapId)) {
        throw new Error(currentLabels.unsupportedBasemap);
      }

      view.map.basemap = normalizedBasemapId;

      return {
        basemapId: normalizedBasemapId,
        answer: currentLabels.basemapChanged(currentLabels.basemaps[normalizedBasemapId])
      };
    },

    clearGraphics() {
      markerLayerRef.current?.removeAll();
      routeLayerRef.current?.removeAll();
      serviceLayerRef.current?.removeAll();
      datasetHighlightLayerRef.current?.removeAll();

      const view = viewRef.current;
      if (view) {
        if (typeof view.closePopup === "function") {
          view.closePopup();
        } else {
          view.popup?.close();
        }
      }
    },

    async zoomHome() {
      const view = viewRef.current;
      const currentLabels = labelsRef.current;

      if (!view) {
        throw new Error(currentLabels.mapNotReady);
      }

      if (typeof view.closePopup === "function") {
        view.closePopup();
      } else {
        view.popup?.close();
      }

      await view.goTo(
        {
          center: TURKEY_CENTER,
          zoom: 6
        },
        { duration: 750 }
      );

      return {
        answer: currentLabels.homeView
      };
    },

    async geocodeAndShow(query) {
      const currentLabels = labelsRef.current;
      const result = await geocodePlace(query, currentLabels.auth);

      await addLocationGraphic({
        name: result.name,
        longitude: result.longitude,
        latitude: result.latitude,
        description: result.address,
        details: [
          { label: currentLabels.sourceLabel, value: "Esri World Geocoding Service" },
          { label: currentLabels.matchScoreLabel, value: `${Math.round(result.score)} / 100` }
        ],
        zoom: 12
      });

      return {
        answer: currentLabels.shownOnMap(result.name)
      };
    },

    async findNearestFeature(serviceType = "hospital") {
      const view = viewRef.current;
      const serviceLayer = serviceLayerRef.current;
      const currentLabels = labelsRef.current;

      if (!view || !serviceLayer) {
        throw new Error(currentLabels.mapNotReady);
      }

      const origin =
        selectedPointRef.current ?? {
          longitude: view.center.longitude,
          latitude: view.center.latitude,
          name: currentLabels.mapCenterName
        };

      const points = MOCK_SERVICE_POINTS[serviceType] ?? MOCK_SERVICE_POINTS.hospital;
      const nearest = points
        .map((point) => ({
          ...point,
          distanceKm: haversineDistanceKm(origin, point)
        }))
        .sort((a, b) => a.distanceKm - b.distanceKm)[0];

      serviceLayer.removeAll();

      const originGraphic = new Graphic({
        geometry: createPoint(origin),
        symbol: pointSymbol("#2563eb", 12),
        popupTemplate: {
          title: origin.name,
          content: currentLabels.nearestOriginPopup
        }
      });

      const serviceLabel =
        currentLabels.serviceTypes?.[serviceType] ?? currentLabels.servicePoint;

      const nearestGraphic = new Graphic({
        geometry: createPoint(nearest),
        symbol: pointSymbol("#dc2626", 16),
        popupTemplate: {
          title: nearest.name,
          content: `${serviceLabel} - ${currentLabels.approximate} ${nearest.distanceKm.toFixed(1)} km`
        }
      });

      const connectionLine = new Graphic({
        geometry: new Polyline({
          paths: [
            [
              [origin.longitude, origin.latitude],
              [nearest.longitude, nearest.latitude]
            ]
          ],
          spatialReference: { wkid: 4326 }
        }),
        symbol: {
          type: "simple-line",
          color: "#2563eb",
          width: 2,
          style: "short-dot"
        }
      });

      serviceLayer.addMany([connectionLine, originGraphic, nearestGraphic]);

      await view.goTo(
        {
          target: [originGraphic, nearestGraphic],
          padding: 90
        },
        { duration: 750 }
      );

      openPopup(view, nearestGraphic, nearestGraphic.geometry);

      const sourceText = selectedPointRef.current
        ? currentLabels.selectedPointBased
        : currentLabels.mapCenterBased;

      return {
        answer: currentLabels.nearestAnswer({
          sourceText,
          serviceLabel,
          nearestName: nearest.name,
          distanceKm: nearest.distanceKm.toFixed(1)
        })
      };
    },

    async createRoute(from, to) {
      const currentLabels = labelsRef.current;

      if (!from || !to) {
        throw new Error(currentLabels.routeMissingInput);
      }

      const view = viewRef.current;
      const routeLayer = routeLayerRef.current;

      if (!view || !routeLayer) {
        throw new Error(currentLabels.mapNotReady);
      }

      const [start, finish] = await Promise.all([
        geocodePlace(from, currentLabels.auth),
        geocodePlace(to, currentLabels.auth)
      ]);
      const routeResult = await solveRoute(start, finish, currentLabels.auth);
      const routeGraphic = routeResult.routeGraphic;

      routeGraphic.symbol = {
        type: "simple-line",
        color: "#f97316",
        width: 5,
        cap: "round",
        join: "round"
      };

      routeLayer.removeAll();
      routeLayer.add(routeGraphic);

      await addLocationGraphic(
        {
          name: start.name,
          longitude: start.longitude,
          latitude: start.latitude,
          description: currentLabels.routeStart
        },
        { color: "#2563eb", keepExisting: false, size: 12 }
      );
      await addLocationGraphic(
        {
          name: finish.name,
          longitude: finish.longitude,
          latitude: finish.latitude,
          description: currentLabels.routeEnd
        },
        { color: "#dc2626", keepExisting: true, size: 12 }
      );

      await view.goTo(
        {
          target: routeGraphic.geometry,
          padding: 80
        },
        { duration: 750 }
      );

      const distanceText = routeResult.totalLengthKm
        ? `${routeResult.totalLengthKm.toFixed(1)} km`
        : currentLabels.noDistance;
      const durationText = routeResult.totalTimeMinutes
        ? `${Math.round(routeResult.totalTimeMinutes)} dk`
        : currentLabels.noDuration;

      return {
        answer: currentLabels.routeAnswer({
          startName: start.name,
          finishName: finish.name,
          distanceText,
          durationText
        })
      };
    }
  }));

  return <div className="map-view" ref={mapContainerRef} />;
});

export default GeoMapView;
