import PagePlaceholder from "../components/PagePlaceholder";

export default function Waste() {
  return (
    <PagePlaceholder
      title="Waste"
      description="Bin fill levels, accumulation detections and collection planning."
      planned={[
        "waste_bin sensor fill-level gauges",
        "Waste accumulation / bin overflow vision events",
        "Collection route optimization suggestions",
      ]}
    />
  );
}
