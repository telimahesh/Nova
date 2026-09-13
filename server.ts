import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

// Global cache for World Update to prevent quota exhaustion
let cachedWorldUpdate: { text: string; timestamp: number } | null = null;
const CACHE_DURATION = 60 * 60 * 1000; // 1 hour

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API route for World Update (Native API Support)
  app.post("/api/world-update", async (req, res) => {
    // Check cache first
    const now = Date.now();
    if (cachedWorldUpdate && (now - cachedWorldUpdate.timestamp < CACHE_DURATION)) {
      console.log("Serving World Update from backend cache...");
      return res.json({ text: cachedWorldUpdate.text });
    }

    try {
      // Priority: 1. System Key, 2. Global Key from config
      let apiKey = process.env.GEMINI_API_KEY;
      
      if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
        try {
          const configPath = path.join(process.cwd(), "firebase-applet-config.json");
          if (fs.existsSync(configPath)) {
            const config = JSON.parse(await fs.promises.readFile(configPath, "utf8"));
            const projectId = config.projectId;
            // Native fetch (node 18+)
            const firestoreRes = await fetch(`https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/config/global`);
            if (firestoreRes.ok) {
              const firestoreData: any = await firestoreRes.json();
              const dbKey = firestoreData?.fields?.geminiApiKey?.stringValue;
              if (dbKey && dbKey.length > 10) {
                apiKey = dbKey;
              }
            }
          }
        } catch (dbError) {
          console.error("Failed to fetch key from Firestore:", dbError);
        }
      }

      if (!apiKey || apiKey === "undefined" || apiKey.length < 10) {
        return res.status(400).json({ 
          error: "Configuration Required: Please set the Global Gemini API Key in the Admin Panel." 
        });
      }

      const ai: any = new GoogleGenAI({ apiKey });
      const prompt = "Give me a brief summary of what is happening in the world today. Focus on major global events, technology, and science. Keep it concise.";
      
      const modelsToTry = [
        "gemini-flash-latest",
        "gemini-1.5-flash",
        "gemini-1.5-flash-8b",
        "gemini-2.0-flash-lite-preview-02-05",
        "gemini-3-flash-preview",
        "gemini-3.1-flash-lite-preview",
        "gemini-2.0-flash"
      ];

      let responseText = null;
      let lastError = null;

      for (const model of modelsToTry) {
        try {
          console.log(`Backend Syncing with ${model}...`);
          const result = await ai.models.generateContent({
            model: model,
            contents: prompt
          });
          if (result && result.text) {
            responseText = result.text;
            break;
          }
        } catch (e: any) {
          console.warn(`Backend sync failed for ${model}:`, e.message);
          lastError = e;
        }
      }

      if (responseText) {
        // Update cache
        cachedWorldUpdate = { text: responseText, timestamp: Date.now() };
        res.json({ text: responseText });
      } else {
        const quotaError = lastError?.message?.includes("429") || lastError?.message?.includes("quota");
        res.status(500).json({ 
          error: quotaError ? "QUOTA EXCEEDED: System is currently under high load. Please try again later." : "SYSTEM_ERROR: All sync protocols exhausted." 
        });
      }
    } catch (error: any) {
      console.error("Backend World Update Error:", error);
      res.status(500).json({ error: "INTERNAL_CORE_FAILURE: " + error.message });
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

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
