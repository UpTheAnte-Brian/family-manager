import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};

export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          alignItems: "center",
          background: "#f7f3ea",
          color: "#12343f",
          display: "flex",
          fontFamily: "Arial, Helvetica, sans-serif",
          height: "100%",
          justifyContent: "center",
          position: "relative",
          width: "100%",
        }}
      >
        <div
          style={{
            alignItems: "center",
            background: "#1f6f8b",
            borderRadius: 112,
            boxShadow: "0 28px 70px rgba(18, 52, 63, 0.18)",
            color: "#fffaf2",
            display: "flex",
            fontSize: 160,
            fontWeight: 800,
            height: 360,
            justifyContent: "center",
            letterSpacing: 0,
            width: 360,
          }}
        >
          FM
        </div>
        <div
          style={{
            background: "#f2b84b",
            borderRadius: 999,
            bottom: 88,
            height: 54,
            position: "absolute",
            right: 92,
            width: 54,
          }}
        />
      </div>
    ),
    size,
  );
}
