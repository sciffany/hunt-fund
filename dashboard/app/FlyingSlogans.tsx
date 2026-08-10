"use client";

import type { CSSProperties } from "react";

const SLOGANS = [
  "sleep or money no keep",
  "take a nap or pay the app",
  "dont stay up or be bankrupt",
  "go to bed or be in the red",
  "hit the hay or time to pay",
  "freeze or cash please",
  "be like stone or take out loan",
  "be still or else got bill",
  "snore or be poor",
  "drowse or paynows",
  "jive or bribe",
  "sashay or pay",
  "activity or penalty",
  "runtime or give dime",
  "ramble or give nickel",
  "fly or supply",
  "dash or cash",
  "run or fund",
  "step or debt",
  "walk or bucks",
] as const;

type Side = "left" | "right" | "top" | "bottom";

/** Park slogans in the page margins so they clear the centered dashboard. */
function layoutFor(i: number, total: number) {
  // Cycle through margin bands: left, right, top, bottom.
  const side: Side = (["left", "right", "top", "bottom"] as const)[i % 4];
  const bandIndex = Math.floor(i / 4);
  const bandCount = Math.ceil(total / 4);

  const size = 15 + ((i * 7) % 11);
  const rotate = ((i * 23) % 36) - 18;
  const duration = 18 + ((i * 5) % 22);
  const delay = -((i * 3.7) % duration);
  const driftX = 28 + ((i * 13) % 56);
  const driftY = 20 + ((i * 11) % 48);
  const opacity = 0.28 + (i % 5) * 0.04;
  const color =
    i % 2 === 0
      ? `hsla(${340 + (i % 3) * 8}, 55%, 38%, ${opacity})`
      : `hsla(${168 + (i % 4) * 10}, 40%, 32%, ${opacity})`;

  // Spread along the long axis of each margin strip.
  const along = 6 + (bandIndex / Math.max(bandCount - 1, 1)) * 82 + ((i * 9) % 8);
  // How far into the gutter from the edge (keep clear of the 900px column).
  const inset = 1.5 + ((i * 5) % 7);

  const pos: CSSProperties = {
    fontSize: `${size}px`,
    ["--rotate" as string]: `${rotate}deg`,
    ["--duration" as string]: `${duration}s`,
    ["--delay" as string]: `${delay}s`,
    ["--drift-x" as string]: `${driftX * (side === "right" || side === "bottom" ? -1 : 1)}px`,
    ["--drift-y" as string]: `${driftY * (side === "top" || side === "left" ? 1 : -1)}px`,
    color,
  };

  if (side === "left") {
    pos.top = `${along}%`;
    pos.left = `${inset}%`;
    pos.right = "auto";
  } else if (side === "right") {
    pos.top = `${(along + 11) % 90}%`;
    pos.right = `${inset}%`;
    pos.left = "auto";
  } else if (side === "top") {
    pos.top = `${2 + (i % 3) * 3}%`;
    pos.left = `${12 + (along % 70)}%`;
  } else {
    pos.bottom = `${2 + (i % 3) * 3}%`;
    pos.top = "auto";
    pos.left = `${8 + (along % 72)}%`;
  }

  return pos;
}

export default function FlyingSlogans() {
  return (
    <div className="flying-slogans" aria-hidden="true">
      {SLOGANS.map((text, i) => (
        <span
          key={text}
          className="flying-slogan"
          style={layoutFor(i, SLOGANS.length)}
        >
          {text}
        </span>
      ))}
    </div>
  );
}
