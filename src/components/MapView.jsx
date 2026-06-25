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
import Point from "@arcgis/core/geometry/Point.js";
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
  const selectedPointRef = useRef(null);

  useEffect(() => {
    labelsRef.current = labels;
  }, [labels]);

  useEffect(() => {
    const currentLabels = labelsRef.current;
    const markerLayer = new GraphicsLayer({ title: currentLabels.markerLayerTitle });
    const routeLayer = new GraphicsLayer({ title: currentLabels.routeLayerTitle });
    const serviceLayer = new GraphicsLayer({ title: currentLabels.serviceLayerTitle });

    markerLayerRef.current = markerLayer;
    routeLayerRef.current = routeLayer;
    serviceLayerRef.current = serviceLayer;

    const map = new Map({
      basemap: DEFAULT_BASEMAP_ID,
      layers: [serviceLayer, routeLayer, markerLayer]
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
    if (typeof view.openPopup === "function") {
      view.openPopup({
        features: [graphic],
        location: point
      });
      return;
    }

    view.popup.open({
      features: [graphic],
      location: point
    });
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
