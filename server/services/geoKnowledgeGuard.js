const TURKISH_CHAR_MAP = {
  "\u00e7": "c",
  "\u011f": "g",
  "\u0131": "i",
  "\u00f6": "o",
  "\u015f": "s",
  "\u00fc": "u"
};

const knownGeoAnswers = [
  {
    keywords: ["turkiye", "en yuksek dag", "agri dagi", "kac metre"],
    result: {
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
    keywords: ["turkiye", "en buyuk gol", "van golu"],
    result: {
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
    keywords: ["en uzun", "nehr"],
    result: {
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
  }
];

function normalizeForSearch(value) {
  return String(value)
    .toLocaleLowerCase("tr-TR")
    .replace(/[\u00e7\u011f\u0131\u00f6\u015f\u00fc]/g, (char) => TURKISH_CHAR_MAP[char] ?? char)
    .replace(/[\u2019']/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function answerKnownGeoQuestion(message) {
  const normalizedMessage = normalizeForSearch(message);

  const match = knownGeoAnswers.find((item) =>
    item.keywords.every((keyword) => normalizedMessage.includes(keyword))
  );

  return match?.result ?? null;
}
