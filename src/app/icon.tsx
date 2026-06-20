import { ImageResponse } from "next/og";
import { AppIconArt } from "./app-icon-art";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <AppIconArt
      canvasSize={size.width}
      tileSize={360}
      tileRadius={112}
      fontSize={160}
      shadow="0 28px 70px rgba(18, 52, 63, 0.18)"
    />,
    size,
  );
}
