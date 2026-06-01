import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180,
};

export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f7f3ea",
          color: "#fffaf2",
          display: "flex",
          fontFamily: "Arial, Helvetica, sans-serif",
          height: "100%",
          justifyContent: "center",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#1f6f8b",
            borderRadius: 40,
            display: "flex",
            fontSize: 54,
            fontWeight: 800,
            height: 132,
            justifyContent: "center",
            letterSpacing: 0,
            width: 132,
          }}
        >
          FM
        </div>
      </div>
    ),
    size,
  );
}
