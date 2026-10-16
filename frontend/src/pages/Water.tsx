import PagePlaceholder from "../components/PagePlaceholder";

export default function Water() {
  return (
    <PagePlaceholder
      title="Water"
      description="Usage and flow analytics with leak detection and repair tracking."
      planned={[
        "Flow vs baseline charts per zone",
        "Leakage events from computer vision (water_leakage)",
        "Estimated liters lost and repair status",
      ]}
    />
  );
}
