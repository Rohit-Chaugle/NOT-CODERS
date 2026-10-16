import { useState } from "react";
import { triggerDemoAnomaly } from "../../api/twin";
import { useToast } from "../ui/Toast";
import { SparkIcon } from "../ui/Icons";

const DEMO_STEPS = [
  {
    step: 1,
    title: "Water Leak in Student Hostel",
    desc: "Simulate a severe constant 18.4 L/min water leak in the Hostel Mess.",
    icon: "💧",
  },
  {
    step: 2,
    title: "Energy Spike in Science Labs",
    desc: "Simulate an unoccupied 4.8 kW equipment spike in the Physics Lab.",
    icon: "⚡",
  },
  {
    step: 3,
    title: "Waste Overflow at Canteen",
    desc: "Simulate 98.5% bin capacity detected by CV and sensors in the Dining Hall.",
    icon: "♻️",
  },
];

export default function DemoModeButton() {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [running, setRunning] = useState(false);
  const { addToast } = useToast();

  const handleRunDemo = async () => {
    if (running) return;

    setRunning(true);
    const demoInfo = DEMO_STEPS[currentStepIndex];

    try {
      const res = await triggerDemoAnomaly(demoInfo.step);
      addToast({
        type: demoInfo.step === 1 ? "alert" : "warning",
        title: `Demo Triggered: ${res.title}`,
        message: `${res.issue.title} broadcast to WebSocket feed, digital twin, and Copilot.`,
        duration: 5000,
      });

      // Advance to next step for subsequent click
      setCurrentStepIndex((prev) => (prev + 1) % DEMO_STEPS.length);
    } catch (e: any) {
      addToast({
        type: "alert",
        title: "Demo Injection Error",
        message: e.message || "Could not trigger demo anomaly.",
      });
    } finally {
      setRunning(false);
    }
  };

  const nextDemo = DEMO_STEPS[currentStepIndex];

  return (
    <button
      onClick={handleRunDemo}
      disabled={running}
      title={`Trigger scripted anomaly: ${nextDemo.title}`}
      className="label-mono flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-200 border border-mint/40 bg-mint/10 text-mint hover:bg-mint/20 hover:border-mint shadow-[0_0_12px_rgba(92,255,177,0.25)] cursor-pointer disabled:opacity-50"
    >
      <span className="text-sm">{nextDemo.icon}</span>
      <span className="font-bold flex items-center gap-1.5">
        <SparkIcon size={12} />
        Demo Mode: Step {nextDemo.step}/3
      </span>
      {running && (
        <span className="w-2.5 h-2.5 border-2 border-mint border-t-transparent rounded-full animate-spin" />
      )}
    </button>
  );
}
