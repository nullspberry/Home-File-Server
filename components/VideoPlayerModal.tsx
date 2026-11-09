'use client';

import React, { useEffect, useRef } from 'react';
import { X, Download, Subtitles } from 'lucide-react';

interface SubtitleFile {
  name: string;
  path: string;
}

interface VideoPlayerModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  streamUrl: string;
  downloadUrl: string;
  subtitles: SubtitleFile[];
  libraryId: string;
}

export function VideoPlayerModal({
  isOpen,
  onClose,
  title,
  streamUrl,
  downloadUrl,
  subtitles,
  libraryId,
}: VideoPlayerModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (isOpen) {
      video.play().catch(() => {});
    } else {
      video.pause();
      video.removeAttribute('src');
      video.load();
    }
  }, [isOpen, streamUrl]);

  if (!isOpen) return null;

  // Find best matching subtitle
  const baseName = title.replace(/\.[^/.]+$/, '').toLowerCase();
  const matchedSub =
    subtitles.find(
      (s) =>
        s.name.toLowerCase().startsWith(baseName) ||
        s.name.toLowerCase().includes('.en.') ||
        s.name.toLowerCase().includes('english'),
    ) || subtitles[0];

  const subUrl = matchedSub
    ? `/api/subtitle/${libraryId}/${matchedSub.path
        .split('/')
        .map(encodeURIComponent)
        .join('/')}`
    : null;

  return (
    <div className="modal">
      <div className="modal-overlay" onClick={onClose} />
      <div className="player-dialog">
        <div className="player-header">
          <h3 className="font-semibold text-base truncate max-w-[70%]">{title}</h3>
          <div className="player-header-actions">
            <a href={downloadUrl} download className="btn btn-outline btn-sm">
              <Download className="w-3.5 h-3.5" />
              Download
            </a>
            <button className="btn-close" onClick={onClose}>
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="video-container">
          <video
            ref={videoRef}
            src={streamUrl}
            controls
            playsInline
            preload="metadata"
            crossOrigin="anonymous"
          >
            {subUrl && (
              <track
                kind="subtitles"
                label={matchedSub?.name || 'Subtitles'}
                src={subUrl}
                srcLang="en"
                default
              />
            )}
            <p>Your browser does not support HTML5 video.</p>
          </video>
        </div>

        {matchedSub && (
          <div className="player-footer flex items-center gap-2 text-xs text-slate-400">
            <Subtitles className="w-3.5 h-3.5 text-sky-400" />
            <span>Subtitle: {matchedSub.name}</span>
          </div>
        )}
      </div>
    </div>
  );
}

