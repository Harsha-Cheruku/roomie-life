import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  onRecordingStateChange?: (isRecording: boolean) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onRecordingComplete, onRecordingStateChange, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Pick a supported mimeType (iOS Safari doesn't support webm)
      const candidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
      ];
      const mimeType = candidates.find((t) =>
        typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported?.(t)
      ) || '';
      // Low bitrate (~24 kbps) is plenty for voice and shrinks upload ~4-8x
      const recorderOptions: MediaRecorderOptions = {
        audioBitsPerSecond: 24000,
        ...(mimeType ? { mimeType } : {}),
      };
      let mediaRecorder: MediaRecorder;
      try {
        mediaRecorder = new MediaRecorder(stream, recorderOptions);
      } catch {
        // Some browsers reject custom bitrate — fall back to defaults
        mediaRecorder = mimeType
          ? new MediaRecorder(stream, { mimeType })
          : new MediaRecorder(stream);
      }

      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blobType = mediaRecorder.mimeType || mimeType || 'audio/webm';
        const audioBlob = new Blob(chunksRef.current, { type: blobType });
        const recordingDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        onRecordingComplete(audioBlob, recordingDuration);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      // Emit chunks every 1s so we can stream them progressively if needed
      mediaRecorder.start(1000);
      startTimeRef.current = Date.now();
      setIsRecording(true);
      onRecordingStateChange?.(true);
      setDuration(0);

      // Update duration every second
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
      // Surface a user-visible error so the UI doesn't silently do nothing
      try {
        const { toast } = await import('sonner');
        toast.error('Microphone access denied or unavailable');
      } catch {
        // ignore
      }
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      onRecordingStateChange?.(false);
      
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  if (isRecording) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 px-3 py-2 bg-destructive/10 rounded-full animate-pulse">
          <div className="w-2 h-2 bg-destructive rounded-full" />
          <span className="text-sm font-medium text-destructive">{formatDuration(duration)}</span>
        </div>
        <Button
          type="button"
          size="icon"
          variant="destructive"
          className="h-12 w-12 rounded-xl"
          onClick={stopRecording}
        >
          <Square className="w-5 h-5" />
        </Button>
      </div>
    );
  }

  return (
    <Button
      type="button"
      size="icon"
      variant="ghost"
      className={cn("h-12 w-12 rounded-xl", disabled && "opacity-50")}
      onClick={startRecording}
      disabled={disabled}
    >
      <Mic className="w-5 h-5" />
    </Button>
  );
}