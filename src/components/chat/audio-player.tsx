"use client";

import { useRef, useState, useMemo, useCallback } from "react";
import { Play, Pause, Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface AudioPlayerProps {
  src: string;
  /** Drives the accent color — violet only for AI (color = meaning). */
  tone?: "customer" | "merchant" | "ai";
}

const BAR_COUNT = 28;

/** Deterministic pseudo-waveform derived from the URL so it's stable per clip. */
function waveformBars(src: string): number[] {
  let seed = 0;
  for (let i = 0; i < src.length; i++) {
    seed = (seed * 31 + src.charCodeAt(i)) >>> 0;
  }
  const bars: number[] = [];
  for (let i = 0; i < BAR_COUNT; i++) {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    // Bias toward the middle so it reads like a voice envelope (0.35–1.0).
    bars.push(0.35 + (seed % 1000) / 1000 * 0.65);
  }
  return bars;
}

function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

const ACCENT: Record<NonNullable<AudioPlayerProps["tone"]>, string> = {
  customer: "text-blue-500",
  merchant: "text-foreground",
  ai: "text-violet-500",
};

export function AudioPlayer({ src, tone = "customer" }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [errored, setErrored] = useState(false);

  const bars = useMemo(() => waveformBars(src), [src]);
  const progress = duration > 0 ? current / duration : 0;

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => setErrored(true));
    } else {
      audio.pause();
    }
  }, []);

  const seekToBar = useCallback(
    (index: number) => {
      const audio = audioRef.current;
      if (!audio || !Number.isFinite(duration) || duration <= 0) return;
      audio.currentTime = ((index + 0.5) / BAR_COUNT) * duration;
      setCurrent(audio.currentTime);
    },
    [duration]
  );

  if (errored) {
    return (
      <a
        href={src}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-md bg-foreground/5 px-2 py-1.5 text-xs text-foreground hover:bg-foreground/10"
      >
        <Download className="h-4 w-4 shrink-0" />
        <span>Voice message</span>
      </a>
    );
  }

  const accent = ACCENT[tone];

  return (
    <div className="flex w-56 max-w-full items-center gap-2.5 py-0.5">
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrent(0);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onDurationChange={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d)) setDuration(d);
        }}
        onError={() => setErrored(true)}
      />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause voice message" : "Play voice message"}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground/10 transition-colors hover:bg-foreground/15",
          accent
        )}
      >
        {playing ? (
          <Pause className="h-4 w-4 fill-current" />
        ) : (
          <Play className="h-4 w-4 translate-x-px fill-current" />
        )}
      </button>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        {/* Waveform / scrubber */}
        <div className="flex h-6 items-center gap-[2px]">
          {bars.map((h, i) => {
            const filled = i / BAR_COUNT <= progress;
            return (
              <button
                type="button"
                key={i}
                onClick={() => seekToBar(i)}
                aria-label={`Seek to ${Math.round((i / BAR_COUNT) * 100)}%`}
                className="group flex h-full flex-1 items-center"
              >
                <span
                  className={cn(
                    "w-full rounded-full transition-colors",
                    filled ? accent : "text-foreground/25"
                  )}
                  style={{
                    height: `${Math.round(h * 100)}%`,
                    backgroundColor: "currentColor",
                  }}
                />
              </button>
            );
          })}
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {formatDuration(playing || current > 0 ? current : duration)}
        </span>
      </div>
    </div>
  );
}
