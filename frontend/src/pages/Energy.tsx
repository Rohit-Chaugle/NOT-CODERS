import PagePlaceholder from "../components/PagePlaceholder";

export default function Energy() {
  return (
    <PagePlaceholder
      title="Energy"
      description="Consumption trends, wastage detections and AI savings recommendations."
      planned={[
        "Zone and building level energy time series",
        "Wastage detectors: unoccupied lights, HVAC after hours",
        "Estimated kWh and CO2e savings per recommendation",
      ]}
    />
  );
}
