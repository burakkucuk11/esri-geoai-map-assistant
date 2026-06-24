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
import { geocodePlace } from "../utils/geocoder.js";
import { solveRoute } from "../utils/routeService.js";
import { MOCK_SERVICE_POINTS, serviceTypeLabels } from "../data/mockServicePoints.js";

const TURKEY_CENTER = [35.2433, 38.9637];

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

function buildPopupContent(location) {
  const details = location.details ?? [];
  const rows = [
    `<strong>Ad:</strong> ${escapeHtml(location.name)}`,
    location.description ? `<strong>Açıklama:</strong> ${escapeHtml(location.description)}` : null,
    ...details.map(
      (detail) => `<strong>${escapeHtml(detail.label)}:</strong> ${escapeHtml(detail.value)}`
    )
  ].filter(Boolean);

  return `<div class="geo-popup">${rows.map((row) => `<p>${row}</p>`).join("")}</div>`;
}

const GeoMapView = forwardRef(function GeoMapView(
  { onReadyChange, onSelectionChange },
  ref
) {
  const mapContainerRef = useRef(null);
  const viewRef = useRef(null);
  const markerLayerRef = useRef(null);
  const routeLayerRef = useRef(null);
  const serviceLayerRef = useRef(null);
  const selectedPointRef = useRef(null);

  useEffect(() => {
    const markerLayer = new GraphicsLayer({ title: "Konum işaretleri" });
    const routeLayer = new GraphicsLayer({ title: "Rota çizimleri" });
    const serviceLayer = new GraphicsLayer({ title: "Yakınlık analizi" });

    markerLayerRef.current = markerLayer;
    routeLayerRef.current = routeLayer;
    serviceLayerRef.current = serviceLayer;

    const map = new Map({
      basemap: "topo-vector",
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
        name: "Seçili nokta"
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

    if (!view || !markerLayer) {
      throw new Error("Harita henüz hazır değil.");
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
        content: buildPopupContent(location)
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

  useImperativeHandle(ref, () => ({
    async showPointOnMap(location) {
      await addLocationGraphic(location);
      return {
        answer: `${location.name} haritada gösterildi.`
      };
    },

    async showKnownLocation(location) {
      await addLocationGraphic(location);
      return {
        answer: `${location.name} haritada gösterildi.`
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

    async geocodeAndShow(query) {
      const result = await geocodePlace(query);

      await addLocationGraphic({
        name: result.name,
        longitude: result.longitude,
        latitude: result.latitude,
        description: result.address,
        details: [
          { label: "Kaynak", value: "Esri World Geocoding Service" },
          { label: "Eşleşme puanı", value: `${Math.round(result.score)} / 100` }
        ],
        zoom: 12
      });

      return {
        answer: `${result.name} haritada gösterildi.`
      };
    },

    async findNearestFeature(serviceType = "hospital") {
      const view = viewRef.current;
      const serviceLayer = serviceLayerRef.current;

      if (!view || !serviceLayer) {
        throw new Error("Harita henüz hazır değil.");
      }

      const origin =
        selectedPointRef.current ?? {
          longitude: view.center.longitude,
          latitude: view.center.latitude,
          name: "Harita merkezi"
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
          content: "Yakınlık analizi başlangıç noktası"
        }
      });

      const nearestGraphic = new Graphic({
        geometry: createPoint(nearest),
        symbol: pointSymbol("#dc2626", 16),
        popupTemplate: {
          title: nearest.name,
          content: `${serviceTypeLabels[serviceType] ?? "Hizmet noktası"} - Yaklaşık ${nearest.distanceKm.toFixed(1)} km`
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
        ? "Seçili noktaya göre"
        : "Harita merkezi baz alınarak";

      return {
        answer: `${sourceText} en yakın ${serviceTypeLabels[serviceType] ?? "hizmet noktası"}: ${nearest.name}. Yaklaşık ${nearest.distanceKm.toFixed(1)} km uzaklıkta.`
      };
    },

    async createRoute(from, to) {
      if (!from || !to) {
        throw new Error(
          "Rota için başlangıç ve varış yeri gerekir. Örn. Ankara'dan İstanbul'a rota çiz."
        );
      }

      const view = viewRef.current;
      const routeLayer = routeLayerRef.current;

      if (!view || !routeLayer) {
        throw new Error("Harita henüz hazır değil.");
      }

      const [start, finish] = await Promise.all([geocodePlace(from), geocodePlace(to)]);
      const routeResult = await solveRoute(start, finish);
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
          description: "Rota başlangıcı"
        },
        { color: "#2563eb", keepExisting: false, size: 12 }
      );
      await addLocationGraphic(
        {
          name: finish.name,
          longitude: finish.longitude,
          latitude: finish.latitude,
          description: "Rota varışı"
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
        : "mesafe bilgisi alınamadı";
      const durationText = routeResult.totalTimeMinutes
        ? `${Math.round(routeResult.totalTimeMinutes)} dk`
        : "süre bilgisi alınamadı";

      return {
        answer: `${start.name} ile ${finish.name} arasında rota çizildi. Mesafe: ${distanceText}, süre: ${durationText}.`
      };
    }
  }));

  return <div className="map-view" ref={mapContainerRef} />;
});

export default GeoMapView;
