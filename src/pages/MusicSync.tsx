import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { 
  Play, Pause, SkipBack, SkipForward, Volume2, VolumeX,
  Music, Upload, Shuffle, Repeat, Heart, Headphones
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { YouTubeSync } from "@/components/music/YouTubeSync";

interface Track {
  id: string;
  name: string;
  artist: string;
  duration: number;
  file?: File;
  url?: string;
}

export default function MusicSync() {
  const navigate = useNavigate();
  const { currentRoom, isSoloMode } = useAuth();
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentTrack, setCurrentTrack] = useState<Track | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [isShuffled, setIsShuffled] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'none' | 'one' | 'all'>('none');
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [activeTab, setActiveTab] = useState<'youtube' | 'local'>('youtube');

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const updateTime = () => setCurrentTime(audio.currentTime);
    const updateDuration = () => setDuration(audio.duration);
    const handleEnded = () => {
      if (repeatMode === 'one') { audio.currentTime = 0; audio.play(); }
      else if (repeatMode === 'all' || tracks.length > 1) { playNext(); }
      else { setIsPlaying(false); }
    };
    audio.addEventListener('timeupdate', updateTime);
    audio.addEventListener('loadedmetadata', updateDuration);
    audio.addEventListener('ended', handleEnded);
    return () => {
      audio.removeEventListener('timeupdate', updateTime);
      audio.removeEventListener('loadedmetadata', updateDuration);
      audio.removeEventListener('ended', handleEnded);
    };
  }, [repeatMode, tracks]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    const newTracks: Track[] = [];
    Array.from(files).forEach((file) => {
      if (file.type.startsWith('audio/')) {
        newTracks.push({
          id: `${Date.now()}-${Math.random()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Local File',
          duration: 0,
          file,
          url: URL.createObjectURL(file),
        });
      }
    });
    if (newTracks.length > 0) {
      setTracks(prev => [...prev, ...newTracks]);
      toast.success(`Added ${newTracks.length} track(s)`);
      if (!currentTrack) setCurrentTrack(newTracks[0]);
    }
  };

  const playTrack = (track: Track) => {
    if (currentTrack?.id === track.id) { togglePlay(); return; }
    setCurrentTrack(track);
    if (track.url) {
      setIsPlaying(true);
      setTimeout(() => audioRef.current?.play(), 100);
    }
  };

  const togglePlay = () => {
    if (!currentTrack) return;
    if (isPlaying) audioRef.current?.pause(); else audioRef.current?.play();
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    if (tracks.length === 0) return;
    const idx = tracks.findIndex(t => t.id === currentTrack?.id);
    const next = isShuffled ? Math.floor(Math.random() * tracks.length) : (idx + 1) % tracks.length;
    playTrack(tracks[next]);
  };

  const playPrev = () => {
    if (tracks.length === 0) return;
    if (currentTime > 3 && audioRef.current) { audioRef.current.currentTime = 0; return; }
    const idx = tracks.findIndex(t => t.id === currentTrack?.id);
    playTrack(tracks[idx <= 0 ? tracks.length - 1 : idx - 1]);
  };

  const seekTo = (value: number[]) => {
    if (audioRef.current) audioRef.current.currentTime = value[0];
    setCurrentTime(value[0]);
  };

  const formatTime = (s: number) => `${Math.floor(s / 60)}:${Math.floor(s % 60).toString().padStart(2, '0')}`;

  const toggleFavorite = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleNavChange = (tab: string) => {
    const routes: Record<string, string> = { home: '/', tasks: '/tasks', expenses: '/expenses', storage: '/storage', chat: '/chat' };
    navigate(routes[tab] || '/');
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <TopBar title="Music Sync" showBack onBack={() => navigate('/')} hint="Listen together with your roommates 🎵" />
      <audio ref={audioRef} src={currentTrack?.url} />
      <input ref={fileInputRef} type="file" accept="audio/*" multiple className="hidden" onChange={handleFileUpload} />

      <div className="p-4 max-w-2xl mx-auto space-y-5">
        {/* Tab Switcher */}
        <div className="flex bg-muted rounded-2xl p-1 gap-1">
          <button
            onClick={() => setActiveTab('youtube')}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
              activeTab === 'youtube' ? "bg-destructive text-destructive-foreground shadow-md" : "text-muted-foreground"
            )}
          >
            <span className="text-base">▶️</span> YouTube
          </button>
          <button
            onClick={() => setActiveTab('local')}
            className={cn(
              "flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all flex items-center justify-center gap-2",
              activeTab === 'local' ? "bg-primary text-primary-foreground shadow-md" : "text-muted-foreground"
            )}
          >
            <Headphones className="w-4 h-4" /> My Music
          </button>
        </div>

        {/* YouTube Tab */}
        {activeTab === 'youtube' && <YouTubeSync />}

        {/* Local Music Tab */}
        {activeTab === 'local' && (
          <div className="space-y-4">
            {/* Now Playing Mini Card */}
            {currentTrack && (
              <Card className="overflow-hidden border-primary/20">
                <div className="bg-gradient-to-r from-primary/10 to-accent/10 p-4">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-primary/20 flex items-center justify-center shrink-0">
                      {isPlaying ? (
                        <div className="flex gap-0.5 items-end h-6">
                          <div className="w-1 bg-primary rounded animate-pulse" style={{height: '60%'}} />
                          <div className="w-1 bg-primary rounded animate-pulse" style={{height: '100%', animationDelay: '75ms'}} />
                          <div className="w-1 bg-primary rounded animate-pulse" style={{height: '40%', animationDelay: '150ms'}} />
                        </div>
                      ) : (
                        <Music className="w-6 h-6 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-foreground truncate">{currentTrack.name}</p>
                      <p className="text-xs text-muted-foreground">{currentTrack.artist}</p>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-3 space-y-1">
                    <Slider value={[currentTime]} max={duration || 100} step={1} onValueChange={seekTo} className="cursor-pointer" />
                    <div className="flex justify-between text-[10px] text-muted-foreground">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex items-center justify-center gap-2 mt-2">
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setIsShuffled(!isShuffled)}>
                      <Shuffle className={cn("h-4 w-4", isShuffled && "text-primary")} />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={playPrev} disabled={tracks.length === 0}>
                      <SkipBack className="h-5 w-5" />
                    </Button>
                    <Button size="icon" className="w-12 h-12 rounded-full bg-primary text-primary-foreground" onClick={togglePlay}>
                      {isPlaying ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5 ml-0.5" />}
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={playNext} disabled={tracks.length === 0}>
                      <SkipForward className="h-5 w-5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => {
                      const modes: Array<'none' | 'one' | 'all'> = ['none', 'one', 'all'];
                      setRepeatMode(modes[(modes.indexOf(repeatMode) + 1) % 3]);
                    }}>
                      <Repeat className={cn("h-4 w-4", repeatMode !== 'none' && "text-primary")} />
                    </Button>
                  </div>

                  {/* Volume */}
                  <div className="flex items-center gap-2 mt-2">
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setIsMuted(!isMuted)}>
                      {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                    </Button>
                    <Slider value={[isMuted ? 0 : volume]} max={100} step={1} onValueChange={(v) => { setVolume(v[0]); setIsMuted(false); }} className="flex-1" />
                  </div>
                </div>
              </Card>
            )}

            {/* Upload Button */}
            <Button onClick={() => fileInputRef.current?.click()} className="w-full h-14 rounded-2xl gap-2 bg-primary text-primary-foreground" size="lg">
              <Upload className="h-5 w-5" />
              Add Music from Phone
            </Button>

            {/* Track List */}
            {tracks.length > 0 ? (
              <Card>
                <CardContent className="p-3">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">{tracks.length} tracks</p>
                  <div className="space-y-1 max-h-72 overflow-y-auto">
                    {tracks.map((track, i) => (
                      <button
                        key={track.id}
                        onClick={() => playTrack(track)}
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-xl w-full text-left transition-colors",
                          currentTrack?.id === track.id ? "bg-primary/10" : "hover:bg-muted/50"
                        )}
                      >
                        <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                          {currentTrack?.id === track.id && isPlaying ? (
                            <div className="flex gap-px items-end h-4">
                              <div className="w-0.5 bg-primary rounded animate-pulse" style={{height: '60%'}} />
                              <div className="w-0.5 bg-primary rounded animate-pulse" style={{height: '100%'}} />
                              <div className="w-0.5 bg-primary rounded animate-pulse" style={{height: '40%'}} />
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">{i + 1}</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate text-foreground">{track.name}</p>
                          <p className="text-xs text-muted-foreground">{track.artist}</p>
                        </div>
                        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={(e) => { e.stopPropagation(); toggleFavorite(track.id); }}>
                          <Heart className={cn("h-4 w-4", favorites.has(track.id) && "fill-current text-destructive")} />
                        </Button>
                      </button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ) : (
              <div className="text-center py-12">
                <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-3">
                  <Music className="w-8 h-8 text-muted-foreground" />
                </div>
                <p className="text-muted-foreground font-medium">No tracks yet</p>
                <p className="text-sm text-muted-foreground/70">Upload audio files from your phone to play them here</p>
              </div>
            )}
          </div>
        )}
      </div>

      <BottomNav activeTab="home" onTabChange={handleNavChange} />
    </div>
  );
}
