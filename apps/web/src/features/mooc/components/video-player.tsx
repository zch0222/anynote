"use client";

import { useEffect, useRef, useState } from "react";

export type VideoPlayerProps = {
  url: string;
  title?: string | undefined;
  startTime?: number | undefined;
  /** 变化时在原播放器上 seek，不销毁重建；不传时保持按 startTime 重建的旧行为。 */
  navigationKey?: number | undefined;
};

/**
 * 视频播放器：DPlayer 懒加载（按里程碑约定，不进主包）。
 * 播放地址是 OBS 临时签名 URL，过期后重新进入页面会经 useObjectUrlQuery 换新。
 */
export function VideoPlayer({ url, title, startTime = 0, navigationKey }: VideoPlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const fallbackRef = useRef<HTMLVideoElement>(null);
  const playerRef = useRef<import("dplayer").default | null>(null);
  const readyRef = useRef(false);
  const startTimeRef = useRef(startTime);
  startTimeRef.current = startTime;
  const [failed, setFailed] = useState(false);

  // 不传 navigationKey 时把 startTime 也当作重建键，保持完整页面的旧行为
  const recreateKey =
    navigationKey === undefined
      ? `${url}\u0000${title ?? ""}\u0000${startTime}`
      : `${url}\u0000${title ?? ""}`;

  // biome-ignore lint/correctness/useExhaustiveDependencies: 未传 navigationKey 时用 recreateKey 触发销毁重建
  useEffect(() => {
    const element = containerRef.current;
    if (!element) {
      return;
    }
    setFailed(false);
    readyRef.current = false;
    let cancelled = false;
    void import("dplayer").then(({ default: DPlayer }) => {
      if (cancelled || !containerRef.current) {
        return;
      }
      try {
        const player = new DPlayer({
          container: containerRef.current,
          video: { url, ...(title ? { name: title } : {}) },
        });
        playerRef.current = player;
        player.on("loadedmetadata", () => {
          readyRef.current = true;
          const target = startTimeRef.current;
          if (!Number.isFinite(target) || target <= 0) return;
          player.seek(target < player.video.duration ? target : 0);
        });
      } catch (error) {
        console.error(error);
        setFailed(true);
      }
    });
    return () => {
      cancelled = true;
      readyRef.current = false;
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [recreateKey, url, title]);

  useEffect(() => {
    if (navigationKey === undefined) return;
    const player = playerRef.current;
    if (!player || !readyRef.current) return;
    const target = startTime;
    if (!Number.isFinite(target) || target <= 0) return;
    player.seek(target < player.video.duration ? target : 0);
  }, [navigationKey, startTime]);

  useEffect(() => {
    if (navigationKey === undefined) return;
    const video = fallbackRef.current;
    if (!video || !Number.isFinite(startTime) || startTime < 0) return;
    video.currentTime = startTime < video.duration ? startTime : 0;
  }, [navigationKey, startTime]);

  if (failed) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: 兜底播放器，源视频没有字幕轨
      <video
        ref={fallbackRef}
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
