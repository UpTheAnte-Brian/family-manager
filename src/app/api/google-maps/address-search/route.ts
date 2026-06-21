import { requireAuthenticatedRequestUser } from "@/lib/supabase/request-auth";
import type { AddressSuggestion } from "@/lib/households/location";

export const dynamic = "force-dynamic";

type GoogleAutocompleteResponse = {
  suggestions?: Array<{
    placePrediction?: {
      placeId?: string;
      structuredFormat?: {
        mainText?: {
          text?: string;
        };
        secondaryText?: {
          text?: string;
        };
      };
      text?: {
        text?: string;
      };
    };
  }>;
};

type GooglePlacePrediction = NonNullable<
  NonNullable<GoogleAutocompleteResponse["suggestions"]>[number]["placePrediction"]
>;

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
  const query = url.searchParams.get("q")?.trim() ?? "";

  if (query.length < 3) {
    return Response.json(
      {
        error: "Enter at least three characters before searching for an address.",
      },
      { status: 400 },
    );
  }

  try {
    const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
      body: JSON.stringify({
        input: query,
      }),
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "suggestions.placePrediction.placeId,suggestions.placePrediction.structuredFormat.mainText.text,suggestions.placePrediction.structuredFormat.secondaryText.text,suggestions.placePrediction.text.text",
      },
      method: "POST",
    });
    const body = (await response.json()) as GoogleAutocompleteResponse | { error?: { message?: string } };

    if (!response.ok) {
      return Response.json(
        {
          error: readGoogleApiError(body, "Google Maps address lookup failed."),
        },
        { status: 502 },
      );
    }

    const suggestions = (body as GoogleAutocompleteResponse).suggestions
      ?.map((suggestion) => formatAddressSuggestion(suggestion.placePrediction))
      .filter((suggestion): suggestion is AddressSuggestion => suggestion !== null) ?? [];

    return Response.json({
      suggestions,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Google Maps address lookup failed.",
      },
      { status: 502 },
    );
  }
}

function formatAddressSuggestion(prediction: GooglePlacePrediction | undefined) {
  const placeId = prediction?.placeId?.trim();
  const fullText = prediction?.text?.text?.trim();

  if (!placeId || !fullText) {
    return null;
  }

  return {
    fullText,
    placeId,
    primaryText: prediction?.structuredFormat?.mainText?.text?.trim() ?? fullText,
    secondaryText: prediction?.structuredFormat?.secondaryText?.text?.trim() ?? "",
  };
}

function readGoogleApiError(body: unknown, fallbackMessage: string) {
  if (body && typeof body === "object" && "error" in body) {
    const errorBody = body as { error?: { message?: unknown } };

    if (typeof errorBody.error?.message === "string" && errorBody.error.message) {
      return errorBody.error.message;
    }
  }

  return fallbackMessage;
}
