import type { StaticImageData } from "next/image";

import type { BathroomStyleId } from "@/lib/homeowner-try/bathroom-styles";

import beforeMain from "../../../Images/before_main.jpg";
import afterBold from "../../../Images/after_bold.png";
import afterClean from "../../../Images/after_clean.png";
import afterLuxury from "../../../Images/after_luxury.png";
import afterSpa from "../../../Images/after_spa.png";
import afterWarm from "../../../Images/after_warm.png";

export type LandingDemoStyleOption = {
  id: BathroomStyleId;
  pill: string;
  after: StaticImageData;
};

/** Shared marketing before + style-specific after renders for the hero interactive demo. */
export const LANDING_DEMO_BEFORE = beforeMain;

export const LANDING_DEMO_STYLE_OPTIONS: LandingDemoStyleOption[] = [
  { id: "spa_retreat", pill: "Spa", after: afterSpa },
  { id: "clean_refresh", pill: "Clean", after: afterClean },
  { id: "luxury_escape", pill: "Luxury", after: afterLuxury },
  { id: "bold_modern", pill: "Bold", after: afterBold },
  { id: "warm_minimalist", pill: "Warm", after: afterWarm },
];
