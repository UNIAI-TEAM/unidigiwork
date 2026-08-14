// Phụ đề trực tiếp (client-only) dùng Web Speech API của trình duyệt.
// Chỉ nhận giọng nói của chính người dùng qua micro; không gửi dữ liệu ra ngoài app.
import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((e: any) => void) | null;
  onerror: ((e: any) => void) | null;
  onend: (() => void) | null;
};

function getCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as Record<string, unknown>;
  return (w["SpeechRecognition"] ?? w["webkitSpeechRecognition"]) as (new () => SpeechRecognitionLike) | null;
}

export function useLiveCaptions(lang = "vi-VN") {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  const wantRef = useRef(false);

  useEffect(() => setSupported(getCtor() !== null), []);

  const stop = useCallback(() => {
    wantRef.current = false;
    try {
      recRef.current?.stop();
    } catch {
      /* đã dừng */
    }
    recRef.current = null;
    setEnabled(false);
    setText("");
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) {
      setError("unsupported");
      return false;
    }
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: any) => {
      let out = "";
      for (let i = e.resultIndex; i < e.results.length; i++) out += e.results[i][0].transcript;
      setText(out.trim().slice(-220));
    };
    rec.onerror = (e: any) => {
      setError(String(e?.error ?? "error"));
      if (e?.error === "not-allowed" || e?.error === "service-not-allowed") stop();
    };
    rec.onend = () => {
      // Trình duyệt tự ngắt sau khoảng lặng — khởi động lại nếu vẫn bật.
      if (!wantRef.current) return;
      try {
        rec.start();
      } catch {
        /* bỏ qua */
      }
    };
    wantRef.current = true;
    recRef.current = rec;
    setError(null);
    try {
      rec.start();
      setEnabled(true);
      return true;
    } catch {
      setError("start-failed");
      return false;
    }
  }, [lang, stop]);

  useEffect(() => () => stop(), [stop]);

  return { supported, enabled, text, error, start, stop };
}
