import { useEffect, useState } from "react";

type StreamingTextProps = {
  text: string;
  speed?: number; // ms per chunk
  chunkSize?: number;
  className?: string;
  onComplete?: () => void;
  showCursor?: boolean;
};

/**
 * Streaming-style typewriter effect that reveals text smoothly.
 */
export default function StreamingText({
  text,
  speed = 18,
  chunkSize = 2,
  className = "",
  onComplete,
  showCursor = true,
}: StreamingTextProps) {
  const [displayedLength, setDisplayedLength] = useState(0);

  useEffect(() => {
    setDisplayedLength(0);
    if (!text) return;

    let index = 0;
    const interval = setInterval(() => {
      index += chunkSize;
      if (index >= text.length) {
        setDisplayedLength(text.length);
        clearInterval(interval);
        if (onComplete) onComplete();
      } else {
        setDisplayedLength(index);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed, chunkSize, onComplete]);

  const isDone = displayedLength >= text.length;

  return (
    <span className={className}>
      {text.slice(0, displayedLength)}
      {showCursor && !isDone && (
        <span className="inline-block w-1.5 h-3.5 ml-0.5 bg-mint animate-pulse align-middle rounded-sm shadow-[0_0_8px_#5cffb1]" />
      )}
    </span>
  );
}
