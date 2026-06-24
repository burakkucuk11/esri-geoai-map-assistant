export const languageOptions = [
  { code: "tr", shortLabel: "TR", label: "Türkçe" },
  { code: "en", shortLabel: "EN", label: "English" }
];

export const dictionaries = {
  tr: {
    examples: [
      "Türkiye'nin en yüksek dağı nedir?",
      "Ankara'yı haritada göster",
      "Van Gölü nerede?",
      "Haritadaki işaretleri temizle",
      "Türkiye'nin en uzun nehri nedir?"
    ],
    app: {
      mapStageLabel: "Harita alanı",
      apiKeyMissingAlert:
        "Esri servisleri için VITE_ARCGIS_API_KEY değeri eksik. Harita açılabilir, ancak geocoding ve rota özellikleri API key ister."
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
      unsupportedAction:
        "GeoAI isteği yorumladı, ancak bu harita aksiyonu desteklenmiyor.",
      unexpectedError: "İşlem sırasında beklenmeyen bir hata oluştu."
    },
    map: {
      markerLayerTitle: "Konum işaretleri",
      routeLayerTitle: "Rota çizimleri",
      serviceLayerTitle: "Yakınlık analizi",
      serviceTypes: {
        hospital: "hastane",
        pharmacy: "eczane",
        school: "okul"
      },
      selectedPointName: "Seçili nokta",
      mapCenterName: "Harita merkezi",
      popupName: "Ad",
      popupDescription: "Açıklama",
      mapNotReady: "Harita henüz hazır değil.",
      shownOnMap: (name) => `${name} haritada gösterildi.`,
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
      "Where is Lake Van?",
      "Clear the map markers",
      "What is the longest river in Turkey?"
    ],
    app: {
      mapStageLabel: "Map area",
      apiKeyMissingAlert:
        "VITE_ARCGIS_API_KEY is missing for Esri services. The map can still open, but geocoding and routing require an API key."
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
      unsupportedAction:
        "GeoAI understood the request, but this map action is not supported.",
      unexpectedError: "An unexpected error occurred during the operation."
    },
    map: {
      markerLayerTitle: "Location markers",
      routeLayerTitle: "Route drawings",
      serviceLayerTitle: "Proximity analysis",
      serviceTypes: {
        hospital: "hospital",
        pharmacy: "pharmacy",
        school: "school"
      },
      selectedPointName: "Selected point",
      mapCenterName: "Map center",
      popupName: "Name",
      popupDescription: "Description",
      mapNotReady: "The map is not ready yet.",
      shownOnMap: (name) => `${name} was shown on the map.`,
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
