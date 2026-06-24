import { addressToLocations } from "@arcgis/core/rest/locator.js";
import { getArcGISApiKey, toFriendlyArcGISError } from "./arcgisAuth.js";

const GEOCODING_URL =
  "https://geocode-api.arcgis.com/arcgis/rest/services/World/GeocodeServer";

export async function geocodePlace(searchText) {
  const apiKey = getArcGISApiKey("Konum arama");

  let candidates;
  try {
    candidates = await addressToLocations(
      GEOCODING_URL,
      {
        address: {
          SingleLine: searchText
        },
        countryCode: "TUR",
        maxLocations: 1,
        outFields: ["Match_addr", "ShortLabel", "PlaceName", "Score"]
      },
      {
        query: {
          token: apiKey
        }
      }
    );
  } catch (error) {
    throw toFriendlyArcGISError(error, "Konum arama");
  }

  const candidate = candidates?.[0];
  if (!candidate) {
    throw new Error(`"${searchText}" için Esri geocoder sonucu bulunamadı.`);
  }

  return {
    name:
      candidate.attributes?.ShortLabel ??
      candidate.attributes?.PlaceName ??
      candidate.address ??
      searchText,
    address: candidate.attributes?.Match_addr ?? candidate.address ?? searchText,
    longitude: candidate.location.longitude ?? candidate.location.x,
    latitude: candidate.location.latitude ?? candidate.location.y,
    score: candidate.attributes?.Score ?? candidate.score ?? 0
  };
}
