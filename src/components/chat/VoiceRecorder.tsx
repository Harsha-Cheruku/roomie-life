import { useState, useRef } from "react";
import { Mic, Square, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface VoiceRecorderProps {
  onRecordingComplete: (audioBlob: Blob, duration: number) => void;
  disabled?: boolean;
}

export function VoiceRecorder({ onRecordingComplete, disabled }: VoiceRecorderProps) {
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const startTimeRef = useRef<number>(0);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        const recordingDuration = Math.floor((Date.now() - startTimeRef.current) / 1000);
        onRecordingComplete(audioBlob, recordingDuration);
        
        // Stop all tracks
        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorder.start();
      startTimeRef.current = Date.now();
      setIsRecording(true);
      setDuration(0);

      // Update duration every second
      timerRef.current = setInterval(() => {
        setDuration(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);
    } catch (error) {
      console.error('Error accessing microphone:', error);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
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