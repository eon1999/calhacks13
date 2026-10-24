"use client";

import { useCallback, useRef, useState } from "react";

export interface Recorder {
  recording: boolean;
  start: () => Promise<void>;
  /** Stops recording and resolves with the captured audio (null if nothing captured). */
  stop: () => Promise<Blob | null>;
}

/** Microphone capture via MediaRecorder (webm/opus in Chrome, mp4 in Safari). */
export function useRecorder(): Recorder {
  const [recording, setRecording] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
    const recorder = new MediaRecorder(stream);
    chunksRef.current = [];
    recorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunksRef.current = [...chunksRef.current, e.data];
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
  }, []);

  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const recorder = recorderRef.current;
        if (!recorder || recorder.state === "inactive") {
          resolve(null);
          return;
        }
        recorder.onstop = () => {
          recorder.stream.getTracks().forEach((t) => t.stop());
          recorderRef.current = null;
          setRecording(false);
          const chunks = chunksRef.current;
          resolve(chunks.length ? new Blob(chunks, { type: recorder.mimeType }) : null);
        };
        recorder.stop();
      }),
    [],
  );

  return { recording, start, stop };
}
