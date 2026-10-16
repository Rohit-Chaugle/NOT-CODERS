import PagePlaceholder from "../components/PagePlaceholder";

export default function Settings() {
  return (
    <PagePlaceholder
      title="Settings"
      description="Manage sensors, cameras and the AI configuration."
      planned={[
        "CRUD for buildings, zones, sensors and cameras",
        "Detection thresholds per resource type",
        "GenAI provider / model configuration",
      ]}
    />
  );
}
