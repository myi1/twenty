import { useCallback, useEffect, useRef, useState } from 'react';

// Minimal MediaRecorder wrapper for the composer's mic button. Records to
// whatever mime type the browser's MediaRecorder actually supports (Chrome:
// audio/webm;codecs=opus — wa-service/Evolution already handles ogg/opus
// voice notes, webm/opus decodes to the same codec family so this rides the
// EXISTING audio pipeline with no server changes). Stopping yields a single
// File the caller uploads via uploadWaMedia + sendWaMedia (kind AUDIO).
//
// Never fabricates a recording: if getUserMedia is denied/unavailable, `error`
// is set and the composer shows an honest reason instead of a silent no-op.

type RecorderState = 'idle' | 'recording' | 'error';

const PICK_MIME_TYPE = (): string => {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4'];
  for (const type of candidates) {
    if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(type)) {
      return type;
    }
  }
  return '';
};

export const useVoiceRecorder = () => {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef<number>(0);
  const tickRef = useRef<number | null>(null);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (tickRef.current !== null) {
      window.clearInterval(tickRef.current);
      tickRef.current = null;
    }
  }, []);

  useEffect(() => stopStream, [stopStream]);

  const start = useCallback(async (): Promise<void> => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('This browser can’t record audio.');
      setState('error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = PICK_MIME_TYPE();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };
      mediaRecorderRef.current = recorder;
      recorder.start();
      startedAtRef.current = Date.now();
      setElapsedMs(0);
      tickRef.current = window.setInterval(() => {
        setElapsedMs(Date.now() - startedAtRef.current);
      }, 250);
      setState('recording');
    } catch {
      setError('Microphone access was blocked or unavailable.');
      setState('error');
    }
  }, []);

  const stop = useCallback((): Promise<File | null> => {
    return new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;
      if (!recorder || recorder.state === 'inactive') {
        stopStream();
        setState('idle');
        resolve(null);
        return;
      }
      recorder.onstop = () => {
        const mimeType = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mimeType });
        chunksRef.current = [];
        stopStream();
        setState('idle');
        const extension = mimeType.includes('ogg') ? 'ogg' : mimeType.includes('mp4') ? 'm4a' : 'webm';
        resolve(new File([blob], `voice-note.${extension}`, { type: mimeType }));
      };
      recorder.stop();
    });
  }, [stopStream]);

  const cancel = useCallback((): void => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = null;
      recorder.stop();
    }
    chunksRef.current = [];
    stopStream();
    setState('idle');
  }, [stopStream]);

  return { state, elapsedMs, error, start, stop, cancel };
};
