import React, {useEffect, useRef, useState} from 'react';
import DPlayer from 'dplayer';
import {getObjectUrlByObjectName} from "@/requests/client/file/oss";

interface VideoPlayerProps {
  name: string;
  cover?: string;
  title?: string;
  autoplay?: boolean;
  theme?: string;
  width?: string | number;
  height?: string | number;
}

const VideoPlayer: React.FC<VideoPlayerProps> = ({
  name,
  cover,
  title,
  autoplay = false,
  theme = '#FADFA3',
  width = '100%',
  height = '500px',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<DPlayer | null>(null);
  const [url, setUrl] = useState<string>("");

  if (name !== undefined) {
    getObjectUrlByObjectName(name).then(res => {
      setUrl(res.data.data.url);
    })
  }
  useEffect(() => {
    if (containerRef.current && !playerRef.current) {
      playerRef.current = new DPlayer({
        container: containerRef.current,
        video: {
          url,
          type: 'auto',
        },
        autoplay,
        theme,
        title,
        width,
        height,
      });
    }

    return () => {
      if (playerRef.current) {
        playerRef.current.destroy();
        playerRef.current = null;
      }
    };
  }, [url, cover, autoplay, theme, title, width, height]);

  return <div ref={containerRef} />;
};

export default VideoPlayer;
