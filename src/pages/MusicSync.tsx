import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BottomNav } from "@/components/layout/BottomNav";
import { TopBar } from "@/components/layout/TopBar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Volume2, 
  VolumeX,
  Music,
  Upload,
  List,
  Shuffle,
  Repeat,
  Heart
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

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
  const { currentRoom } = useAuth();
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
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

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
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play();
      } else if (repeatMode === 'all' || tracks.length > 1) {
        playNext();
      } else {
        setIsPlaying(false);
      }
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
        const track: Track = {
          id: `${Date.now()}-${Math.random()}`,
          name: file.name.replace(/\.[^/.]+$/, ''),
          artist: 'Unknown Artist',
          duration: 0,
          file,
          url: URL.createObjectURL(file)
        };
        newTracks.push(track);
      }
    });

    if (newTracks.length > 0) {
      setTracks(prev => [...prev, ...newTracks]);
      toast.success(`Added ${newTracks.length} track(s)`);
      
      if (!currentTrack) {
        setCurrentTrack(newTracks[0]);
      }
    }
  };

  const playTrack = (track: Track) => {
    if (currentTrack?.id === track.id) {
      togglePlay();
    } else {
      setCurrentTrack(track);
      setIsPlaying(true);
      setTimeout(() => audioRef.current?.play(), 100);
    }
  };

  const togglePlay = () => {
    if (!currentTrack) return;
    
    if (isPlaying) {
      audioRef.current?.pause();
    } else {
      audioRef.current?.play();
    }
    setIsPlaying(!isPlaying);
  };

  const playNext = () => {
    if (tracks.length === 0) return;
    const currentIndex = tracks.findIndex(t => t.id === currentTrack?.id);
    let nextIndex: number;
    
    if (isShuffled) {
      nextIndex = Math.floor(Math.random() * tracks.length);
    } else {
      nextIndex = (currentIndex + 1) % tracks.length;
    }
    
    setCurrentTrack(tracks[nextIndex]);
    setIsPlaying(true);
    setTimeout(() => audioRef.current?.play(), 100);
  };

  const playPrev = () => {
    if (tracks.length === 0) return;
    if (currentTime > 3) {
      // If more than 3 seconds in, restart current track
      if (audioRef.current) audioRef.current.currentTime = 0;
      return;
    }
    
    const currentIndex = tracks.findIndex(t => t.id === currentTrack?.id);
    const prevIndex = currentIndex <= 0 ? tracks.length - 1 : currentIndex - 1;
    
    setCurrentTrack(tracks[prevIndex]);
    setIsPlaying(true);
    setTimeout(() => audioRef.current?.play(), 100);
  };

  const seekTo = (value: number[]) => {
    if (audioRef.current) {
      audioRef.current.currentTime = value[0];
      setCurrentTime(value[0]);
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFavorite = (trackId: string) => {
    setFavorites(prev => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      return next;
    });
  };

  const handleNavChange = (tab: string) => {
    const routes: Record<string, string> = {
      home: '/',
      tasks: '/tasks',
      expenses: '/expenses',
      storage: '/storage',
      chat: '/chat',
    };
    navigate(routes[tab] || '/');
  };

  return (
    <div className="min-h-screen bg-background pb-32">
      <TopBar 
        title="Music Sync" 
        showBack={true}
        onBack={() => navigate('/')}
        hint="Play music together with your roommates 🎵"
        rightContent={
          <Button 
            variant="glass" 
            size="iconSm"
            onClick={() => setShowPlaylist(!showPlaylist)}
          >
            <List className="h-4 w-4" />
          </Button>
        }
      />

      <audio ref={audioRef} src={currentTrack?.url} />
      <input 
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        className="hidden"
        onChange={handleFileUpload}
      />

      <div className="p-4 max-w-2xl mx-auto space-y-6">
        {/* Now Playing Card */}
        <Card className="overflow-hidden">
          <div className="gradient-primary p-8 text-center">
            <div className="w-32 h-32 mx-auto bg-primary-foreground/20 rounded-2xl flex items-center justify-center mb-4">
              <Music className="w-16 h-16 text-primary-foreground" />
            </div>
            
            {currentTrack ? (
              <>
                <h2 className="text-xl font-bold text-primary-foreground truncate">
                  {currentTrack.name}
                </h2>
                <p className="text-primary-foreground/70 text-sm">
                  {currentTrack.artist}
                </p>
              </>
            ) : (
              <>
                <h2 className="text-xl font-bold text-primary-foreground">
                  No Track Playing
                </h2>
                <p className="text-primary-foreground/70 text-sm">
                  Add music to get started
                </p>
              </>
            )}
          </div>

          <CardContent className="p-4 space-y-4">
            {/* Progress Bar */}
            <div className="space-y-2">
              <Slider
                value={[currentTime]}
                max={duration || 100}
                step={1}
                onValueChange={seekTo}
                disabled={!currentTrack}
                className="cursor-pointer"
              />
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(duration)}</span>
              </div>
            </div>

            {/* Main Controls */}
            <div className="flex items-center justify-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsShuffled(!isShuffled)}
                className={cn(isShuffled && "text-primary")}
              >
                <Shuffle className="h-5 w-5" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={playPrev}
                disabled={tracks.length === 0}
              >
                <SkipBack className="h-6 w-6" />
              </Button>
              
              <Button
                size="lg"
                className="w-16 h-16 rounded-full gradient-primary"
                onClick={togglePlay}
                disabled={!currentTrack}
              >
                {isPlaying ? (
                  <Pause className="h-8 w-8" />
                ) : (
                  <Play className="h-8 w-8 ml-1" />
                )}
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={playNext}
                disabled={tracks.length === 0}
              >
                <SkipForward className="h-6 w-6" />
              </Button>
              
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  const modes: Array<'none' | 'one' | 'all'> = ['none', 'one', 'all'];
                  const currentIndex = modes.indexOf(repeatMode);
                  setRepeatMode(modes[(currentIndex + 1) % 3]);
                }}
                className={cn(repeatMode !== 'none' && "text-primary")}
              >
                <Repeat className="h-5 w-5" />
                {repeatMode === 'one' && (
                  <span className="absolute text-[10px] font-bold">1</span>
                )}
              </Button>
            </div>

            {/* Volume Control */}
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMuted(!isMuted)}
              >
                {isMuted || volume === 0 ? (
                  <VolumeX className="h-5 w-5" />
                ) : (
                  <Volume2 className="h-5 w-5" />
                )}
              </Button>
              <Slider
                value={[isMuted ? 0 : volume]}
                max={100}
                step={1}
                onValueChange={(v) => {
                  setVolume(v[0]);
                  setIsMuted(false);
                }}
                className="flex-1"
              />
            </div>
          </CardContent>
        </Card>

        {/* Add Music Button */}
        <Button
          onClick={() => fileInputRef.current?.click()}
          className="w-full gradient-sunset"
          size="lg"
        >
          <Upload className="h-5 w-5 mr-2" />
          Add Music Files
        </Button>

        {/* Playlist */}
        {(showPlaylist || tracks.length > 0) && (
          <Card>
            <CardContent className="p-4">
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <List className="h-4 w-4" />
                Playlist ({tracks.length} tracks)
              </h3>
              
              {tracks.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Music className="h-12 w-12 mx-auto mb-2 opacity-50" />
                  <p>No tracks added yet</p>
                  <p className="text-sm">Upload audio files to get started</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {tracks.map((track, index) => (
                    <div
                      key={track.id}
                      onClick={() => playTrack(track)}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                        currentTrack?.id === track.id 
                          ? "bg-primary/10 border border-primary/30"
                          : "bg-muted/30 hover:bg-muted/50"
                      )}
                    >
                      <div className="w-10 h-10 rounded-lg bg-muted flex items-center justify-center">
                        {currentTrack?.id === track.id && isPlaying ? (
                          <div className="flex gap-0.5">
                            <div className="w-1 h-3 bg-primary animate-pulse rounded" />
                            <div className="w-1 h-4 bg-primary animate-pulse rounded delay-75" />
                            <div className="w-1 h-2 bg-primary animate-pulse rounded delay-150" />
                          </div>
                        ) : (
                          <span className="text-sm text-muted-foreground">{index + 1}</span>
                        )}
                      </div>
                      
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{track.name}</p>
                        <p className="text-xs text-muted-foreground">{track.artist}</p>
                      </div>
                      
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleFavorite(track.id);
                        }}
                        className={cn(
                          "h-8 w-8",
                          favorites.has(track.id) && "text-red-500"
                        )}
                      >
                        <Heart className={cn("h-4 w-4", favorites.has(track.id) && "fill-current")} />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      <BottomNav activeTab="home" onTabChange={handleNavChange} />
    </div>
  );
}
