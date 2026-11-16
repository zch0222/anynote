"use client";

import { useEffect, useRef, useState } from "react";

export type VideoPlayerProps = {
  url: string;
  title?: string | undefined;
  startTime?: number | undefined;
};

/**
 * 视频播放器：DPlayer 懒加载（按里程碑约定，不进主包）。
 * 播放地址是 OBS 临时签名 URL，过期后重新进入页面会经 useObjectUrlQuery 换新。
 */
export function VideoPlayer({ url, title, startTime = 0 }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    setFailed(false);
    let player: import("dplayer").default | undefined;
    let cancelled = false;
    void import("dplayer").then(({ default: DPlayer }) => {
      if (cancelled || !containerRef.current) {
        return;
      }
      try {
        player = new DPlayer({
          container: containerRef.current,
          video: { url, ...(title ? { name: title } : {}) },
        });
        player.on("loadedmetadata", () => {
          if (!player || !Number.isFinite(startTime) || startTime <= 0) return;
          player.seek(startTime < player.video.duration ? startTime : 0);
        });
      } catch (error) {
        console.error(error);
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      player?.destroy();
    };
  }, [url, title, startTime]);

  if (failed) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: 兜底播放器，源视频没有字幕轨
      <video
        controls
        src={url}
        className="aspect-video w-full rounded-lg bg-black"
        data-testid="video-fallback"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          video.currentTime =
            Number.isFinite(startTime) && startTime >= 0 && startTime < video.duration
              ? startTime
              : 0;
        }}
      >
        您的浏览器不支持视频播放
      </video>
    );
  }

  return (
    <div
      ref={containerRef}
      className="aspect-video w-full overflow-hidden rounded-lg bg-black"
      data-testid="video-player"
    />
  );
}
