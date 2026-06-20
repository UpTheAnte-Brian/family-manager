type AppIconArtProps = {
  canvasSize: number;
  tileSize: number;
  tileRadius: number;
  fontSize: number;
  shadow?: string;
};

export function AppIconArt({
  canvasSize,
  tileSize,
  tileRadius,
  fontSize,
  shadow,
}: AppIconArtProps) {
  const inset = (canvasSize - tileSize) / 2;
  const tileStyle = {
    alignItems: "center",
    background: "#1f6f8b",
    borderRadius: tileRadius,
    color: "#fffaf2",
    display: "flex",
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize,
    fontWeight: 800,
    height: tileSize,
    justifyContent: "center",
    left: inset,
    letterSpacing: 0,
    position: "absolute" as const,
    top: inset,
    width: tileSize,
    ...(shadow ? { boxShadow: shadow } : {}),
  };

  return (
    <div
      style={{
        alignItems: "center",
        background: "#f7f3ea",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        position: "relative",
        width: "100%",
      }}
    >
      <div style={tileStyle}>FM</div>
    </div>
  );
}
