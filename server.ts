import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";

dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  app.post("/api/tts-free", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      // Google Translate TTS limits characters to ~200. Chunk it.
      const words = text.split(/\s+/);
      const chunks: string[] = [];
      let currentChunk = "";

      for (const word of words) {
        if ((currentChunk + " " + word).length > 180) {
          chunks.push(currentChunk.trim());
          currentChunk = word;
        } else {
          currentChunk = currentChunk ? currentChunk + " " + word : word;
        }
      }
      if (currentChunk) chunks.push(currentChunk.trim());

      const buffers: Buffer[] = [];
      for (const chunk of chunks) {
        if (!chunk) continue;
        const url = `https://translate.google.com/translate_tts?ie=UTF-8&tl=vi&client=tw-ob&q=${encodeURIComponent(chunk)}`;
        const response = await fetch(url);
        if (!response.ok) {
           console.error("Translate TTS failed for chunk:", chunk);
           continue;
        }
        const arrayBuffer = await response.arrayBuffer();
        buffers.push(Buffer.from(arrayBuffer));
      }

      const finalBuffer = Buffer.concat(buffers);
      res.json({ audioContent: finalBuffer.toString("base64") });

    } catch (error) {
      console.error("Free TTS Error:", error);
      res.status(500).json({ error: "Internal server error running free TTS" });
    }
  });

  app.post("/api/tts", async (req, res) => {
    try {
      const { text, voiceName = "vi-VN-Studio-C", rate = 1.15 } = req.body;
      
      if (!text) {
        return res.status(400).json({ error: "Text is required" });
      }

      const apiKey = process.env.GOOGLE_CLOUD_API_KEY;
      
      if (!apiKey) {
        // Fallback or just return error that API key is missing
        return res.status(500).json({ 
          error: "GOOGLE_CLOUD_API_KEY is not configured in secrets. Please configure it to use Google Cloud TTS.",
          missingKey: true
        });
      }

      const response = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: { text },
          voice: {
            languageCode: "vi-VN",
            name: voiceName, // vi-VN-Studio-C (Sadachbia) or vi-VN-Studio-O, vi-VN-Studio-Q
          },
          audioConfig: {
            audioEncoding: "MP3",
            speakingRate: rate,
          },
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        console.error("TTS API Error:", errData || response.statusText);
        return res.status(response.status).json({ error: "Failed to synthesize speech from Google Cloud", details: errData });
      }

      const data = await response.json();
      // data.audioContent is base64 string
      res.json({ audioContent: data.audioContent });

    } catch (error) {
      console.error("TTS Error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  // Generic error handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express App Error:", err);
    res.status(err.status || 500).json({
      error: err.message || "Internal Server Error",
    });
  });

  if (process.env.VERCEL) {
    // Vercel handles the listening, we just need to provide the app instance
    console.log("Running in Vercel environment");
  } else {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  }

  return app;
}

let appInstance = express(); // Temporary stub for export

startServer().then(app => {
  if (app) appInstance = app;
}).catch(console.error);

export default appInstance;
