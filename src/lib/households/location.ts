export type HouseholdLocation = {
  addressLine1: string;
  addressLine2: string;
  administrativeArea: string;
  countryCode: string;
  formattedAddress: string;
  googlePlaceId: string;
  latitude: number | null;
  locality: string;
  longitude: number | null;
  postalCode: string;
};

export type AddressSuggestion = {
  fullText: string;
  placeId: string;
  primaryText: string;
  secondaryText: string;
};

type GeocodingAddressComponent = {
  long_name?: string;
  short_name?: string;
  types?: string[];
};

type GeocodingResult = {
  address_components?: GeocodingAddressComponent[];
  formatted_address?: string;
  geometry?: {
    location?: {
      lat?: number;
      lng?: number;
    };
  };
  place_id?: string;
};

export const emptyHouseholdLocation: HouseholdLocation = {
  addressLine1: "",
  addressLine2: "",
  administrativeArea: "",
  countryCode: "",
  formattedAddress: "",
  googlePlaceId: "",
  latitude: null,
  locality: "",
  longitude: null,
  postalCode: "",
};

export function normalizeHouseholdLocation(value: Partial<HouseholdLocation> | null | undefined): HouseholdLocation {
  return {
    addressLine1: value?.addressLine1?.trim() ?? "",
    addressLine2: value?.addressLine2?.trim() ?? "",
    administrativeArea: value?.administrativeArea?.trim() ?? "",
    countryCode: value?.countryCode?.trim().toUpperCase() ?? "",
    formattedAddress: value?.formattedAddress?.trim() ?? "",
    googlePlaceId: value?.googlePlaceId?.trim() ?? "",
    latitude: typeof value?.latitude === "number" ? value.latitude : null,
    locality: value?.locality?.trim() ?? "",
    longitude: typeof value?.longitude === "number" ? value.longitude : null,
    postalCode: value?.postalCode?.trim() ?? "",
  };
}

export function isHouseholdLocationComplete(location: HouseholdLocation) {
  return Boolean(
    location.addressLine1 &&
      location.formattedAddress &&
      location.googlePlaceId &&
      typeof location.latitude === "number" &&
      typeof location.longitude === "number",
  );
}

export function mapHouseholdLocationToRow(location: HouseholdLocation) {
  return {
    address_line1: location.addressLine1 || null,
    address_line2: location.addressLine2 || null,
    administrative_area: location.administrativeArea || null,
    country_code: location.countryCode || null,
    formatted_address: location.formattedAddress || null,
    google_place_id: location.googlePlaceId || null,
    latitude: location.latitude,
    locality: location.locality || null,
    longitude: location.longitude,
    postal_code: location.postalCode || null,
  };
}

export function normalizeGeocodingResult(result: GeocodingResult): HouseholdLocation {
  const addressComponents = Array.isArray(result.address_components) ? result.address_components : [];
  const streetNumber = readAddressComponent(addressComponents, "street_number");
  const route = readAddressComponent(addressComponents, "route");
  const subpremise = readAddressComponent(addressComponents, "subpremise");
  const locality =
    readAddressComponent(addressComponents, "locality") ||
    readAddressComponent(addressComponents, "postal_town") ||
    readAddressComponent(addressComponents, "sublocality") ||
    readAddressComponent(addressComponents, "administrative_area_level_2");
  const administrativeArea = readAddressComponent(addressComponents, "administrative_area_level_1", true);
  const postalCode = readAddressComponent(addressComponents, "postal_code");
  const countryCode = readAddressComponent(addressComponents, "country", true);
  const latitude = result.geometry?.location?.lat;
  const longitude = result.geometry?.location?.lng;
  const addressLine1 = [streetNumber, route].filter(Boolean).join(" ").trim();

  return normalizeHouseholdLocation({
    addressLine1,
    addressLine2: subpremise,
    administrativeArea,
    countryCode,
    formattedAddress: result.formatted_address ?? "",
    googlePlaceId: result.place_id ?? "",
    latitude: typeof latitude === "number" ? latitude : null,
    locality,
    longitude: typeof longitude === "number" ? longitude : null,
    postalCode,
  });
}

export function buildHouseholdLocationLabel(location: Pick<HouseholdLocation, "formattedAddress" | "locality" | "administrativeArea">) {
  if (location.locality || location.administrativeArea) {
    return [location.locality, location.administrativeArea].filter(Boolean).join(", ");
  }

  return location.formattedAddress;
}

function readAddressComponent(
  components: GeocodingAddressComponent[],
  type: string,
  preferShortName = false,
) {
  const component = components.find((candidate) => Array.isArray(candidate.types) && candidate.types.includes(type));

  if (!component) {
    return "";
  }

  return (preferShortName ? component.short_name : component.long_name) ?? component.long_name ?? "";
}
