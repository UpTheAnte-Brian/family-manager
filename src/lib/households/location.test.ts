import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildHouseholdLocationLabel,
  isHouseholdLocationComplete,
  normalizeGeocodingResult,
} from "./location";

describe("household location helpers", () => {
  it("normalizes a Google geocoding result into the stored household location shape", () => {
    const location = normalizeGeocodingResult({
      address_components: [
        { long_name: "277", short_name: "277", types: ["street_number"] },
        { long_name: "Bedford Avenue", short_name: "Bedford Ave", types: ["route"] },
        { long_name: "Brooklyn", short_name: "Brooklyn", types: ["locality", "political"] },
        {
          long_name: "New York",
          short_name: "NY",
          types: ["administrative_area_level_1", "political"],
        },
        { long_name: "United States", short_name: "US", types: ["country", "political"] },
        { long_name: "11211", short_name: "11211", types: ["postal_code"] },
      ],
      formatted_address: "277 Bedford Ave, Brooklyn, NY 11211, USA",
      geometry: {
        location: {
          lat: 40.7142205,
          lng: -73.9612903,
        },
      },
      place_id: "ChIJd8BlQ2BZwokRAFUEcm_qrcA",
    });

    assert.deepEqual(location, {
      addressLine1: "277 Bedford Avenue",
      addressLine2: "",
      administrativeArea: "NY",
      countryCode: "US",
      formattedAddress: "277 Bedford Ave, Brooklyn, NY 11211, USA",
      googlePlaceId: "ChIJd8BlQ2BZwokRAFUEcm_qrcA",
      latitude: 40.7142205,
      locality: "Brooklyn",
      longitude: -73.9612903,
      postalCode: "11211",
    });
    assert.equal(isHouseholdLocationComplete(location), true);
  });

  it("builds a stable map label from locality and administrative area", () => {
    assert.equal(
      buildHouseholdLocationLabel({
        administrativeArea: "MN",
        formattedAddress: "123 Main St, Maple Grove, MN 55369, USA",
        locality: "Maple Grove",
      }),
      "Maple Grove, MN",
    );
  });
});
