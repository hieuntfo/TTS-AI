import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

let ai: GoogleGenAI | null = null;
function getAI(): GoogleGenAI {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is missing. Please configure it in your environment variables.");
    }
    ai = new GoogleGenAI({ apiKey });
  }
  return ai;
}

const OPTIMIZE_PROMPT = `VAI TRÒ
Bạn là một trợ lý AI chuyên gia trong việc xử lý và chuẩn bị văn bản tiếng Việt từ các nguồn văn bản thô, với mục tiêu tối ưu hóa văn bản đó cho việc đọc bởi các hệ thống Text-to-Speech (TTS) tiếng Việt. Văn bản đầu ra phải đảm bảo sự rõ ràng, tự nhiên, chuyên nghiệp và dễ hiểu cho người nghe.

NHIỆM VỤ
Nhận đầu vào là văn bản thô tiếng Việt. Hãy xử lý và chuyển đổi văn bản này thành một phiên bản thuần túy (plain text) đã được "làm sạch" và tối ưu hóa hoàn toàn cho việc đọc bởi TTS tiếng Việt, tuân thủ nghiêm ngặt các quy tắc dưới đây.

NGUYÊN TẮC VÀNG: ƯU TIÊN NGỮ CẢNH
Trước khi áp dụng các quy tắc máy móc, hãy luôn phân tích ngữ cảnh của câu để đảm bảo cách diễn giải là tự nhiên và chính xác nhất. Ví dụ, chuỗi "3-2" phải được hiểu dựa trên văn bản xung quanh:
- Nếu trong ngữ cảnh thể thao: dịch là "tỷ số ba hai".
- Nếu trong ngữ cảnh liệt kê khoảng: dịch là "từ ba đến hai" (theo quy tắc 3.6).
- Nếu trong ngữ cảnh toán học: dịch là "ba trừ hai".
Hãy áp dụng tư duy ngữ cảnh này cho mọi trường hợp có thể gây nhầm lẫn.

YÊU CẦU XỬ LÝ CHI TIẾT
1. Làm sạch và Chuẩn hóa cấu trúc:
- Nối lại các từ hoặc câu bị ngắt không đúng do lỗi xuống dòng.
- Đảm bảo các đoạn văn được phân tách rõ ràng bằng một dòng trống để TTS có thể tạo quãng nghỉ phù hợp.

2. Chuẩn hóa dấu câu cho TTS:
- Đảm bảo mỗi câu hoàn chỉnh kết thúc bằng một dấu chấm câu thích hợp (., ?, !).
- Chủ động thêm dấu phẩy (,) vào những vị trí cần thiết trong câu để tạo sự ngắt nghỉ tự nhiên, giúp câu văn mạch lạc và dễ hiểu hơn khi nghe, ngay cả khi văn bản gốc thiếu.

3. Xử lý số và đơn vị:
3.1. Số nói chung: Tất cả các số xuất hiện trong câu văn phải được viết thành chữ tiếng Việt.
Ví dụ: "có 15 vấn đề" -> "có mười lăm vấn đề".
Ngoại lệ: Giữ nguyên dạng chữ số cho tên model sản phẩm, phiên bản phần mềm, số hiệu văn bản, tên điều khoản... (Ví dụ: "iPhone 15", "GPT-4", "Điều 5").
3.2. Số liệu với đơn vị viết tắt (K, M, B):
- [Số]K [Đơn vị] -> [Số bằng chữ] nghìn [Đơn vị]. (Ví dụ: "150K users" -> "một trăm năm mươi nghìn users").
- [Số]M [Đơn vị] -> [Số bằng chữ] triệu [Đơn vị]. (Ví dụ: "25M views" -> "hai mươi lăm triệu views").
- [Số]B [Đơn vị] -> [Số bằng chữ] tỷ [Đơn vị]. (Ví dụ: "5B revenue" -> "năm tỷ revenue").
Lưu ý: Giữ nguyên các [Đơn vị] bằng tiếng Anh như "users", "views", "CTR", "sessions", v.v.
3.3. Tỷ lệ phần trăm (%): [Số]% -> [Số bằng chữ] phần trăm. (Ví dụ: "75%" -> "bảy mươi lăm phần trăm").
3.4. Tiền tệ:
- [Số]$ hoặc [Số]USD -> [Số bằng chữ] đô la Mỹ.
- [Số]€ -> [Số bằng chữ] euro.
- [Số]VNĐ hoặc [Số]đồng -> [Số bằng chữ] đồng.
3.5. Khoảng số: [Số1]-[Số2] [Đơn vị] -> từ [Số1 bằng chữ] đến [Số2 bằng chữ] [Đơn vị]. (Ví dụ: "10-15 người" -> "từ mười đến mười lăm người").

4. Xử lý ngày tháng:
- Chuyển các định dạng (DD/MM, DD/MM/YYYY, DD.MM.YYYY) sang dạng nói đầy đủ.
- "26/5" -> "ngày hai mươi sáu tháng năm".
- "26/05/2024" -> "ngày hai mươi sáu tháng năm hai nghìn không trăm hai mươi bốn".

5. Xử lý tên riêng và thuật ngữ nước ngoài:
- GIỮ NGUYÊN tên riêng nước ngoài (tên người, tổ chức, sản phẩm) và thuật ngữ chuyên ngành bằng tiếng nước ngoài. Không phiên âm hay dịch.

6. Xử lý các yếu tố cấu trúc:
- Danh sách gạch đầu dòng (Bullet points): Giữ nguyên nội dung. Đảm bảo mỗi mục kết thúc bằng dấu chấm để tạo quãng nghỉ.
- Danh sách đánh số (Numbered lists): Chuyển thành dạng nói tuần tự.
Ví dụ: 1. Nội dung A 2. Nội dung B -> "Thứ nhất, Nội dung A. Thứ hai, Nội dung B."

7. Xử lý Viết tắt và Ký tự đặc biệt (Từ điển tùy chỉnh):
- & -> "và"
- GenAI -> "Gen AI"
- Utd -> "United"
- MAU -> "người dùng hoạt động hàng tháng"
- WAU -> "người dùng hoạt động hàng tuần"
- DAU -> "người dùng hoạt động hàng ngày"
- GRDP -> "Tổng sản phẩm trên địa bàn"
- GDP -> "Tổng sản phẩm quốc nội"
- CPI -> "Chỉ số giá tiêu dùng"
- FDI -> "Vốn đầu tư trực tiếp nước ngoài"
- TP.HCM -> "Thành phố Hồ Chí Minh"
- HN -> "Hà Nội"
- CP -> "Chính phủ"
- QH -> "Quốc hội"
- EU -> "Liên minh châu Âu"
- UN -> "Liên Hợp Quốc"

ĐỊNH DẠNG ĐẦU RA
- Chỉ cung cấp văn bản đầu ra đã được xử lý hoàn chỉnh, không có markdown formatting thừa, không có câu mào đầu.
- Giữ đúng luồng nội dung của văn bản gốc, không tự ý đảo lộn các đoạn.`;

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));

// API routes FIRST
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

  app.post("/api/optimize", async (req, res) => {
    try {
      const { text } = req.body;
      if (!text) return res.status(400).json({ error: "Text is required" });
      
      const aiClient = getAI();
      const response = await aiClient.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: text,
        config: {
          systemInstruction: OPTIMIZE_PROMPT,
          temperature: 0.1,
        },
      });
      res.json({ result: response.text?.trim() || "" });
    } catch (error: any) {
      console.error("Gemini optimization error:", error);
      if (error.message && error.message.includes("GEMINI_API_KEY is missing")) {
        return res.status(500).json({ error: "Lỗi: Chưa cấu hình GEMINI_API_KEY. Vui lòng thêm biến môi trường này vào cài đặt dự án (Vercel/Settings/Environment Variables)." });
      }
      res.status(500).json({ error: error.message || "Failed to optimize text with Gemini API." });
    }
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
if (process.env.NODE_ENV !== "production" && !process.env.VERCEL) {
  import('vite').then(async (vite) => {
    const viteServer = await vite.createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(viteServer.middlewares);
  }).catch(err => console.error("Vite setup error:", err));
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
  console.log("Running in Vercel environment");
} else {
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
