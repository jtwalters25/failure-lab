"use client";

import { useState } from "react";
import { Simulator } from "@/components/Simulator";
import { RealOutages, type Replay } from "@/components/RealOutages";

export function Lab() {
  const [replay, setReplay] = useState<Replay | null>(null);

  function start(r: Replay | null) {
    setReplay(r);
    document.getElementById("simulator")?.scrollIntoView();
  }

  return (
    <>
      {replay && (
        <div className="replay" role="status">
          <span>
            Replaying <strong>{replay.label}</strong>: {replay.minutes} real minutes as {replay.minutes} simulated seconds.
          </span>
          <button onClick={() => start(null)}>Back to the 10 second outage</button>
        </div>
      )}
      <Simulator key={replay?.id ?? "default"} outageSeconds={replay?.minutes} />
      <RealOutages onReplay={start} />
    </>
  );
}
