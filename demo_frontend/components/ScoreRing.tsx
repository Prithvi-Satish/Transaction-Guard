"use client";

import { useEffect, useState } from "react";

interface ScoreRingProps {
  score: number;
  size?: number;
}

const scoreLevel = (score: number) => {
  if (score >= 70) return "high";
  if (score >= 40) return "medium";
  return "low";
};

const scoreColor = (score: number) => {
  if (score >= 70) return "#c0293b";
  if (score >= 40) return "#d4860a";
  return "#1a8a76";
};

export function ScoreRing({ score, size = 72 }: ScoreRingProps) {
  const [animated, setAnimated] = useState(false);
  const radius = (size - 10) / 2;
  const circumference = 2 * Math.PI * radius;
  const level = scoreLevel(score);
  const color = scoreColor(score);
  const offset = animated ? circumference - (score / 100) * circumference : circumference;

  useEffect(() => {
    const t = setTimeout(() => setAnimated(true), 80);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="score-ring-wrap">
      <div className="score-ring" style={{ width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
          <circle
            className="score-ring-track"
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--line)"
            strokeWidth={5}
          />
          <circle
            className={`score-ring-fill ${level}`}
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={5}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.8s cubic-bezier(0.4,0,0.2,1)" }}
          />
        </svg>
        <div className="score-ring-number" style={{ fontSize: size >= 80 ? "1rem" : "0.85rem", color }}>
          {score}
        </div>
      </div>
      <div className="score-ring-info">
        <div className="score-ring-label">Confidence</div>
        <div className="score-ring-value" style={{ color }}>
          {score}<span style={{ fontSize: "0.9rem", color: "var(--muted)", fontWeight: 500 }}>/100</span>
        </div>
        <div style={{ fontSize: "0.72rem", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color }}>
          {level.charAt(0).toUpperCase() + level.slice(1)} Risk
        </div>
      </div>
    </div>
  );
}
