"use client";

import { useEffect, useRef, useState } from "react";
import { Mic, Square } from "lucide-react";
import styles from "./todo.module.css";

type Recognition = {
  lang: string; continuous: boolean; interimResults: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null; start: () => void; stop: () => void; abort: () => void;
};
type VoiceWindow = Window & { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };

export function VoiceInput({ disabled, onText, onNotice }: { disabled: boolean; onText: (text: string) => void; onNotice: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => () => { recognition.current?.abort(); }, []);

  function toggle() {
    if (listening) { recognition.current?.stop(); return; }
    const voiceWindow = window as VoiceWindow;
    const Constructor = voiceWindow.SpeechRecognition ?? voiceWindow.webkitSpeechRecognition;
    if (!Constructor) { onNotice("当前浏览器不支持直接语音输入，可以使用手机键盘的麦克风听写。"); return; }
    const instance = new Constructor();
    recognition.current = instance;
    instance.lang = "zh-CN"; instance.continuous = false; instance.interimResults = false;
    instance.onresult = (event) => {
      const text = Array.from(event.results).map((result) => result[0].transcript).join("");
      if (text.trim()) { onText(text); onNotice("已转成文字，检查后再发送。"); }
    };
    instance.onerror = (event) => {
      const message = event.error === "not-allowed" ? "未获得麦克风权限。请允许麦克风，或使用键盘听写。" : event.error === "no-speech" ? "没有听清，请再试一次。" : "语音识别暂时不可用，可以使用手机键盘的麦克风听写。";
      onNotice(message); setListening(false);
    };
    instance.onend = () => setListening(false);
    try { instance.start(); setListening(true); onNotice("正在听…说完后点击停止，识别结果会填入输入框。"); }
    catch { onNotice("无法启动麦克风，请使用键盘听写。"); }
  }
  return <button type="button" className={`${styles.voiceButton} ${listening ? styles.listening : ""}`} disabled={disabled} onClick={toggle} aria-label={listening ? "停止语音输入" : "语音输入"} aria-pressed={listening}>{listening ? <Square size={19} /> : <Mic size={22} />}</button>;
}
