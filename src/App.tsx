import { useState, useRef, useEffect } from "react";
import { Loader2, Download, Square, Play } from "lucide-react";
import { optimizeTextForTTS } from "./services/geminiService";

export default function App() {
  const [rawText, setRawText] = useState("");
  const [optimizedText, setOptimizedText] = useState("");
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [isSynthesizing, setIsSynthesizing] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [engine, setEngine] = useState<"browser" | "google-translate" | "google">("google-translate");
  const [rate, setRate] = useState(1.15);
  const [voiceName, setVoiceName] = useState("default");
  const [browserVoices, setBrowserVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [waves, setWaves] = useState<number[]>([]);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Generate some random heights for the decorative equalizer
    setWaves(Array.from({ length: 16 }, () => Math.max(4, Math.random() * 28)));

    const loadVoices = () => {
      if (!window.speechSynthesis) return;
      const voices = window.speechSynthesis.getVoices();
      // Only keep Vietnamese voices or all if none
      const viVoices = voices.filter(v => v.lang.includes('vi'));
      setBrowserVoices(viVoices.length > 0 ? viVoices : voices);
    };

    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }, []);

  const handleEngineChange = (newEngine: "browser" | "google-translate" | "google") => {
    setEngine(newEngine);
    if (newEngine === 'browser') {
      setVoiceName(browserVoices.length > 0 ? browserVoices[0].name : "default");
    } else if (newEngine === 'google-translate') {
      setVoiceName("default");
    } else {
      setVoiceName("vi-VN-Neural2-A"); // Default to best expressive Google Voice
    }
  };

  const handleOptimize = async () => {
    if (!rawText.trim()) {
      setError("Vui lòng nhập văn bản cần tối ưu.");
      return;
    }
    
    setError(null);
    setIsOptimizing(true);
    setAudioUrl(null);
    
    try {
      const result = await optimizeTextForTTS(rawText);
      setOptimizedText(result);
    } catch (err: any) {
      setError(err.message || "Đã xảy ra lỗi khi tối ưu hóa văn bản.");
    } finally {
      setIsOptimizing(false);
    }
  };

  const handleGenerateAudio = async () => {
    if (!optimizedText.trim()) {
      setError("Vui lòng tối ưu hóa văn bản trước khi tạo giọng đọc.");
      return;
    }

    setError(null);
    setAudioUrl(null);
    
    if (engine === "browser") {
      fallbackToWebSpeech(optimizedText);
      return;
    }

    setIsSynthesizing(true);
    // Refresh waves a bit 
    setWaves(Array.from({ length: 16 }, () => Math.max(10, Math.random() * 32)));

    try {
      let response;
      if (engine === "google-translate") {
        response = await fetch("/api/tts-free", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: optimizedText, rate }),
        });
      } else {
        response = await fetch("/api/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text: optimizedText,
            voiceName,
            rate
          }),
        });
      }

      const contentType = response.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        const text = await response.text();
        throw new Error(`Máy chủ bị lỗi không trả về JSON (Status: ${response.status}). Có thể bạn đang nhập văn bản quá dài, hoặc cấu hình Google Cloud bị từ chối / chưa bật API.`);
      }

      const data = await response.json();

      if (!response.ok) {
        if (data.missingKey) {
          throw new Error("Chưa cấu hình GOOGLE_CLOUD_API_KEY ở phía server.");
        }
        throw new Error(data.error || "Lỗi Google Cloud TTS API.");
      }

      if (data.audioContent) {
        const audioSrc = "data:audio/mp3;base64," + data.audioContent;
        setAudioUrl(audioSrc);
        
        setTimeout(() => {
          if (audioRef.current) {
            audioRef.current.play().catch(console.error);
            setIsPlaying(true);
          }
        }, 100);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Đã xảy ra lỗi khi gọi TTS API.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  const handleStop = () => {
    setIsPlaying(false);
    setIsSynthesizing(false);
    window.speechSynthesis.cancel();
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
  };

  const fallbackToWebSpeech = (text: string) => {
    window.speechSynthesis.cancel();
    if (!window.speechSynthesis) {
        setError("Trình duyệt của bạn không hỗ trợ Text-to-Speech.");
        return;
    }
    
    setIsSynthesizing(true);
    setIsPlaying(true);
    setWaves(Array.from({ length: 16 }, () => Math.max(10, Math.random() * 32)));
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'vi-VN';
    utterance.rate = rate;
    
    if (engine === 'browser' && voiceName !== 'default') {
      const selectedVoice = browserVoices.find(v => v.name === voiceName);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }
    }
    
    utterance.onend = () => {
       setIsSynthesizing(false);
       setIsPlaying(false);
    };
    utterance.onerror = () => {
      setError("Trình duyệt từ chối tự động phát âm thanh, hoặc bị lỗi.");
      setIsSynthesizing(false);
      setIsPlaying(false);
    };
    
    window.speechSynthesis.speak(utterance);
  };

  const handleDownload = () => {
    if (!audioUrl) return;
    const a = document.createElement("a");
    a.href = audioUrl;
    a.download = "tts-audio.mp3";
    a.click();
  };

  return (
    <div className="flex flex-col h-screen w-full bg-[#0d0d0d] text-[#e0e0e0] font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 flex flex-shrink-0 items-center justify-between px-8 border-b border-[#333]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#a8916e] flex items-center justify-center rounded-sm">
            <span className="text-black font-bold">V</span>
          </div>
          <h1 className="text-xl font-medium tracking-tight">VOCALIST <span className="text-[#a8916e] font-serif italic">AI</span></h1>
        </div>
        <nav className="hidden md:flex gap-8 text-sm uppercase tracking-widest">
          <a href="#" className="text-[#a8916e]">Editor</a>
          <a href="#" className="opacity-40 hover:opacity-80 transition-opacity">Library</a>
          <a href="#" className="opacity-40 hover:opacity-80 transition-opacity">History</a>
        </nav>
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-xs text-right">
            <p className="opacity-40">Status</p>
            <p className="font-mono uppercase">{isSynthesizing ? "PROCESSING" : "SYSTEM READY"}</p>
          </div>
          <div className={`w-2 h-2 rounded-full ${isSynthesizing ? 'bg-[#a8916e] animate-pulse' : 'bg-[#4caf50]'}`}></div>
        </div>
      </header>

      {error && (
        <div className="bg-[#1f0d0d] text-[#ff9999] px-6 py-2 text-sm flex justify-between items-center shrink-0 border-b border-[#3b1c1c] z-10 shadow-sm relative">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="opacity-80 hover:opacity-100 text-xl font-light pl-4">&times;</button>
        </div>
      )}

      {/* Main */}
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left pane */}
        <section className="md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-[#333]">
          <div className="p-4 border-b border-[#333] flex justify-between items-center">
            <span className="text-xs uppercase tracking-tighter opacity-60">Raw Text Input</span>
            <div className="flex gap-4 items-center">
              <span className="text-[10px] bg-[#222] px-2 py-1 rounded hidden sm:inline-block border border-[#333]">VI-VN-UTF8</span>
              <button 
                onClick={handleOptimize}
                disabled={isOptimizing || !rawText.trim()}
                className="text-[10px] text-[#a8916e] border border-[#a8916e] px-4 py-1.5 rounded hover:bg-[#a8916e] hover:text-black transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#a8916e]"
              >
                {isOptimizing ? "OPTIMIZING GUIDELINES..." : "OPTIMIZE OUTPUT"}
              </button>
            </div>
          </div>
          <div className="flex-1 p-6 relative">
             <textarea 
               value={rawText}
               onChange={(e) => setRawText(e.target.value)}
               className="w-full h-full bg-transparent border-none outline-none resize-none text-lg leading-relaxed font-serif opacity-80 placeholder:opacity-40" 
               placeholder="Nhập văn bản thô tại đây... &#10;Ví dụ: Cập nhật tin tức ngày 26/05/2024: GDP tăng trưởng 5% trong quý I. TP.HCM đang ghi nhận 150K người tham gia sự kiện mới..."
             />
          </div>
        </section>

        {/* Right pane */}
        <section className="md:w-1/2 flex flex-col bg-[#121212]">
          <div className="p-4 border-b border-[#333] flex justify-between items-center bg-[#0d0d0d]">
            <span className="text-xs uppercase tracking-tighter opacity-60">TTS Optimized Output</span>
            <div className="flex gap-2">
              <button 
                onClick={() => navigator.clipboard.writeText(optimizedText)}
                className="text-[10px] text-[#a8916e] border border-[#a8916e]/40 px-3 py-1.5 rounded hover:bg-[#a8916e] hover:border-[#a8916e] hover:text-black transition-colors disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-[#a8916e] disabled:hover:border-[#a8916e]/40"
                disabled={!optimizedText.trim()}
              >
                COPY TEXT
              </button>
            </div>
          </div>
          <div className="flex-1 p-6 bg-[#0f0f0f]">
            <textarea 
                value={optimizedText}
                onChange={(e) => setOptimizedText(e.target.value)}
                className="w-full h-full bg-transparent border-none outline-none resize-none text-lg leading-relaxed font-serif text-[#a8916e] opacity-90 placeholder:opacity-30 placeholder:text-[#e0e0e0]"
                placeholder="Kết quả tối ưu cho hệ thống Text-to-Speech sẽ xuất hiện tại đây..."
            />
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="h-auto md:h-48 border-t border-[#333] grid grid-cols-1 md:grid-cols-4 shrink-0 overflow-y-auto md:overflow-hidden">
        {/* Col 1 */}
        <div className="p-6 border-b md:border-b-0 md:border-r border-[#333] flex flex-col justify-between">
          <div>
            <label className="text-[10px] uppercase tracking-widest opacity-40 mb-3 block">TTS Engine & Voice</label>
            <div className="flex flex-col gap-3">
              <select 
                value={engine}
                onChange={(e) => handleEngineChange(e.target.value as "browser" | "google-translate" | "google")}
                className="w-full bg-[#1a1a1a] border border-[#333] text-sm p-3 rounded text-[#a8916e] outline-none appearance-none hover:border-[#a8916e]/50 focus:border-[#a8916e] transition-colors"
              >
                <option value="google-translate">Google Dịch (Miễn phí, 100% Tiếng Việt)</option>
                <option value="browser">Giọng Máy Tính (Web Speech API)</option>
                <option value="google">Google Cloud TTS (Premium API Key)</option>
              </select>

              <div className="relative">
                <select 
                  value={voiceName}
                  onChange={(e) => setVoiceName(e.target.value)}
                  className="w-full bg-[#1a1a1a] border border-[#333] text-sm p-3 rounded text-[#a8916e] outline-none appearance-none hover:border-[#a8916e]/50 focus:border-[#a8916e] transition-colors"
                >
                  {engine === "browser" ? (
                    browserVoices.length > 0 ? (
                      browserVoices.map((v, i) => (
                        <option key={i} value={v.name}>{v.name} ({v.lang})</option>
                      ))
                    ) : (
                      <option value="default">Giọng Mặc định (Web Speech)</option>
                    )
                  ) : engine === "google-translate" ? (
                    <option value="default">Giọng Mặc định (Tiếng Việt)</option>
                  ) : (
                    <>
                      <optgroup label="Neural2 (Cảm xúc, Tự nhiên nhất)">
                        <option value="vi-VN-Neural2-A">Neural2 Nữ (Ngọt ngào, Truyền cảm)</option>
                        <option value="vi-VN-Neural2-D">Neural2 Nam (Trầm ấm, Chuyên nghiệp)</option>
                      </optgroup>
                      <optgroup label="Wavenet (Rõ ràng, Mạch lạc)">
                        <option value="vi-VN-Wavenet-A">Wavenet Nữ (Chuẩn, Rõ ràng)</option>
                        <option value="vi-VN-Wavenet-B">Wavenet Nam (Trầm, Mạnh mẽ)</option>
                        <option value="vi-VN-Wavenet-C">Wavenet Nữ (Trẻ trung, Ấm áp)</option>
                        <option value="vi-VN-Wavenet-D">Wavenet Nam (Nhanh nhạy, Tin tức)</option>
                      </optgroup>
                      <optgroup label="Studio & Standard">
                        <option value="vi-VN-Studio-C">Sadachbia (Giọng Studio cao cấp)</option>
                        <option value="vi-VN-Standard-A">Kyra Nữ (Chuẩn)</option>
                        <option value="vi-VN-Standard-B">Đạt Nam (Chuẩn)</option>
                        <option value="vi-VN-Standard-C">Hai Nữ (Chuẩn)</option>
                        <option value="vi-VN-Standard-D">Linh Nam (Chuẩn)</option>
                      </optgroup>
                    </>
                  )}
                </select>
                {/* Custom caret */}
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-4 text-[#a8916e]/50">
                  <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z"/></svg>
                </div>
              </div>
            </div>
          </div>
          <div className="text-[10px] opacity-40 italic mt-6 md:mt-0">Premium requires Cloud Project config</div>
        </div>
        
        {/* Col 2 */}
        <div className="p-6 border-b md:border-b-0 md:border-r border-[#333] flex flex-col justify-between">
          <div>
            <label className="text-[10px] uppercase tracking-widest opacity-40 mb-3 block">Speech Configuration</label>
            <div className="flex items-center gap-4">
              <span className="text-xs flex-shrink-0 w-12 opacity-80">Speed</span>
              <input 
                type="range" 
                min="0.5" max="2.0" step="0.05"
                className="flex-1 accent-[#a8916e] cursor-pointer" 
                value={rate}
                onChange={(e) => setRate(parseFloat(e.target.value))}
              />
              <span className="text-xs font-mono w-10 text-right text-[#a8916e]">{rate.toFixed(2)}x</span>
            </div>
            <div className="flex items-center gap-4 mt-4 opacity-40 grayscale">
              <span className="text-xs flex-shrink-0 w-12">Pitch</span>
              <input type="range" className="flex-1 accent-[#a8916e] cursor-not-allowed" disabled value="50" title="Fixed for Studio Voice" />
              <span className="text-xs font-mono w-10 text-right">0.00</span>
            </div>
          </div>
        </div>
        
        {/* Col 3 */}
        <div className="p-6 border-b md:border-b-0 md:border-r border-[#333] flex items-center justify-center gap-6 bg-[#0d0d0d]">
          <button 
             onClick={handleGenerateAudio}
             disabled={isSynthesizing || !optimizedText.trim()}
             title="Translate text to audio"
             className="w-16 h-16 rounded-full border border-[#a8916e] flex items-center justify-center hover:bg-[#a8916e] hover:text-[#0d0d0d] group transition-all duration-300 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-[#a8916e] cursor-pointer shadow-[0_0_15px_rgba(168,145,110,0.1)] hover:shadow-[0_0_20px_rgba(168,145,110,0.4)] disabled:shadow-none disabled:hover:shadow-none"
          >
            {isSynthesizing && !isPlaying ? (
               <Loader2 className="h-6 w-6 text-[#a8916e] animate-spin group-hover:text-[#0d0d0d]" />
            ) : (
               <Play className="h-6 w-6 text-[#a8916e] group-hover:text-[#0d0d0d] ml-1 fill-current" />
            )}
          </button>

          <button 
             onClick={handleStop}
             disabled={!isPlaying && !isSynthesizing}
             title="Stop audio"
             className="w-16 h-16 rounded-full border border-[#333] flex items-center justify-center hover:bg-[#ff4444] hover:border-[#ff4444] hover:text-[#fff] group transition-all duration-300 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:border-[#333] cursor-pointer text-[#666]"
          >
            <Square className="h-5 w-5 fill-current" />
          </button>
        </div>
        
        {/* Col 4 */}
        <div className="p-6 flex flex-col justify-between bg-[#0a0a0a]">
          <div className="w-full">
            <label className="text-[10px] uppercase tracking-widest opacity-40 mb-3 flex justify-between items-center w-full">
              <span>Synthesis Result</span>
              {audioUrl && (
                  <button onClick={handleDownload} className="text-[#a8916e] opacity-80 hover:opacity-100 flex items-center gap-1.5 transition-colors">
                     <Download className="w-3 h-3" /> DOWNLOAD
                  </button>
              )}
            </label>
            
            {audioUrl ? (
               <audio 
                  ref={audioRef}
                  src={audioUrl} 
                  controls 
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                  onEnded={() => setIsPlaying(false)}
                  className="w-full h-10 mt-2 filter drop-shadow opacity-90" 
                  style={{
                    // Darken the native audio player somewhat via CSS filter
                    filter: "sepia(20%) saturate(70%) grayscale(1) invert(90%) contrast(120%) hue-rotate(180deg)"
                  }}
                />
            ) : (
                <div className="h-12 flex items-center gap-1.5 mt-2 overflow-hidden px-1">
                  {/* Decorative waves when idle/loading */}
                  {waves.map((height, i) => (
                      <div key={i} className="flex-1 bg-[#a8916e] rounded-sm transition-all duration-300" style={{
                          height: `${height}px`,
                          opacity: isSynthesizing ? 0.8 : 0.15,
                      }}></div>
                  ))}
                </div>
            )}
            
          </div>
          <div className="flex justify-between items-center text-[10px] font-mono tracking-widest text-[#a8916e] opacity-70 mt-6 md:mt-0">
            {audioUrl || isPlaying ? (
                <>
                  <span>PLAYING</span>
                  <span>{audioUrl ? "MP3" : "NATIVE"} / AUTO</span>
                </>
            ) : (
                <>
                  <span>WAITING FOR INPUT</span>
                  <span className="opacity-0">0:00</span>
                </>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
