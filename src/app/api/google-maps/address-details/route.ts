import { normalizeGeocodingResult } from "@/lib/households/location";
import { requireAuthenticatedRequestUser } from "@/lib/supabase/request-auth";

export const dynamic = "force-dynamic";

type GoogleGeocodingResponse = {
  results?: Array<{
    address_components?: Array<{
      long_name?: string;
      short_name?: string;
      types?: string[];
    }>;
    formatted_address?: string;
    geometry?: {
      location?: {
        lat?: number;
        lng?: number;
      };
    };
    place_id?: string;
  }>;
  status?: string;
  error_message?: string;
};

export async function GET(request: Request) {
  const authenticatedUser = await requireAuthenticatedRequestUser(request);

  if (authenticatedUser instanceof Response) {
    return authenticatedUser;
  }

  const apiKey = process.env.GOOGLE_MAPS_SERVER_API_KEY;

  if (!apiKey) {
    return Response.json(
      {
        error: "Google Maps server lookup is not configured.",
      },
      { status: 503 },
    );
  }

  const url = new URL(request.url);
  const placeId = url.searchParams.get("placeId")?.trim() ?? "";

  if (!placeId) {
    return Response.json(
      {
        error: "Select an address before saving it.",
      },
      { status: 400 },
    );
  }

  const geocodeUrl = new URL("https://maps.googleapis.com/maps/api/geocode/json");
  geocodeUrl.searchParams.set("place_id", placeId);
  geocodeUrl.searchParams.set("key", apiKey);

  try {
    const response = await fetch(geocodeUrl.toString());
    const body = (await response.json()) as GoogleGeocodingResponse;

    if (!response.ok || body.status !== "OK") {
      return Response.json(
        {
          error: body.error_message || body.status || "Google Maps address details lookup failed.",
        },
        { status: 502 },
      );
    }

    const result = body.results?.[0];

    if (!result) {
      return Response.json(
        {
          error: "Google Maps did not return a matching address.",
        },
        { status: 404 },
      );
    }

    return Response.json({
      location: normalizeGeocodingResult(result),
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Google Maps address details lookup failed.",
      },
      { status: 502 },
    );
  }
}
