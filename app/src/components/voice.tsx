"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./ui";

// Browser speech only: no audio passes through this app. Where the browser has no
// speech support, these show nothing and typing still works.

interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: { resultIndex: number; results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}

function recognitionClass(): (new () => Recognition) | null {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function SpeakButton({ onText }: { onText: (spoken: string) => void }) {
  const [listening, setListening] = useState(false);
  const [problem, setProblem] = useState("");
  const recognition = useRef<Recognition | null>(null);
  useEffect(() => () => recognition.current?.stop(), []);

  const Speech = recognitionClass();
  if (!Speech) return null;

  function start() {
    if (!Speech) return;
    const r = new Speech();
    r.lang = "en-CA";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (event) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) onText(event.results[i][0].transcript);
      }
    };
    r.onerror = (event) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") setProblem("Microphone is blocked, so type it instead.");
      else if (event.error !== "no-speech" && event.error !== "aborted") setProblem("Couldn't hear that, so try again or type it.");
    };
    r.onend = () => setListening(false);
    recognition.current = r;
    setProblem("");
    try {
      r.start();
      setListening(true);
    } catch {
      setProblem("Couldn't start listening, so type it instead.");
    }
  }

  return (
    <>
      <Button aria-pressed={listening} onClick={() => (listening ? recognition.current?.stop() : start())}>
        {listening ? "Stop listening" : "Speak"}
      </Button>
      {problem && (
        <span role="status" className="text-sm text-stone-600">
          {problem}
        </span>
      )}
    </>
  );
}

export function ReadAloudButton({ text }: { text: string }) {
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  if (!window.speechSynthesis) return null;
  return (
    <Button
      onClick={() => {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(text));
      }}
    >
      Read it to me
    </Button>
  );
}
