import { Droplet, MountainSnow, Snowflake, Wind } from "lucide-react";

// Reward tiers by gallon balance, shown as the badge under the customer's avatar.

export const TIERS = [
  { name: "Splash", min: 0, max: 199, color: "#7dd3fc", icon: Droplet },
  { name: "Frost", min: 200, max: 499, color: "#38bdf8", icon: Snowflake },
  { name: "Glacier", min: 500, max: 999, color: "#0ea5e9", icon: MountainSnow },
  { name: "Blizzard", min: 1000, max: Infinity, color: "#f472b6", icon: Wind },
];

export function getTier(pts) {
  return TIERS.find((t) => pts >= t.min && pts <= t.max) || TIERS[0];
}
