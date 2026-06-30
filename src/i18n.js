export const languageOptions = [
  { code: "tr", shortLabel: "TR", label: "Türkçe" },
  { code: "en", shortLabel: "EN", label: "English" }
];

export const dictionaries = {
  tr: {
    examples: [
      "Türkiye'nin en yüksek dağı nedir?",
      "Ankara'yı haritada göster",
      "Haritadaki işaretleri temizle"
    ],
    app: {
      mapStageLabel: "Harita alanı",
      apiKeyMissingAlert:
        "Esri servisleri için VITE_ARCGIS_API_KEY değeri eksik. Harita açılabilir, ancak geocoding ve rota özellikleri API key ister."
    },
    routePanel: {
      title: "Rotalama",
      loading: "Rota hesaplanıyor",
      loadingDetail: "Numaralı noktalar arasında rota çiziliyor.",
      ready: (count) => `${count} duraklı rota`,
      errorTitle: "Rota çizilemedi",
      distance: "Mesafe",
      duration: "Süre",
      mode: "Tip",
      segments: "Rota parçaları",
      segmentTitle: ({ fromIndex, toIndex }) => `${fromIndex} -> ${toIndex}`,
      stops: "Duraklar",
      close: "Rota panelini kapat",
      unavailable: "alınamadı",
      unknownError: "Rota bilgisi alınamadı.",
      travelModes: {
        driving: "Araba",
        walking: "Yürüyüş"
      }
    },
    resultPanel: {
      title: "Sorgu Sonuçları",
      close: "Sonuç panelini kapat",
      highlightAll: "Tümünü vurgula",
      zoomToFeature: "Detaya zoom yap",
      summary: ({ layerName, totalCount, shownCount }) =>
        `${layerName || "Katman"} - ${Number(totalCount ?? shownCount ?? 0).toLocaleString("tr-TR")} sonuç, ${Number(shownCount ?? 0).toLocaleString("tr-TR")} kayıt listeleniyor`
    },
    basemapControl: {
      label: "Altlık harita",
      selectLabel: "Altlık harita seç",
      options: {
        "topo-vector": "Topografik",
        "streets-vector": "Sokak",
        satellite: "Uydu",
        hybrid: "Hibrit",
        "dark-gray-vector": "Koyu gri",
        "gray-vector": "Gri",
        oceans: "Okyanus",
        osm: "OpenStreetMap"
      }
    },
    dataset: {
      uploading: (fileName) => `${fileName} yükleniyor...`,
      loaded: (name, layerCount, previewCount) =>
        `${name} yüklendi. ${layerCount} katman, ${previewCount} harita önizleme detayı hazır.`,
      uploadError: "GDB yüklenirken hata oluştu."
    },
    panel: {
      ariaLabel: "GeoAI asistan paneli",
      title: "GeoAI Asistan",
      subtitle: "Esri servisleriyle çalışan coğrafi asistan",
      mapReady: "Harita hazır",
      mapLoading: "Harita yükleniyor",
      selectedPoint: "Seçili nokta",
      apiKeyMissingWarning:
        ".env dosyasında Esri API key yok. Arama ve rota servisleri sınırlı çalışır.",
      examplesLabel: "Örnek sorular",
      roleUser: "Sen",
      roleAssistant: "GeoAI",
      questionLabel: "Coğrafi soru",
      placeholder: "Örn. Ankara'yı haritada göster",
      send: "Gönder",
      sendWaiting: "Yanıt Bekleniyor",
      datasetAriaLabel: "GDB veri yükleme",
      datasetTitle: "GDB Verisi",
      datasetEmpty: "Yüklü veri yok",
      datasetActive: (layerCount, previewCount) =>
        `${layerCount} katman, ${previewCount} önizleme detayı`,
      datasetUpload: "GDB ZIP yükle",
      datasetLayersLabel: "Yüklenen GDB katmanları",
      datasetFeatureCount: (count) => `${count} detay`,
      languageSelectorLabel: "Dil seçimi",
      languageButtonTitle: (label) => `${label} diline geç`
    },
    messages: {
      welcome:
        "Merhaba, coğrafi sorular sorabilir veya haritada bir yer göstermemi isteyebilirsin.",
      mapNotReady: "Harita henüz hazırlanıyor. Birkaç saniye sonra tekrar dene.",
      noAnswer: "GeoAI bir cevap döndürmedi.",
      invalidCoordinates:
        "GeoAI konum göstermek istedi, ancak geçerli koordinat döndürmedi.",
      clearGraphics: "Haritadaki geçici grafikler temizlendi.",
      zoomHome: "Harita başlangıç görünümüne alındı.",
      unsupportedAction:
        "GeoAI isteği yorumladı, ancak bu harita aksiyonu desteklenmiyor.",
      noActiveDataset: "Önce bir GDB yükleyin.",
      datasetNotLoaded: "GeoAI farklı bir dataset istedi, ancak o dataset şu anda yüklü değil.",
      unexpectedError: "İşlem sırasında beklenmeyen bir hata oluştu."
    },
    map: {
      markerLayerTitle: "Konum işaretleri",
      routeLayerTitle: "Rota çizimleri",
      serviceLayerTitle: "Yakınlık analizi",
      datasetLayerTitle: "GDB verisi",
      datasetHighlightLayerTitle: "GDB vurgusu",
      serviceTypes: {
        hospital: "hastane",
        pharmacy: "eczane",
        school: "okul"
      },
      selectedPointName: "Seçili nokta",
      mapCenterName: "Harita merkezi",
      popupName: "Ad",
      popupDescription: "Açıklama",
      objectIdLabel: "Object ID",
      datasetLayerLabel: "Katman",
      mapNotReady: "Harita henüz hazır değil.",
      datasetNoPreview: "GDB için harita önizlemesi bulunamadı.",
      datasetNoMatchingFeatures: "Bu cevapla eşleşen harita detayı önizlemede bulunamadı.",
      datasetShown: (name, count) => `${name} haritada gösterildi (${count} detay).`,
      datasetHighlighted: (count) => `${count} detay haritada vurgulandı.`,
      homeView: "Harita başlangıç görünümüne alındı.",
      unsupportedBasemap: "Bu altlık harita desteklenmiyor.",
      basemapChanged: (name) => `Altlık harita ${name} olarak değiştirildi.`,
      basemaps: {
        "topo-vector": "Topografik",
        "streets-vector": "Sokak",
        satellite: "Uydu",
        hybrid: "Hibrit",
        "dark-gray-vector": "Koyu gri",
        "gray-vector": "Gri",
        oceans: "Okyanus",
        osm: "OpenStreetMap"
      },
      shownOnMap: (name) => `${name} haritada gösterildi.`,
      multipleLocationsShown: (count) => `${count} konum haritada numaralı olarak gösterildi.`,
      sourceLabel: "Kaynak",
      matchScoreLabel: "Eşleşme puanı",
      nearestOriginPopup: "Yakınlık analizi başlangıç noktası",
      servicePoint: "Hizmet noktası",
      approximate: "Yaklaşık",
      selectedPointBased: "Seçili noktaya göre",
      mapCenterBased: "Harita merkezi baz alınarak",
      nearestAnswer: ({ sourceText, serviceLabel, nearestName, distanceKm }) =>
        `${sourceText} en yakın ${serviceLabel}: ${nearestName}. Yaklaşık ${distanceKm} km uzaklıkta.`,
      routeMissingInput:
        "Rota için başlangıç ve varış yeri gerekir. Örn. Ankara'dan İstanbul'a rota çiz.",
      routeStart: "Rota başlangıcı",
      routeEnd: "Rota varışı",
      noDistance: "mesafe bilgisi alınamadı",
      noDuration: "süre bilgisi alınamadı",
      distanceLabel: "Mesafe",
      durationLabel: "Süre",
      travelModeLabel: "Tip",
      unknownTravelMode: "Bilinmiyor",
      travelModes: {
        driving: "Araba",
        walking: "Yürüyüş"
      },
      routeSegmentTitle: ({ fromIndex, toIndex, fromName, toName }) =>
        `${fromIndex} -> ${toIndex}: ${fromName} - ${toName}`,
      routeSegmentMapLabel: ({ fromIndex, toIndex, durationText, modeText }) =>
        `${fromIndex}-${toIndex} / ${durationText} / ${modeText}`,
      routeAnswer: ({ startName, finishName, distanceText, durationText }) =>
        `${startName} ile ${finishName} arasında rota çizildi. Mesafe: ${distanceText}, süre: ${durationText}.`,
      auth: {
        missingApiKey: (featureName) =>
          `${featureName} için Esri API key gerekli. .env dosyasına VITE_ARCGIS_API_KEY değerini ekle.`,
        rejectedApiKey: (featureName) =>
          `${featureName} için .env içindeki VITE_ARCGIS_API_KEY Esri tarafından reddedildi. Geçerli, süresi dolmamış ve Location Services yetkileri açık bir ArcGIS API key kullan.`,
        serviceUnavailable: (featureName) =>
          `${featureName} sırasında Esri servisi yanıt vermedi.`,
        geocodeFeatureName: "Konum arama",
        routeFeatureName: "Rota servisi"
      }
    }
  },
  en: {
    examples: [
      "What is the highest mountain in Turkey?",
      "Show Ankara on the map",
      "Clear the map markers"
    ],
    app: {
      mapStageLabel: "Map area",
      apiKeyMissingAlert:
        "VITE_ARCGIS_API_KEY is missing for Esri services. The map can still open, but geocoding and routing require an API key."
    },
    routePanel: {
      title: "Routing",
      loading: "Calculating route",
      loadingDetail: "Drawing a route between the numbered points.",
      ready: (count) => `${count}-stop route`,
      errorTitle: "Route could not be drawn",
      distance: "Distance",
      duration: "Duration",
      mode: "Mode",
      segments: "Route segments",
      segmentTitle: ({ fromIndex, toIndex }) => `${fromIndex} -> ${toIndex}`,
      stops: "Stops",
      close: "Close route panel",
      unavailable: "unavailable",
      unknownError: "Route information could not be loaded.",
      travelModes: {
        driving: "Car",
        walking: "Walking"
      }
    },
    resultPanel: {
      title: "Query Results",
      close: "Close result panel",
      highlightAll: "Highlight all",
      zoomToFeature: "Zoom to feature",
      summary: ({ layerName, totalCount, shownCount }) =>
        `${layerName || "Layer"} - ${Number(totalCount ?? shownCount ?? 0).toLocaleString("en-US")} results, ${Number(shownCount ?? 0).toLocaleString("en-US")} listed`
    },
    basemapControl: {
      label: "Basemap",
      selectLabel: "Select basemap",
      options: {
        "topo-vector": "Topographic",
        "streets-vector": "Streets",
        satellite: "Satellite",
        hybrid: "Hybrid",
        "dark-gray-vector": "Dark gray",
        "gray-vector": "Gray",
        oceans: "Oceans",
        osm: "OpenStreetMap"
      }
    },
    dataset: {
      uploading: (fileName) => `Uploading ${fileName}...`,
      loaded: (name, layerCount, previewCount) =>
        `${name} uploaded. ${layerCount} layers and ${previewCount} map preview features are ready.`,
      uploadError: "An error occurred while uploading the GDB."
    },
    panel: {
      ariaLabel: "GeoAI assistant panel",
      title: "GeoAI Assistant",
      subtitle: "Geographic assistant powered by Esri services",
      mapReady: "Map ready",
      mapLoading: "Map loading",
      selectedPoint: "Selected point",
      apiKeyMissingWarning:
        "No Esri API key was found in .env. Search and routing services will be limited.",
      examplesLabel: "Example questions",
      roleUser: "You",
      roleAssistant: "GeoAI",
      questionLabel: "Geographic question",
      placeholder: "E.g. Show Ankara on the map",
      send: "Send",
      sendWaiting: "Waiting for answer",
      datasetAriaLabel: "GDB data upload",
      datasetTitle: "GDB Data",
      datasetEmpty: "No data loaded",
      datasetActive: (layerCount, previewCount) =>
        `${layerCount} layers, ${previewCount} preview features`,
      datasetUpload: "Upload GDB ZIP",
      datasetLayersLabel: "Uploaded GDB layers",
      datasetFeatureCount: (count) => `${count} features`,
      languageSelectorLabel: "Language selection",
      languageButtonTitle: (label) => `Switch to ${label}`
    },
    messages: {
      welcome:
        "Hi, you can ask geographic questions or ask me to show a place on the map.",
      mapNotReady: "The map is still preparing. Try again in a few seconds.",
      noAnswer: "GeoAI did not return an answer.",
      invalidCoordinates:
        "GeoAI tried to show a location, but did not return valid coordinates.",
      clearGraphics: "Temporary map graphics have been cleared.",
      zoomHome: "The map returned to the home view.",
      unsupportedAction:
        "GeoAI understood the request, but this map action is not supported.",
      noActiveDataset: "Upload a GDB first.",
      datasetNotLoaded: "GeoAI requested a different dataset, but it is not currently loaded.",
      unexpectedError: "An unexpected error occurred during the operation."
    },
    map: {
      markerLayerTitle: "Location markers",
      routeLayerTitle: "Route drawings",
      serviceLayerTitle: "Proximity analysis",
      datasetLayerTitle: "GDB data",
      datasetHighlightLayerTitle: "GDB highlight",
      serviceTypes: {
        hospital: "hospital",
        pharmacy: "pharmacy",
        school: "school"
      },
      selectedPointName: "Selected point",
      mapCenterName: "Map center",
      popupName: "Name",
      popupDescription: "Description",
      objectIdLabel: "Object ID",
      datasetLayerLabel: "Layer",
      mapNotReady: "The map is not ready yet.",
      datasetNoPreview: "No map preview was found for this GDB.",
      datasetNoMatchingFeatures: "No preview feature matched this answer.",
      datasetShown: (name, count) => `${name} was shown on the map (${count} features).`,
      datasetHighlighted: (count) => `${count} features were highlighted on the map.`,
      homeView: "The map returned to the home view.",
      unsupportedBasemap: "This basemap is not supported.",
      basemapChanged: (name) => `Basemap changed to ${name}.`,
      basemaps: {
        "topo-vector": "Topographic",
        "streets-vector": "Streets",
        satellite: "Satellite",
        hybrid: "Hybrid",
        "dark-gray-vector": "Dark gray",
        "gray-vector": "Gray",
        oceans: "Oceans",
        osm: "OpenStreetMap"
      },
      shownOnMap: (name) => `${name} was shown on the map.`,
      multipleLocationsShown: (count) => `${count} locations were shown on the map with numbers.`,
      sourceLabel: "Source",
      matchScoreLabel: "Match score",
      nearestOriginPopup: "Proximity analysis start point",
      servicePoint: "Service point",
      approximate: "About",
      selectedPointBased: "Based on the selected point",
      mapCenterBased: "Using the map center",
      nearestAnswer: ({ sourceText, serviceLabel, nearestName, distanceKm }) =>
        `${sourceText}, the nearest ${serviceLabel} is ${nearestName}. It is about ${distanceKm} km away.`,
      routeMissingInput:
        "A route needs both an origin and a destination. Example: Draw a route from Ankara to Istanbul.",
      routeStart: "Route start",
      routeEnd: "Route destination",
      noDistance: "distance unavailable",
      noDuration: "duration unavailable",
      distanceLabel: "Distance",
      durationLabel: "Duration",
      travelModeLabel: "Mode",
      unknownTravelMode: "Unknown",
      travelModes: {
        driving: "Car",
        walking: "Walking"
      },
      routeSegmentTitle: ({ fromIndex, toIndex, fromName, toName }) =>
        `${fromIndex} -> ${toIndex}: ${fromName} - ${toName}`,
      routeSegmentMapLabel: ({ fromIndex, toIndex, durationText, modeText }) =>
        `${fromIndex}-${toIndex} / ${durationText} / ${modeText}`,
      routeAnswer: ({ startName, finishName, distanceText, durationText }) =>
        `A route was drawn between ${startName} and ${finishName}. Distance: ${distanceText}, duration: ${durationText}.`,
      auth: {
        missingApiKey: (featureName) =>
          `${featureName} requires an Esri API key. Add VITE_ARCGIS_API_KEY to your .env file.`,
        rejectedApiKey: (featureName) =>
          `${featureName} was rejected by Esri because VITE_ARCGIS_API_KEY in .env is invalid. Use a valid, unexpired ArcGIS API key with Location Services enabled.`,
        serviceUnavailable: (featureName) =>
          `The Esri service did not respond during ${featureName}.`,
        geocodeFeatureName: "Location search",
        routeFeatureName: "Routing"
      }
    }
  }
};

export function getDictionary(language) {
  return dictionaries[language] ?? dictionaries.tr;
}
