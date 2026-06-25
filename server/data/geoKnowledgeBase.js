const TURKISH_CHAR_MAP = {
  "\u00e7": "c",
  "\u011f": "g",
  "\u0131": "i",
  "\u00f6": "o",
  "\u015f": "s",
  "\u00fc": "u"
};

export const geoKnowledgeBase = [
  {
    keywords: [
      "dunyanin en buyuk golu",
      "en buyuk gol",
      "largest lake in the world",
      "world's largest lake",
      "caspian sea",
      "hazar denizi"
    ],
    response: {
      type: "geo_answer",
      answer:
        "D\u00fcnyan\u0131n en b\u00fcy\u00fck g\u00f6l\u00fc Hazar Denizi'dir. Ad\u0131nda deniz ge\u00e7mesine ra\u011fmen kapal\u0131 bir i\u00e7 su k\u00fctlesi oldu\u011fu i\u00e7in co\u011frafi olarak g\u00f6l kabul edilir. Avrupa ile Asya aras\u0131nda yer al\u0131r.",
      mapAction: {
        action: "show_location",
        name: "Hazar Denizi",
        latitude: 41.7,
        longitude: 50.7,
        zoom: 5
      }
    }
  },
  {
    keywords: [
      "turkiye'nin en yuksek dagi",
      "turkiyenin en yuksek dagi",
      "turkiye en yuksek dag",
      "en yuksek dagi",
      "highest mountain in turkey",
      "turkey's highest mountain",
      "agri dagi",
      "mount ararat"
    ],
    response: {
      type: "geo_answer",
      answer:
        "T\u00fcrkiye'nin en y\u00fcksek da\u011f\u0131 A\u011fr\u0131 Da\u011f\u0131'd\u0131r. Yakla\u015f\u0131k 5.137 metre y\u00fcksekli\u011findedir.",
      mapAction: {
        action: "show_location",
        name: "A\u011fr\u0131 Da\u011f\u0131",
        latitude: 39.702,
        longitude: 44.292,
        zoom: 10
      }
    }
  },
  {
    keywords: [
      "turkiye'nin en buyuk golu",
      "turkiyenin en buyuk golu",
      "turkiye en buyuk gol",
      "van golu nerede",
      "van golu",
      "where is lake van",
      "lake van",
      "largest lake in turkey"
    ],
    response: {
      type: "geo_answer",
      answer:
        "T\u00fcrkiye'nin en b\u00fcy\u00fck g\u00f6l\u00fc Van G\u00f6l\u00fc'd\u00fcr. Do\u011fu Anadolu B\u00f6lgesi'nde, Van ve Bitlis illeri aras\u0131nda yer al\u0131r.",
      mapAction: {
        action: "show_location",
        name: "Van G\u00f6l\u00fc",
        latitude: 38.64,
        longitude: 42.958,
        zoom: 9
      }
    }
  },
  {
    keywords: [
      "turkiye'nin en uzun nehri",
      "turkiyenin en uzun nehri",
      "turkiye en uzun nehir",
      "en uzun nehir",
      "kizilirmak",
      "longest river in turkey",
      "turkey's longest river"
    ],
    response: {
      type: "geo_answer",
      answer:
        "T\u00fcrkiye s\u0131n\u0131rlar\u0131 i\u00e7indeki en uzun nehir K\u0131z\u0131l\u0131rmak't\u0131r. Yakla\u015f\u0131k 1.355 kilometre uzunlu\u011fundad\u0131r.",
      mapAction: {
        action: "show_location",
        name: "K\u0131z\u0131l\u0131rmak",
        latitude: 39.5,
        longitude: 35,
        zoom: 8
      }
    }
  },
  {
    keywords: [
      "dunyanin en yuksek dagi",
      "highest mountain in the world",
      "world's highest mountain",
      "everest"
    ],
    response: {
      type: "geo_answer",
      answer:
        "D\u00fcnyan\u0131n en y\u00fcksek da\u011f\u0131 Everest Da\u011f\u0131'd\u0131r. Yakla\u015f\u0131k 8.849 metre y\u00fcksekli\u011findedir.",
      mapAction: {
        action: "show_location",
        name: "Everest Da\u011f\u0131",
        latitude: 27.9881,
        longitude: 86.925,
        zoom: 8
      }
    }
  },
  {
    keywords: [
      "dunyanin en buyuk okyanusu",
      "largest ocean in the world",
      "pacific ocean",
      "pasifik okyanusu"
    ],
    response: {
      type: "geo_answer",
      answer: "D\u00fcnyan\u0131n en b\u00fcy\u00fck okyanusu Pasifik Okyanusu'dur.",
      mapAction: {
        action: "show_location",
        name: "Pasifik Okyanusu",
        latitude: 0,
        longitude: -160,
        zoom: 3
      }
    }
  },
  {
    keywords: [
      "ankarada gezilecek",
      "ankara da gezilecek",
      "ankara'da gezilecek",
      "ankara gezilecek yerler",
      "ankarada gezilecek yerler olustur",
      "ankara gezilecek yer olustur",
      "places to visit in ankara",
      "things to do in ankara"
    ],
    response: {
      type: "geo_answer",
      answer:
        "Ankara'da gezilecek ba\u015fl\u0131ca yerler: 1. Ankara Kalesi, 2. An\u0131tkabir, 3. Atat\u00fcrk Orman \u00c7iftli\u011fi, 4. Eymir G\u00f6l\u00fc, 5. K\u0131z\u0131lay Meydan\u0131, 6. CerModern, 7. Hamam\u00f6n\u00fc. Bu yerleri haritada numaral\u0131 olarak g\u00f6rebilirsiniz.",
      mapAction: {
        action: "show_locations",
        locations: [
          {
            name: "Ankara Kalesi",
            latitude: 39.941,
            longitude: 32.8644,
            description: "Tarihi kale ve eski Ankara manzaras\u0131."
          },
          {
            name: "An\u0131tkabir",
            latitude: 39.9251,
            longitude: 32.8369,
            description: "Mustafa Kemal Atat\u00fcrk'\u00fcn an\u0131t mezar\u0131."
          },
          {
            name: "Atat\u00fcrk Orman \u00c7iftli\u011fi",
            latitude: 39.9408,
            longitude: 32.8039,
            description: "Ye\u015fil alanlar, \u00fcretim tesisleri ve aile gezileri i\u00e7in uygun geni\u015f alan."
          },
          {
            name: "Eymir G\u00f6l\u00fc",
            latitude: 39.8211,
            longitude: 32.8144,
            description: "Do\u011fa y\u00fcr\u00fcy\u00fc\u015f\u00fc, bisiklet ve g\u00f6l manzaras\u0131 i\u00e7in pop\u00fcler alan."
          },
          {
            name: "K\u0131z\u0131lay Meydan\u0131",
            latitude: 39.9208,
            longitude: 32.8541,
            description: "Ankara'n\u0131n merkezi bulu\u015fma ve ula\u015f\u0131m noktalar\u0131ndan biri."
          },
          {
            name: "CerModern",
            latitude: 39.9346,
            longitude: 32.8477,
            description: "Modern sanat sergileri ve k\u00fclt\u00fcr etkinlikleri i\u00e7in ziyaret edilebilir."
          },
          {
            name: "Hamam\u00f6n\u00fc",
            latitude: 39.9328,
            longitude: 32.8641,
            description: "Restore edilmi\u015f tarihi sokaklar, kafeler ve Ankara evleri."
          }
        ],
        zoom: 11
      }
    }
  },
  {
    keywords: [
      "ankara'yi haritada goster",
      "ankara yi haritada goster",
      "ankara haritada goster",
      "show ankara on the map"
    ],
    response: {
      type: "map_action",
      answer: "Ankara Esri geocoder ile aran\u0131yor.",
      mapAction: {
        action: "geocode",
        query: "Ankara"
      }
    }
  },
  {
    keywords: [
      "uydu haritaya gec",
      "uydu gorunumune gec",
      "uydu basemap",
      "satellite basemap",
      "change basemap to satellite",
      "haritayi uydu yap"
    ],
    response: {
      type: "map_action",
      answer: "Basemap uydu g\u00f6r\u00fcn\u00fcm\u00fcne al\u0131nd\u0131.",
      mapAction: {
        action: "change_basemap",
        basemapId: "satellite"
      }
    }
  },
  {
    keywords: [
      "hibrit haritaya gec",
      "hybrid basemap",
      "uydu etiketli harita",
      "haritayi hibrit yap"
    ],
    response: {
      type: "map_action",
      answer: "Basemap hibrit g\u00f6r\u00fcn\u00fcme al\u0131nd\u0131.",
      mapAction: {
        action: "change_basemap",
        basemapId: "hybrid"
      }
    }
  },
  {
    keywords: [
      "sokak haritasina gec",
      "cadde haritasina gec",
      "streets basemap",
      "change basemap to streets",
      "haritayi sokak yap"
    ],
    response: {
      type: "map_action",
      answer: "Basemap sokak haritas\u0131na al\u0131nd\u0131.",
      mapAction: {
        action: "change_basemap",
        basemapId: "streets-vector"
      }
    }
  },
  {
    keywords: [
      "topografik haritaya gec",
      "topo basemap",
      "topographic basemap",
      "haritayi topografik yap"
    ],
    response: {
      type: "map_action",
      answer: "Basemap topografik haritaya al\u0131nd\u0131.",
      mapAction: {
        action: "change_basemap",
        basemapId: "topo-vector"
      }
    }
  },
  {
    keywords: [
      "koyu haritaya gec",
      "koyu basemap",
      "dark basemap",
      "dark gray basemap",
      "haritayi koyu yap"
    ],
    response: {
      type: "map_action",
      answer: "Basemap koyu gri g\u00f6r\u00fcn\u00fcme al\u0131nd\u0131.",
      mapAction: {
        action: "change_basemap",
        basemapId: "dark-gray-vector"
      }
    }
  },
  {
    keywords: [
      "gri haritaya gec",
      "gray basemap",
      "grey basemap",
      "haritayi gri yap"
    ],
    response: {
      type: "map_action",
      answer: "Basemap gri g\u00f6r\u00fcn\u00fcme al\u0131nd\u0131.",
      mapAction: {
        action: "change_basemap",
        basemapId: "gray-vector"
      }
    }
  },
  {
    keywords: [
      "okyanus haritasina gec",
      "oceans basemap",
      "ocean basemap",
      "haritayi okyanus yap"
    ],
    response: {
      type: "map_action",
      answer: "Basemap okyanus g\u00f6r\u00fcn\u00fcme al\u0131nd\u0131.",
      mapAction: {
        action: "change_basemap",
        basemapId: "oceans"
      }
    }
  },
  {
    keywords: [
      "osm haritaya gec",
      "openstreetmap haritaya gec",
      "openstreetmap basemap",
      "haritayi osm yap"
    ],
    response: {
      type: "map_action",
      answer: "Basemap OpenStreetMap g\u00f6r\u00fcn\u00fcme al\u0131nd\u0131.",
      mapAction: {
        action: "change_basemap",
        basemapId: "osm"
      }
    }
  },
  {
    keywords: [
      "haritadaki isaretleri temizle",
      "isaretleri temizle",
      "markerlari temizle",
      "gecici grafikleri temizle",
      "clear the map markers",
      "clear graphics",
      "clear map markers"
    ],
    response: {
      type: "map_action",
      answer: "Haritadaki ge\u00e7ici grafikler temizlendi.",
      mapAction: {
        action: "clear_graphics"
      }
    }
  },
  {
    keywords: [
      "baslangic gorunumune don",
      "haritayi basa al",
      "haritayi sifirla",
      "zoom home",
      "return to home view",
      "reset map view"
    ],
    response: {
      type: "map_action",
      answer: "Harita ba\u015flang\u0131\u00e7 g\u00f6r\u00fcn\u00fcm\u00fcne al\u0131nd\u0131.",
      mapAction: {
        action: "zoom_home"
      }
    }
  }
];

const unsafeKeywordGroups = [
  ["aktif katman", "tum verileri", "sil"],
  ["servis", "kayit", "guncelle"],
  ["api key", "goster"],
  ["api key", "show"],
  ["veritabani", "kullanici", "degistir"],
  ["harita servis", "tum kayit", "kaldir"],
  ["database", "users", "change"],
  ["delete", "active layer", "records"],
  ["update", "service", "records"]
];

const mutationWords = [
  "sil",
  "delete",
  "guncelle",
  "update",
  "insert",
  "ekle",
  "kaldir",
  "drop",
  "truncate",
  "degistir"
];

const protectedDataWords = [
  "veri",
  "kayit",
  "katman",
  "servis",
  "feature",
  "database",
  "veritabani",
  "kullanici",
  "users",
  "records",
  "layer"
];

function normalizeForSearch(value) {
  return String(value || "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u00e7\u011f\u0131\u00f6\u015f\u00fc]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .replace(/[\u2019']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function cloneResponse(response) {
  return JSON.parse(JSON.stringify(response));
}

export function isUnsafeGeoRequest(message) {
  const text = normalizeForSearch(message);

  if (unsafeKeywordGroups.some((group) => group.every((keyword) => text.includes(keyword)))) {
    return true;
  }

  return (
    mutationWords.some((keyword) => text.includes(keyword)) &&
    protectedDataWords.some((keyword) => text.includes(keyword))
  );
}

export function getUnsafeGeoAIResponse(language = "tr") {
  return {
    type: "unsupported",
    answer:
      language === "en"
        ? "I cannot support this request for security reasons."
        : "Bu iste\u011fi g\u00fcvenlik nedeniyle desteklemiyorum.",
    mapAction: null
  };
}

export function findGeoKnowledgeAnswer(message) {
  const text = normalizeForSearch(message);
  const match = geoKnowledgeBase.find((item) =>
    item.keywords.some((keyword) => text.includes(normalizeForSearch(keyword)))
  );

  return match
    ? {
        ...match,
        response: cloneResponse(match.response)
      }
    : null;
}
