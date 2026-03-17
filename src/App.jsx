import { useState, useEffect, useRef, useCallback } from "react";

// ─── Storage helpers ───
const DB_KEY = "norddjurs-db";

const getDB = async () => {
  try {
    const result = await window.storage.get(DB_KEY);
    return result ? JSON.parse(result.value) : null;
  } catch {
    return null;
  }
};

const saveDB = async (db) => {
  try {
    // Store audio separately to avoid hitting storage size limits
    const dbCopy = JSON.parse(JSON.stringify(db));
    dbCopy.responses = dbCopy.responses.map(r => {
      if (r.media_url && r.media_url.startsWith("data:")) {
        // Save audio in its own key
        window.storage.set(`audio-${r.id}`, r.media_url).catch(() => {});
        return { ...r, media_url: `audio-ref:${r.id}` };
      }
      return r;
    });
    await window.storage.set(DB_KEY, JSON.stringify(dbCopy));
  } catch (e) {
    console.error("Storage save failed:", e);
  }
};

const hydrateAudio = async (db) => {
  // Restore audio base64 data from separate storage keys
  const hydrated = { ...db, responses: await Promise.all(
    db.responses.map(async (r) => {
      if (r.media_url && r.media_url.startsWith("audio-ref:")) {
        const audioKey = r.media_url.replace("audio-ref:", "audio-");
        try {
          const result = await window.storage.get(audioKey);
          return { ...r, media_url: result?.value || null };
        } catch {
          return { ...r, media_url: null };
        }
      }
      return r;
    })
  )};
  return hydrated;
};

const defaultDB = () => ({
  themes: [
    { id: "t1", name: "Økonomi & Planlægning", icon: "💰", sort_order: 1 },
    { id: "t2", name: "Børn, Unge & Sociale Forhold", icon: "👨‍👩‍👧‍👦", sort_order: 2 },
    { id: "t3", name: "Beskæftigelse & Uddannelse", icon: "🎓", sort_order: 3 },
    { id: "t4", name: "Klima, Natur & Miljø", icon: "🌿", sort_order: 4 },
    { id: "t5", name: "Kultur, Fritid & Idræt", icon: "🎭", sort_order: 5 },
  ],
  questions: [
    { id: "q1", theme_id: "t1", title: "Budget-prioritering", body: "Hvad synes du er vigtigst, når kommunen skal lægge budget for de næste år?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 1 },
    { id: "q2", theme_id: "t1", title: "Pengeforbrug", body: "Hvis du selv kunne bestemme, hvad ville du bruge flere penge på i Norddjurs?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 2 },
    { id: "q3", theme_id: "t2", title: "Børnefamilier", body: "Hvad fungerer godt for børnefamilier i Norddjurs — og hvad mangler?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 1 },
    { id: "q4", theme_id: "t2", title: "Udsatte borgere", body: "Hvad ville gøre den største forskel for udsatte borgere i kommunen?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 2 },
    { id: "q5", theme_id: "t3", title: "Bosætning", body: "Hvad skal der til for at flere vælger at arbejde og bo i Norddjurs?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 1 },
    { id: "q6", theme_id: "t3", title: "Arbejdsmarked", body: "Hvordan kan kommunen bedst hjælpe dem, der står uden for arbejdsmarkedet?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 2 },
    { id: "q7", theme_id: "t4", title: "Fremtidsvision", body: "Hvordan skal Norddjurs se ud om 10 år, når det handler om natur og klima?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 1 },
    { id: "q8", theme_id: "t4", title: "Klimahandling", body: "Hvad er det vigtigste, kommunen kan gøre for klimaet lige nu?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 2 },
    { id: "q9", theme_id: "t5", title: "Fritidstilbud", body: "Hvad mangler der af kultur- og fritidstilbud i dit område?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 1 },
    { id: "q10", theme_id: "t5", title: "Foreningsliv", body: "Hvordan kan vi få flere til at deltage i foreningslivet?", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 2 },
  ],
  responses: [],
  metadata: [],
  citizens: [],
  adminUsers: [
    { id: "a1", email: "admin@norddjurs.dk", password: "norddjurs2025", name: "Administrator" },
    { id: "a2", email: "nicklas@norddjurs.dk", password: "norddjurs2025", name: "Nicklas" },
  ],
  aiSettings: {
    systemPrompt: `Du er en venlig og nysgerrig samtalepartner i en borgerdialog for Norddjurs Kommune. Din opgave er at stille ét opfølgningsspørgsmål til en borger, der netop har delt sin holdning.\n\nRegler:\n- Stil KUN ét spørgsmål\n- Spørgsmålet skal være åbent (ikke ja/nej)\n- Brug et uformelt, venligt dansk\n- Hold det kort (max 2 sætninger)\n- Vær nysgerrig, ikke konfronterende\n- Brug aldrig fagsprog eller politisk jargon`,
    perspectiveThreshold: 30,
  },
});

// ─── Utility ───
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmt = (d) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onloadend = () => resolve(reader.result);
  reader.onerror = reject;
  reader.readAsDataURL(blob);
});

const base64ToBlob = (dataUrl) => {
  const [header, data] = dataUrl.split(",");
  const mime = header.match(/:(.*?);/)[1];
  const bytes = atob(data);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
};

const AREAS = ["Grenaa", "Auning", "Ørsted", "Glesborg", "Allingåbro", "Bønnerup", "Trustrup", "Vivild", "Hemmed", "Ørum", "Andet"];
const AGE_GROUPS = ["Under 18", "18-29", "30-44", "45-59", "60-74", "75+"];
const ROLES = ["Borger", "Medarbejder i kommunen", "Erhvervsdrivende", "Andet"];

// ─── Transcription ───
const TRANSCRIBE_URL = "http://localhost:8321/transcribe";

const transcribeAudio = async (blob) => {
  try {
    const formData = new FormData();
    formData.append("file", blob, "optagelse.webm");
    const res = await fetch(TRANSCRIBE_URL, { method: "POST", body: formData });
    if (!res.ok) throw new Error("Transcription failed");
    const data = await res.json();
    return data.text || null;
  } catch (e) {
    console.warn("Transskribering ikke tilgængelig:", e.message);
    return null;
  }
};

// ─── AI Follow-up ───
const generateFollowup = async (answer, questionText, themeName, aiSettings, otherResponses) => {
  const hasPerspectives = otherResponses && otherResponses.length >= (aiSettings?.perspectiveThreshold || 30);
  let perspectiveBlock = "";
  if (hasPerspectives) {
    const sample = otherResponses.slice(-20).map(r => r.text_content).filter(Boolean).join("\n- ");
    perspectiveBlock = `\nDu har også adgang til en sammenfatning af, hvad andre borgere har sagt om det samme emne. Brug det til at skabe dialog — fx: "Mange andre nævner X — hvad tænker du om det?" Men gør det naturligt, ikke som en quiz.\n\nAndre borgeres perspektiver:\n- ${sample}`;
  }

  const systemPrompt = aiSettings?.systemPrompt || defaultDB().aiSettings.systemPrompt;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `${systemPrompt}${perspectiveBlock}\n\nBorgerens svar:\n${answer}\n\nTema: ${themeName}\nSpørgsmål borgeren svarede på: ${questionText}\n\nStil ét opfølgningsspørgsmål:`
        }],
      }),
    });
    const data = await res.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    return text.trim();
  } catch (e) {
    console.error("AI followup error:", e);
    return "Kan du fortælle lidt mere om, hvad der ligger bag din holdning?";
  }
};

// ─── AI Analysis for dashboard ───
const generateAnalysis = async (responses, type) => {
  if (!responses.length) return null;
  const sample = responses.slice(-50).map(r => r.text_content).filter(Boolean);
  if (!sample.length) return null;

  const prompts = {
    sentiment: `Analysér disse borgersvar og klassificér dem som positiv, neutral eller negativ. Svar KUN med JSON: {"positiv": <antal>, "neutral": <antal>, "negativ": <antal>}\n\nSvar:\n${sample.map((s,i) => `${i+1}. ${s}`).join("\n")}`,
    themes: `Identificér de 5 vigtigste temaer/emner i disse borgersvar. Svar KUN med JSON: [{"tema": "...", "antal": <antal>}, ...]\n\nSvar:\n${sample.map((s,i) => `${i+1}. ${s}`).join("\n")}`,
    quotes: `Udvælg de 3 mest repræsentative og stærke citater fra disse borgersvar. Svar KUN med JSON: [{"citat": "...", "kontekst": "kort beskrivelse"}]\n\nSvar:\n${sample.map((s,i) => `${i+1}. ${s}`).join("\n")}`,
  };

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{ role: "user", content: prompts[type] }],
      }),
    });
    const data = await res.json();
    const text = data.content?.map(c => c.text || "").join("") || "";
    const cleaned = text.replace(/```json|```/g, "").trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
};

// ─── Fonts ───
const fontLink = "https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,400&family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,500;0,9..144,700;1,9..144,400&display=swap";

// ─── Styles ───
const css = `
@import url('${fontLink}');

:root {
  --bg: #F7F5F0;
  --fg: #1A1A18;
  --primary: #2D5A3D;
  --primary-light: #3E7A54;
  --primary-pale: #E8F0EB;
  --accent: #D4763A;
  --accent-light: #F0C9A8;
  --muted: #8A8678;
  --border: #D8D4CB;
  --card: #FFFFFF;
  --danger: #C04040;
  --success: #2D7A4D;
}

* { margin: 0; padding: 0; box-sizing: border-box; }

body, #root {
  font-family: 'DM Sans', sans-serif;
  background: var(--bg);
  color: var(--fg);
  min-height: 100vh;
  -webkit-font-smoothing: antialiased;
}

h1, h2, h3 { font-family: 'Fraunces', serif; }

.fade-in {
  animation: fadeUp 0.5s ease-out both;
}
@keyframes fadeUp {
  from { opacity: 0; transform: translateY(16px); }
  to { opacity: 1; transform: translateY(0); }
}

.pulse {
  animation: pulse 2s ease-in-out infinite;
}
@keyframes pulse {
  0%, 100% { transform: scale(1); }
  50% { transform: scale(1.06); }
}

.recording-ring {
  animation: ringPulse 1.5s ease-in-out infinite;
}
@keyframes ringPulse {
  0%, 100% { box-shadow: 0 0 0 0 rgba(208, 64, 64, 0.4); }
  50% { box-shadow: 0 0 0 18px rgba(208, 64, 64, 0); }
}

.spin { animation: spin 1s linear infinite; }
@keyframes spin {
  to { transform: rotate(360deg); }
}

input, textarea, select {
  font-family: 'DM Sans', sans-serif;
  font-size: 16px;
}

/* Custom scrollbar */
::-webkit-scrollbar { width: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
`;

// ─── Icons as simple SVG components ───
const Icon = ({ name, size = 24, color = "currentColor" }) => {
  const icons = {
    mic: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>,
    stop: <svg width={size} height={size} viewBox="0 0 24 24" fill={color}><rect x="4" y="4" width="16" height="16" rx="2"/></svg>,
    check: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>,
    arrow: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
    skip: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>,
    back: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>,
    chart: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
    list: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
    settings: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
    questions: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
    download: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>,
    logout: <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1-2 2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>,
    sparkle: <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"><path d="M12 2L14.5 9.5L22 12L14.5 14.5L12 22L9.5 14.5L2 12L9.5 9.5L12 2Z"/></svg>,
    play: <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  };
  return icons[name] || null;
};

// ─── Audio Recorder Component ───
const AudioRecorder = ({ onRecorded }) => {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [audioBlob, setAudioBlob] = useState(null);
  const mediaRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
      chunksRef.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunksRef.current.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioBlob(blob);
        stream.getTracks().forEach(t => t.stop());
      };
      mediaRef.current = mr;
      mr.start(200);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(p => {
        if (p >= 179) { mr.stop(); setRecording(false); clearInterval(timerRef.current); }
        return p + 1;
      }), 1000);
    } catch {
      alert("Kunne ikke få adgang til mikrofonen. Tillad venligst mikrofon-adgang.");
    }
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
    clearInterval(timerRef.current);
  };

  const confirmAudio = () => {
    onRecorded(audioBlob);
  };

  const resetAudio = () => {
    setAudioBlob(null);
    setElapsed(0);
  };

  const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  if (audioBlob) {
    return (
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <audio controls src={URL.createObjectURL(audioBlob)} style={{ width: "100%", maxWidth: 360, borderRadius: 12 }} />
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Varighed: {fmtTime(elapsed)}</p>
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={resetAudio} style={{ padding: "12px 24px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 15, fontWeight: 500 }}>Optag igen</button>
          <button onClick={confirmAudio} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 15, fontWeight: 600 }}>Brug optagelse</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
      <button
        onClick={recording ? stopRecording : startRecording}
        className={recording ? "recording-ring" : "pulse"}
        style={{
          width: 96, height: 96, borderRadius: "50%",
          border: "none",
          background: recording ? "var(--danger)" : "var(--accent)",
          color: "#fff", cursor: "pointer",
          display: "flex", alignItems: "center", justifyContent: "center",
          transition: "background 0.2s",
          boxShadow: recording ? undefined : "0 4px 20px rgba(212, 118, 58, 0.3)",
        }}
      >
        {recording ? <Icon name="stop" size={36} color="#fff" /> : <Icon name="mic" size={40} color="#fff" />}
      </button>
      <p style={{ color: recording ? "var(--danger)" : "var(--muted)", fontSize: 15, fontWeight: recording ? 600 : 400 }}>
        {recording ? `Optager... ${fmtTime(elapsed)} / 3:00` : "Tryk for at optage (max 3 min)"}
      </p>
    </div>
  );
};

// ─── Simple Bar Chart ───
const BarChart = ({ data, maxVal }) => {
  const max = maxVal || Math.max(...data.map(d => d.value), 1);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {data.map((d, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 13, color: "var(--muted)", width: 120, textAlign: "right", flexShrink: 0 }}>{d.label}</span>
          <div style={{ flex: 1, height: 28, background: "var(--primary-pale)", borderRadius: 6, overflow: "hidden" }}>
            <div style={{
              width: `${(d.value / max) * 100}%`, height: "100%",
              background: `linear-gradient(90deg, var(--primary), var(--primary-light))`,
              borderRadius: 6, transition: "width 0.6s ease",
              display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8,
            }}>
              {d.value > 0 && <span style={{ fontSize: 12, fontWeight: 600, color: "#fff" }}>{d.value}</span>}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};

// ─── Donut Chart ───
const DonutChart = ({ data, size = 160 }) => {
  const total = data.reduce((a, d) => a + d.value, 0) || 1;
  const colors = ["#2D5A3D", "#D4763A", "#5B8FA8", "#A0783C", "#7A5C8D", "#C04040"];
  let cumAngle = 0;

  const paths = data.filter(d => d.value > 0).map((d, i) => {
    const angle = (d.value / total) * 360;
    const startAngle = cumAngle;
    cumAngle += angle;
    const r = size / 2 - 4;
    const ir = r * 0.55;
    const cx = size / 2, cy = size / 2;
    const toRad = a => (a - 90) * Math.PI / 180;
    const sx = cx + r * Math.cos(toRad(startAngle));
    const sy = cy + r * Math.sin(toRad(startAngle));
    const ex = cx + r * Math.cos(toRad(startAngle + angle));
    const ey = cy + r * Math.sin(toRad(startAngle + angle));
    const isx = cx + ir * Math.cos(toRad(startAngle + angle));
    const isy = cy + ir * Math.sin(toRad(startAngle + angle));
    const iex = cx + ir * Math.cos(toRad(startAngle));
    const iey = cy + ir * Math.sin(toRad(startAngle));
    const large = angle > 180 ? 1 : 0;
    const path = `M${sx},${sy} A${r},${r} 0 ${large},1 ${ex},${ey} L${isx},${isy} A${ir},${ir} 0 ${large},0 ${iex},${iey} Z`;
    return <path key={i} d={path} fill={colors[i % colors.length]} />;
  });

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 20, flexWrap: "wrap" }}>
      <svg width={size} height={size}>{paths}</svg>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {data.filter(d => d.value > 0).map((d, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}>
            <div style={{ width: 12, height: 12, borderRadius: 3, background: colors[i % colors.length] }} />
            <span>{d.label}: {d.value} ({Math.round(d.value / total * 100)}%)</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════
// ─── CITIZEN FLOW ─────────────────────────────
// ═══════════════════════════════════════════════


const CitizenFlow = ({ db, setDB, onAdminClick }) => {
  // Steps: 0=welcome, 1=auth, 2=consent, 3=theme, 4=question, 5=followup, 6=metadata, 7=thanks, 8=profile
  const [step, setStep] = useState(0);
  const [citizen, setCitizen] = useState(null);
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authError, setAuthError] = useState("");
  const [consent, setConsent] = useState(false);
  const [shareMetadata, setShareMetadata] = useState(null);
  const [selectedTheme, setSelectedTheme] = useState(null);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [answerType, setAnswerType] = useState("text");
  const [audioBlob, setAudioBlob] = useState(null);
  const [followupQ, setFollowupQ] = useState("");
  const [followupAnswer, setFollowupAnswer] = useState("");
  const [followupAnswerType, setFollowupAnswerType] = useState("text");
  const [followupAudioBlob, setFollowupAudioBlob] = useState(null);
  const [loading, setLoading] = useState(false);
  const [metaAge, setMetaAge] = useState("");
  const [metaArea, setMetaArea] = useState("");
  const [metaRole, setMetaRole] = useState("");
  const [inputMode, setInputMode] = useState("text");
  const [followupInputMode, setFollowupInputMode] = useState("text");
  const [profileConfirmDelete, setProfileConfirmDelete] = useState(false);
  const [metaSaved, setMetaSaved] = useState(false);
  const sessionId = useRef(uid());
  const startTime = useRef(Date.now());
  const prevStep = useRef(0);

  const loadCitizenMeta = (cit) => {
    const meta = db.metadata.find(m => m.citizen_id === cit.id);
    if (meta) { setMetaAge(meta.age_group || ""); setMetaArea(meta.area || ""); setMetaRole(meta.role || ""); }
  };

  // ─── Auth ───
  const handleRegister = async () => {
    if (!authEmail.trim() || !authCode.trim()) { setAuthError("Udfyld både email og kode"); return; }
    if (authCode.length < 4) { setAuthError("Koden skal være mindst 4 tegn"); return; }
    if (db.citizens.find(c => c.email.toLowerCase() === authEmail.trim().toLowerCase())) { setAuthError("Denne email er allerede registreret — prøv at logge ind"); return; }
    const newCitizen = { id: uid(), email: authEmail.trim().toLowerCase(), code: authCode, created_at: new Date().toISOString(), consent_given: false };
    const updatedDB = { ...db, citizens: [...db.citizens, newCitizen] };
    setDB(updatedDB); await saveDB(updatedDB);
    setCitizen(newCitizen); setAuthError(""); setStep(2);
  };

  const handleLogin = async () => {
    if (!authEmail.trim() || !authCode.trim()) { setAuthError("Udfyld både email og kode"); return; }
    const found = db.citizens.find(c => c.email.toLowerCase() === authEmail.trim().toLowerCase() && c.code === authCode);
    if (!found) { setAuthError("Forkert email eller kode"); return; }
    setCitizen(found); loadCitizenMeta(found); setAuthError("");
    if (found.consent_given) { setConsent(true); setShareMetadata(true); setStep(3); }
    else { setStep(2); }
  };

  const handleLogout = () => { setCitizen(null); setAuthEmail(""); setAuthCode(""); setAuthError(""); setStep(0); };

  // ─── Profile actions ───
  const handleDeleteAllData = async () => {
    if (!citizen) return;
    db.responses.filter(r => r.citizen_id === citizen.id).forEach(r => {
      try { window.storage.delete(`audio-${r.id}`); } catch {}
    });
    const updatedDB = { ...db, responses: db.responses.filter(r => r.citizen_id !== citizen.id), metadata: db.metadata.filter(m => m.citizen_id !== citizen.id), citizens: db.citizens.filter(c => c.id !== citizen.id) };
    setDB(updatedDB); await saveDB(updatedDB);
    setCitizen(null); setProfileConfirmDelete(false); setStep(0);
  };

  const handleSaveMetadata = async () => {
    if (!citizen) return;
    const existingIdx = db.metadata.findIndex(m => m.citizen_id === citizen.id);
    const meta = { id: existingIdx >= 0 ? db.metadata[existingIdx].id : uid(), citizen_id: citizen.id, session_id: sessionId.current, age_group: metaAge, area: metaArea, role: metaRole, device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop", time_spent_seconds: Math.round((Date.now() - startTime.current) / 1000), created_at: existingIdx >= 0 ? db.metadata[existingIdx].created_at : new Date().toISOString(), updated_at: new Date().toISOString() };
    let updatedMeta = [...db.metadata];
    if (existingIdx >= 0) updatedMeta[existingIdx] = meta; else updatedMeta.push(meta);
    const updatedDB = { ...db, metadata: updatedMeta };
    setDB(updatedDB); await saveDB(updatedDB);
    setMetaSaved(true); setTimeout(() => setMetaSaved(false), 2000);
  };

  const handleConsent = async () => {
    if (!consent || !citizen) return;
    const updatedCitizens = db.citizens.map(c => c.id === citizen.id ? { ...c, consent_given: true } : c);
    const updatedDB = { ...db, citizens: updatedCitizens };
    setCitizen({ ...citizen, consent_given: true });
    setDB(updatedDB); await saveDB(updatedDB); setStep(3);
  };

  const themeQuestions = selectedTheme ? db.questions.filter(q => q.theme_id === selectedTheme.id && q.is_active).sort((a,b) => a.sort_order - b.sort_order) : [];
  const currentQuestion = themeQuestions[questionIndex] || null;

  const goToNextQuestion = () => {
    setAnswer(""); setAudioBlob(null); setAnswerType("text"); setInputMode("text");
    setFollowupQ(""); setFollowupAnswer(""); setFollowupAudioBlob(null); setFollowupAnswerType("text"); setFollowupInputMode("text");
    if (questionIndex + 1 < themeQuestions.length) { setQuestionIndex(questionIndex + 1); setStep(4); }
    else { setStep(shareMetadata ? 6 : 7); }
  };

  const submitAnswer = async () => {
    if (answerType === "text" && answer.trim().length < 20) return;
    setLoading(true);
    const responseId = uid();
    let textContent = answerType === "text" ? answer : "[Lydbesvarelse — transskriberer...]";
    let audioBase64 = null;
    if (audioBlob) {
      try { audioBase64 = await blobToBase64(audioBlob); } catch {}
      const transcript = await transcribeAudio(audioBlob);
      textContent = transcript || "[Lydbesvarelse — transskribering ikke tilgængelig]";
    }
    const newResponse = { id: responseId, question_id: currentQuestion.id, citizen_id: citizen?.id || null, session_id: sessionId.current, response_type: answerType, text_content: textContent, media_url: audioBase64, media_duration_seconds: audioBlob ? Math.round(audioBlob.size / 6000) : null, is_followup: false, parent_response_id: null, followup_question_text: null, created_at: new Date().toISOString() };
    const updatedDB = { ...db, responses: [...db.responses, newResponse] };
    setDB(updatedDB); await saveDB(updatedDB);
    if (currentQuestion.allow_followup) {
      const otherResponses = db.responses.filter(r => r.question_id === currentQuestion.id && !r.is_followup);
      const fq = await generateFollowup(textContent, currentQuestion.body, selectedTheme.name, db.aiSettings, otherResponses);
      setFollowupQ(fq);
    }
    setLoading(false); setStep(5);
  };

  const submitFollowup = async () => {
    let textContent = followupAnswerType === "text" ? followupAnswer : "[Lydbesvarelse — transskriberer...]";
    const parentResp = db.responses.filter(r => r.session_id === sessionId.current && !r.is_followup).pop();
    let audioBase64 = null;
    if (followupAudioBlob) {
      try { audioBase64 = await blobToBase64(followupAudioBlob); } catch {}
      const transcript = await transcribeAudio(followupAudioBlob);
      textContent = transcript || "[Lydbesvarelse — transskribering ikke tilgængelig]";
    }
    const newResponse = { id: uid(), question_id: currentQuestion.id, citizen_id: citizen?.id || null, session_id: sessionId.current, response_type: followupAnswerType, text_content: textContent, media_url: audioBase64, media_duration_seconds: followupAudioBlob ? Math.round(followupAudioBlob.size / 6000) : null, is_followup: true, parent_response_id: parentResp?.id || null, followup_question_text: followupQ, created_at: new Date().toISOString() };
    const updatedDB = { ...db, responses: [...db.responses, newResponse] };
    setDB(updatedDB); await saveDB(updatedDB); goToNextQuestion();
  };

  const submitMetadata = async () => {
    const existingIdx = db.metadata.findIndex(m => m.citizen_id === citizen?.id);
    const meta = { id: existingIdx >= 0 ? db.metadata[existingIdx].id : uid(), citizen_id: citizen?.id || null, session_id: sessionId.current, age_group: metaAge, area: metaArea, role: metaRole, device_type: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "desktop", time_spent_seconds: Math.round((Date.now() - startTime.current) / 1000), created_at: new Date().toISOString() };
    let updatedMeta = [...db.metadata];
    if (existingIdx >= 0) updatedMeta[existingIdx] = { ...db.metadata[existingIdx], ...meta, id: db.metadata[existingIdx].id };
    else updatedMeta.push(meta);
    const updatedDB = { ...db, metadata: updatedMeta };
    setDB(updatedDB); await saveDB(updatedDB); setStep(7);
  };

  const cs = { maxWidth: 480, margin: "0 auto", minHeight: "100vh", padding: "24px 20px", display: "flex", flexDirection: "column" };
  const bp = { width: "100%", padding: "18px 24px", borderRadius: 16, border: "none", background: "var(--primary)", color: "#fff", fontSize: 17, fontWeight: 600, cursor: "pointer", fontFamily: "DM Sans", transition: "all 0.2s", boxShadow: "0 2px 12px rgba(45, 90, 61, 0.2)" };
  const bs = { ...bp, background: "transparent", color: "var(--primary)", border: "2px solid var(--primary)", boxShadow: "none" };

  const ProfileBtn = () => citizen ? (
    <button onClick={() => { prevStep.current = step; setStep(8); }} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>👤 Min profil</button>
  ) : null;

  const BackBtn = ({ onClick, label = "Tilbage" }) => (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 14, fontFamily: "DM Sans" }}>
      <Icon name="back" size={18} /> {label}
    </button>
  );

  const TopBar = ({ onBack, backLabel }) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
      <BackBtn onClick={onBack} label={backLabel} />
      <ProfileBtn />
    </div>
  );

  // ── Step 0: Welcome ──
  if (step === 0) return (
    <div style={cs} className="fade-in">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: 20, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, boxShadow: "0 8px 24px rgba(45, 90, 61, 0.25)" }}>
          <span style={{ fontSize: 36 }}>🗣️</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, lineHeight: 1.2 }}>Stemmer fra Norddjus</h1>
        <p style={{ fontSize: 17, color: "var(--muted)", lineHeight: 1.6, maxWidth: 340, marginBottom: 40 }}>Vi vil gerne høre din holdning til kommunens prioriteringer. Det tager kun 2-4 minutter.</p>
        <button onClick={() => setStep(1)} style={bp}>Kom i gang</button>
        <button onClick={onAdminClick} style={{ marginTop: 40, background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "DM Sans", opacity: 0.5 }}>Admin</button>
      </div>
    </div>
  );

  // ── Step 1: Auth ──
  if (step === 1) return (
    <div style={cs} className="fade-in">
      <BackBtn onClick={() => setStep(0)} />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginTop: 24 }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{authMode === "login" ? "Log ind" : "Opret konto"}</h2>
        <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>
          {authMode === "login" ? "Log ind for at se og administrere dine svar." : "Opret en konto så du altid kan se, ændre eller slette dine svar."}
        </p>
        {authError && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 14, padding: "10px 14px", background: "#FEF2F2", borderRadius: 10 }}>{authError}</p>}
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Email</label>
          <input type="email" value={authEmail} onChange={e => { setAuthEmail(e.target.value); setAuthError(""); }} placeholder="din@email.dk"
            style={{ width: "100%", padding: 16, borderRadius: 14, border: "2px solid var(--border)", fontSize: 16, outline: "none" }}
            onFocus={e => e.target.style.borderColor = "var(--primary)"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
        </div>
        <div style={{ marginBottom: 24 }}>
          <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>
            Personlig kode {authMode === "register" && <span style={{ fontWeight: 400, color: "var(--muted)" }}>— vælg selv (min. 4 tegn)</span>}
          </label>
          <input type="password" value={authCode} onChange={e => { setAuthCode(e.target.value); setAuthError(""); }}
            placeholder={authMode === "register" ? "Vælg en kode du kan huske" : "Din kode"}
            onKeyDown={e => e.key === "Enter" && (authMode === "login" ? handleLogin() : handleRegister())}
            style={{ width: "100%", padding: 16, borderRadius: 14, border: "2px solid var(--border)", fontSize: 16, outline: "none" }}
            onFocus={e => e.target.style.borderColor = "var(--primary)"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
        </div>
        <button onClick={authMode === "login" ? handleLogin : handleRegister} style={bp}>
          {authMode === "login" ? "Log ind" : "Opret konto"}
        </button>
        <button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}
          style={{ marginTop: 16, background: "none", border: "none", color: "var(--primary)", fontSize: 15, cursor: "pointer", fontFamily: "DM Sans", fontWeight: 500 }}>
          {authMode === "login" ? "Har du ikke en konto? Opret én her" : "Har du allerede en konto? Log ind"}
        </button>
      </div>
    </div>
  );

  // ── Step 2: Consent ──
  if (step === 2) return (
    <div style={cs} className="fade-in">
      <TopBar onBack={() => setStep(1)} backLabel="Tilbage" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 16 }}>Før vi starter</h2>
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, marginBottom: 24, border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 15, lineHeight: 1.7, marginBottom: 16 }}>Dine svar bruges til at give politikerne i Norddjurs Kommune indblik i borgernes holdninger. Alle svar behandles fortroligt og i overensstemmelse med GDPR.</p>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6 }}>Du kan til enhver tid logge ind og trække dit samtykke tilbage — så slettes alle dine data. Undgå venligst at nævne dit fulde navn i lydoptagelser.</p>
        </div>
        <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", marginBottom: 28, padding: 16, background: consent ? "var(--primary-pale)" : "var(--card)", borderRadius: 14, border: `2px solid ${consent ? "var(--primary)" : "var(--border)"}`, transition: "all 0.2s" }}>
          <div onClick={() => setConsent(!consent)} style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${consent ? "var(--primary)" : "var(--border)"}`, background: consent ? "var(--primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all 0.2s" }}>
            {consent && <Icon name="check" size={16} color="#fff" />}
          </div>
          <span onClick={() => setConsent(!consent)} style={{ fontSize: 15, lineHeight: 1.5 }}>Jeg giver samtykke til, at mine svar bruges i forbindelse med Norddjurs Kommunes budgetproces.</span>
        </label>
        <h3 style={{ fontSize: 17, fontWeight: 600, marginBottom: 14 }}>Vil du dele lidt om dig selv?</h3>
        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 28 }}>
          {[{ val: false, label: "Spring metadata over", desc: "Kun dine svar gemmes" }, { val: true, label: "Del lidt om mig selv", desc: "Alder, område og rolle (kan ændres senere)" }].map(opt => (
            <button key={String(opt.val)} onClick={() => setShareMetadata(opt.val)} style={{ padding: "16px 18px", borderRadius: 14, textAlign: "left", border: `2px solid ${shareMetadata === opt.val ? "var(--primary)" : "var(--border)"}`, background: shareMetadata === opt.val ? "var(--primary-pale)" : "var(--card)", cursor: "pointer", transition: "all 0.2s" }}>
              <div style={{ fontWeight: 600, fontSize: 15, fontFamily: "DM Sans" }}>{opt.label}</div>
              <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, fontFamily: "DM Sans" }}>{opt.desc}</div>
            </button>
          ))}
        </div>
        <button onClick={handleConsent} disabled={!consent || shareMetadata === null} style={{ ...bp, opacity: consent && shareMetadata !== null ? 1 : 0.4, cursor: consent && shareMetadata !== null ? "pointer" : "not-allowed" }}>Fortsæt</button>
      </div>
    </div>
  );

  // ── Step 3: Theme ──
  if (step === 3) return (
    <div style={cs} className="fade-in">
      <TopBar onBack={() => setStep(2)} backLabel="Tilbage" />
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Vælg et tema</h2>
      <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>Hvad vil du gerne sige noget om?</p>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {db.themes.sort((a,b) => a.sort_order - b.sort_order).map(theme => {
          const qCount = db.questions.filter(q => q.theme_id === theme.id && q.is_active).length;
          return (
            <button key={theme.id} onClick={() => { if(qCount > 0) { setSelectedTheme(theme); setQuestionIndex(0); setStep(4); }}}
              style={{ padding: "22px 20px", borderRadius: 16, border: "2px solid var(--border)", background: "var(--card)", cursor: qCount > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 16, transition: "all 0.2s", textAlign: "left", opacity: qCount > 0 ? 1 : 0.4 }}
              onMouseEnter={e => { if(qCount > 0) { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "var(--primary-pale)"; }}}
              onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}>
              <span style={{ fontSize: 32 }}>{theme.icon}</span>
              <div>
                <div style={{ fontWeight: 600, fontSize: 16, fontFamily: "DM Sans" }}>{theme.name}</div>
                <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2, fontFamily: "DM Sans" }}>{qCount} aktive spørgsmål</div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );

  // ── Step 4: Question ──
  if (step === 4 && currentQuestion) return (
    <div style={cs} className="fade-in">
      <TopBar onBack={() => { setStep(3); setSelectedTheme(null); setAnswer(""); setAudioBlob(null); }} backLabel="Skift tema" />
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <div style={{ background: "var(--primary-pale)", borderRadius: 12, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span>{selectedTheme.icon}</span><span style={{ fontSize: 13, fontWeight: 500, color: "var(--primary)" }}>{selectedTheme.name}</span>
        </div>
        <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>Spørgsmål {questionIndex + 1} af {themeQuestions.length}</span>
      </div>
      <div style={{ width: "100%", height: 4, background: "var(--border)", borderRadius: 2, marginBottom: 24 }}>
        <div style={{ width: `${((questionIndex + 1) / themeQuestions.length) * 100}%`, height: "100%", background: "var(--primary)", borderRadius: 2, transition: "width 0.4s ease" }} />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 28 }}>{currentQuestion.body}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["text", "audio"].map(mode => (
          <button key={mode} onClick={() => { setInputMode(mode); setAnswerType(mode); }}
            style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `2px solid ${inputMode === mode ? "var(--primary)" : "var(--border)"}`, background: inputMode === mode ? "var(--primary-pale)" : "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
            {mode === "text" ? "✏️ Skriv" : "🎤 Tal"}
          </button>
        ))}
      </div>
      {inputMode === "text" ? (
        <div style={{ marginBottom: 20 }}>
          <textarea value={answer} onChange={e => setAnswer(e.target.value)} placeholder="Skriv dit svar her..."
            style={{ width: "100%", minHeight: 140, padding: 16, borderRadius: 14, border: "2px solid var(--border)", background: "var(--card)", resize: "vertical", fontSize: 16, lineHeight: 1.6, outline: "none" }}
            onFocus={e => e.target.style.borderColor = "var(--primary)"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
          <p style={{ fontSize: 13, color: answer.length >= 20 ? "var(--success)" : "var(--muted)", marginTop: 8 }}>{answer.length}/20 tegn minimum</p>
        </div>
      ) : (
        <div style={{ marginBottom: 20, padding: 24, background: "var(--card)", borderRadius: 16, border: "1px solid var(--border)" }}>
          <AudioRecorder onRecorded={(blob) => { setAudioBlob(blob); setAnswerType("audio"); }} />
        </div>
      )}
      <button onClick={submitAnswer} disabled={loading || (answerType === "text" && answer.trim().length < 20) || (answerType === "audio" && !audioBlob)}
        style={{ ...bp, opacity: loading || (answerType === "text" && answer.trim().length < 20) || (answerType === "audio" && !audioBlob) ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        {loading ? (<><div className="spin" style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%" }} /> {answerType === "audio" ? "Transskriberer..." : "Genererer opfølgning..."}</>) : (<>Send svar <Icon name="arrow" size={20} color="#fff" /></>)}
      </button>
    </div>
  );

  // ── Step 5: Follow-up ──
  if (step === 5) return (
    <div style={cs} className="fade-in">
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: "var(--accent)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon name="sparkle" size={16} color="#fff" /></div>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--accent)" }}>Opfølgning</span>
        </div>
        <ProfileBtn />
      </div>
      <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.4, marginBottom: 28 }}>{followupQ || "Kan du fortælle lidt mere om din holdning?"}</h2>
      <div style={{ display: "flex", gap: 8, marginBottom: 20 }}>
        {["text", "audio"].map(mode => (
          <button key={mode} onClick={() => { setFollowupInputMode(mode); setFollowupAnswerType(mode); }}
            style={{ flex: 1, padding: "12px 16px", borderRadius: 12, border: `2px solid ${followupInputMode === mode ? "var(--primary)" : "var(--border)"}`, background: followupInputMode === mode ? "var(--primary-pale)" : "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 500, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, transition: "all 0.2s" }}>
            {mode === "text" ? "✏️ Skriv" : "🎤 Tal"}
          </button>
        ))}
      </div>
      {followupInputMode === "text" ? (
        <textarea value={followupAnswer} onChange={e => setFollowupAnswer(e.target.value)} placeholder="Skriv dit svar her..."
          style={{ width: "100%", minHeight: 120, padding: 16, borderRadius: 14, border: "2px solid var(--border)", background: "var(--card)", resize: "vertical", fontSize: 16, lineHeight: 1.6, outline: "none", marginBottom: 20 }}
          onFocus={e => e.target.style.borderColor = "var(--primary)"} onBlur={e => e.target.style.borderColor = "var(--border)"} />
      ) : (
        <div style={{ marginBottom: 20, padding: 24, background: "var(--card)", borderRadius: 16, border: "1px solid var(--border)" }}>
          <AudioRecorder onRecorded={(blob) => { setFollowupAudioBlob(blob); setFollowupAnswerType("audio"); }} />
        </div>
      )}
      <button onClick={submitFollowup} disabled={(followupAnswerType === "text" && !followupAnswer.trim()) && (followupAnswerType === "audio" && !followupAudioBlob)} style={{ ...bp, marginBottom: 12 }}>Send svar</button>
      <button onClick={goToNextQuestion} style={bs}><span style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>Spring over <Icon name="skip" size={18} /></span></button>
    </div>
  );

  // ── Step 6: Metadata ──
  if (step === 6) return (
    <div style={cs} className="fade-in">
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Fortæl lidt om dig selv</h2>
      <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 28, lineHeight: 1.5 }}>Alt er frivilligt — du kan altid ændre det senere i din profil.</p>
      {[{ label: "Aldersgruppe", value: metaAge, set: setMetaAge, options: AGE_GROUPS }, { label: "Område i kommunen", value: metaArea, set: setMetaArea, options: AREAS }, { label: "Rolle", value: metaRole, set: setMetaRole, options: ROLES }].map(field => (
        <div key={field.label} style={{ marginBottom: 20 }}>
          <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{field.label}</label>
          <select value={field.value} onChange={e => field.set(e.target.value)} style={{ width: "100%", padding: "16px 14px", borderRadius: 12, border: "2px solid var(--border)", background: "var(--card)", fontSize: 16, appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238A8678' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
            <option value="">Vælg...</option>
            {field.options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      ))}
      <button onClick={submitMetadata} style={{ ...bp, marginTop: 8 }}>Afslut</button>
      <button onClick={() => setStep(7)} style={{ ...bs, marginTop: 10 }}>Spring over</button>
    </div>
  );

  // ── Step 7: Thanks ──
  if (step === 7) return (
    <div style={cs} className="fade-in">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ width: 80, height: 80, borderRadius: "50%", background: "var(--primary-pale)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}><Icon name="check" size={40} color="var(--primary)" /></div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12 }}>Tak for din stemme!</h1>
        <p style={{ fontSize: 16, color: "var(--muted)", lineHeight: 1.6, maxWidth: 340, marginBottom: 16 }}>Dit svar er med til at forme fremtidens Norddjurs.</p>
        <div style={{ background: "var(--accent-light)", borderRadius: 16, padding: "20px 24px", marginBottom: 32, maxWidth: 360 }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>📅 Borgermøde</p>
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>19. august 2025 — kom og hør, hvad borgerne i Norddjurs mener. Alle er velkomne!</p>
        </div>
        <button onClick={() => { setStep(3); setSelectedTheme(null); setQuestionIndex(0); setAnswer(""); setAudioBlob(null); setFollowupQ(""); setFollowupAnswer(""); setFollowupAudioBlob(null); setInputMode("text"); setFollowupInputMode("text"); sessionId.current = uid(); startTime.current = Date.now(); }} style={bs}>Besvar et nyt tema</button>
        <button onClick={() => { prevStep.current = 7; setStep(8); }} style={{ marginTop: 12, background: "none", border: "none", color: "var(--primary)", fontSize: 15, cursor: "pointer", fontFamily: "DM Sans", fontWeight: 500 }}>👤 Gå til min profil</button>
      </div>
    </div>
  );

  // ── Step 8: Profile ──
  if (step === 8 && citizen) {
    const myResponses = db.responses.filter(r => r.citizen_id === citizen.id && !r.is_followup);
    return (
      <div style={cs} className="fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <BackBtn onClick={() => setStep(prevStep.current || 3)} label="Tilbage" />
          <button onClick={handleLogout} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--muted)" }}>Log ud</button>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Min profil</h2>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 28 }}>{citizen.email}</p>

        {/* Metadata */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Mine oplysninger</h3>
          {[{ label: "Aldersgruppe", value: metaAge, set: setMetaAge, options: AGE_GROUPS }, { label: "Område", value: metaArea, set: setMetaArea, options: AREAS }, { label: "Rolle", value: metaRole, set: setMetaRole, options: ROLES }].map(field => (
            <div key={field.label} style={{ marginBottom: 14 }}>
              <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{field.label}</label>
              <select value={field.value} onChange={e => field.set(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)" }}>
                <option value="">Ikke angivet</option>
                {field.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}
          <button onClick={handleSaveMetadata} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {metaSaved ? "✓ Gemt!" : "Gem ændringer"}
          </button>
        </div>

        {/* My responses */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Mine besvarelser ({myResponses.length})</h3>
          {myResponses.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--muted)" }}>Du har ikke besvaret nogen spørgsmål endnu.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {myResponses.map(r => {
                const q = db.questions.find(q2 => q2.id === r.question_id);
                const t = q ? db.themes.find(t2 => t2.id === q.theme_id) : null;
                const followup = db.responses.find(f => f.parent_response_id === r.id);
                return (
                  <div key={r.id} style={{ padding: 14, background: "var(--bg)", borderRadius: 10 }}>
                    <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 500, marginBottom: 4 }}>{t?.icon} {t?.name} — {fmt(r.created_at)}</div>
                    <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{q?.body}</div>
                    <div style={{ fontSize: 14 }}>{r.text_content}</div>
                    {followup && (
                      <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 10, marginTop: 8 }}>
                        <div style={{ fontSize: 12, color: "var(--accent)", fontWeight: 500 }}>{followup.followup_question_text}</div>
                        <div style={{ fontSize: 13, marginTop: 2 }}>{followup.text_content}</div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* GDPR Delete */}
        <div style={{ background: "#FEF2F2", borderRadius: 16, padding: 20, border: "1px solid #FECACA", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8, color: "var(--danger)" }}>Træk samtykke tilbage</h3>
          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 14 }}>Dette sletter permanent alle dine svar, lydoptagelser, metadata og din konto. Handlingen kan ikke fortrydes.</p>
          {!profileConfirmDelete ? (
            <button onClick={() => setProfileConfirmDelete(true)} style={{ padding: "12px 20px", borderRadius: 10, border: "2px solid var(--danger)", background: "transparent", color: "var(--danger)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>Slet alle mine data</button>
          ) : (
            <div>
              <p style={{ fontSize: 14, fontWeight: 600, color: "var(--danger)", marginBottom: 10 }}>Er du sikker? Al data slettes permanent.</p>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={handleDeleteAllData} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--danger)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>Ja, slet alt</button>
                <button onClick={() => setProfileConfirmDelete(false)} style={{ padding: "12px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14 }}>Annuller</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
};

// ═══════════════════════════════════════════════
// ─── ADMIN PANEL ──────────────────────────────
// ═══════════════════════════════════════════════

const AdminPanel = ({ db, setDB, onLogout }) => {
  const [tab, setTab] = useState("dashboard");
  const [editingQ, setEditingQ] = useState(null);
  const [analysisResults, setAnalysisResults] = useState({});
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [filterTheme, setFilterTheme] = useState("");
  const [filterAge, setFilterAge] = useState("");
  const [filterArea, setFilterArea] = useState("");

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "chart" },
    { id: "questions", label: "Spørgsmål", icon: "questions" },
    { id: "responses", label: "Besvarelser", icon: "list" },
    { id: "settings", label: "AI-indstillinger", icon: "settings" },
  ];

  const responsesPerTheme = db.themes.map(t => ({
    label: t.icon + " " + t.name.split(" ")[0],
    value: db.responses.filter(r => {
      const q = db.questions.find(q2 => q2.id === r.question_id);
      return q && q.theme_id === t.id && !r.is_followup;
    }).length,
  }));

  const filteredResponses = db.responses.filter(r => {
    if (r.is_followup) return false;
    if (filterTheme) {
      const q = db.questions.find(q2 => q2.id === r.question_id);
      if (!q || q.theme_id !== filterTheme) return false;
    }
    if (filterAge || filterArea) {
      const meta = db.metadata.find(m => (m.citizen_id && r.citizen_id ? m.citizen_id === r.citizen_id : m.session_id === r.session_id));
      if (filterAge && (!meta || meta.age_group !== filterAge)) return false;
      if (filterArea && (!meta || meta.area !== filterArea)) return false;
    }
    return true;
  }).sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const runAnalysis = async (type) => {
    setAnalysisLoading(true);
    const textResponses = db.responses.filter(r => r.text_content && !r.text_content.startsWith("["));
    const result = await generateAnalysis(textResponses, type);
    setAnalysisResults(prev => ({ ...prev, [type]: result }));
    setAnalysisLoading(false);
  };

  const exportCSV = () => {
    const rows = [["ID", "Tema", "Spørgsmål", "Svar", "Type", "Opfølgning", "Dato", "Alder", "Område", "Rolle"]];
    db.responses.filter(r => !r.is_followup).forEach(r => {
      const q = db.questions.find(q2 => q2.id === r.question_id);
      const t = q ? db.themes.find(t2 => t2.id === q.theme_id) : null;
      const meta = db.metadata.find(m => (m.citizen_id && r.citizen_id ? m.citizen_id === r.citizen_id : m.session_id === r.session_id));
      const followup = db.responses.find(f => f.parent_response_id === r.id);
      rows.push([
        r.id, t?.name || "", q?.body || "", r.text_content || "", r.response_type,
        followup?.text_content || "", r.created_at, meta?.age_group || "", meta?.area || "", meta?.role || "",
      ]);
    });
    const csv = rows.map(row => row.map(c => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "norddjurs-besvarelser.csv"; a.click();
  };

  const saveQuestion = async (q) => {
    const updated = db.questions.map(existing => existing.id === q.id ? q : existing);
    if (!db.questions.find(e => e.id === q.id)) updated.push(q);
    const newDB = { ...db, questions: updated };
    setDB(newDB);
    await saveDB(newDB);
    setEditingQ(null);
  };

  const toggleQuestion = async (qId) => {
    const updated = db.questions.map(q => q.id === qId ? { ...q, is_active: !q.is_active } : q);
    const newDB = { ...db, questions: updated };
    setDB(newDB);
    await saveDB(newDB);
  };

  const saveAISettings = async (settings) => {
    const newDB = { ...db, aiSettings: settings };
    setDB(newDB);
    await saveDB(newDB);
  };

  const sidebarStyle = {
    width: 240, background: "var(--fg)", color: "#fff", padding: "24px 0",
    display: "flex", flexDirection: "column", flexShrink: 0, minHeight: "100vh",
  };

  const mainStyle = {
    flex: 1, padding: "32px 40px", maxWidth: 1000, overflowY: "auto",
  };

  const cardStyle = {
    background: "var(--card)", borderRadius: 16, padding: 24,
    border: "1px solid var(--border)", marginBottom: 20,
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh" }}>
      {/* Sidebar */}
      <div style={sidebarStyle}>
        <div style={{ padding: "0 20px", marginBottom: 32 }}>
          <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: "Fraunces" }}>🗣️ Norddjurs</h2>
          <p style={{ fontSize: 12, color: "rgba(255,255,255,0.5)", marginTop: 4 }}>Admin-panel</p>
        </div>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{
              display: "flex", alignItems: "center", gap: 12, padding: "12px 20px",
              background: tab === t.id ? "rgba(255,255,255,0.1)" : "transparent",
              border: "none", color: tab === t.id ? "#fff" : "rgba(255,255,255,0.6)",
              cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 500,
              width: "100%", textAlign: "left", borderLeft: tab === t.id ? "3px solid var(--accent)" : "3px solid transparent",
              transition: "all 0.15s",
            }}>
            <Icon name={t.icon} size={18} /> {t.label}
          </button>
        ))}
        <div style={{ flex: 1 }} />
        <button onClick={onLogout}
          style={{
            display: "flex", alignItems: "center", gap: 10, padding: "12px 20px",
            background: "none", border: "none", color: "rgba(255,255,255,0.5)",
            cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, width: "100%",
          }}>
          <Icon name="logout" size={16} /> Log ud
        </button>
      </div>

      {/* Main Content */}
      <div style={mainStyle}>
        {/* ── Dashboard Tab ── */}
        {tab === "dashboard" && (
          <div className="fade-in">
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Dashboard</h1>
            <p style={{ color: "var(--muted)", marginBottom: 28 }}>
              {db.responses.filter(r => !r.is_followup).length} besvarelser i alt
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Besvarelser pr. tema</h3>
                <BarChart data={responsesPerTheme} />
              </div>
              <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Aldersfordeling</h3>
                <DonutChart data={AGE_GROUPS.map(ag => ({
                  label: ag,
                  value: db.metadata.filter(m => m.age_group === ag).length,
                }))} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Områdefordeling</h3>
                <DonutChart data={AREAS.map(a => ({
                  label: a,
                  value: db.metadata.filter(m => m.area === a).length,
                }))} />
              </div>
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600 }}>AI-analyse</h3>
                </div>
                {db.responses.filter(r => r.text_content && !r.text_content.startsWith("[")).length < 3 ? (
                  <p style={{ color: "var(--muted)", fontSize: 14 }}>Mindst 3 tekstbesvarelser krævet for analyse.</p>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {[
                      { type: "sentiment", label: "Sentiment-analyse" },
                      { type: "themes", label: "Tema-klynger" },
                      { type: "quotes", label: "Stærkeste citater" },
                    ].map(a => (
                      <div key={a.type}>
                        <button onClick={() => runAnalysis(a.type)} disabled={analysisLoading}
                          style={{
                            padding: "10px 16px", borderRadius: 10, border: "1px solid var(--border)",
                            background: "var(--primary-pale)", cursor: analysisLoading ? "wait" : "pointer",
                            fontFamily: "DM Sans", fontSize: 13, fontWeight: 500, width: "100%", textAlign: "left",
                            display: "flex", alignItems: "center", gap: 8,
                          }}>
                          <Icon name="sparkle" size={14} color="var(--primary)" /> {a.label}
                          {analysisLoading && <span className="spin" style={{ width: 14, height: 14, border: "2px solid var(--border)", borderTop: "2px solid var(--primary)", borderRadius: "50%", marginLeft: "auto" }} />}
                        </button>
                        {analysisResults[a.type] && (
                          <pre style={{ fontSize: 12, marginTop: 8, padding: 12, background: "var(--bg)", borderRadius: 8, overflow: "auto", maxHeight: 200, whiteSpace: "pre-wrap" }}>
                            {JSON.stringify(analysisResults[a.type], null, 2)}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Questions Tab ── */}
        {tab === "questions" && (
          <div className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700 }}>Spørgsmål</h1>
              <button onClick={() => setEditingQ({ id: uid(), theme_id: db.themes[0].id, title: "", body: "", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 99 })}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>
                + Nyt spørgsmål
              </button>
            </div>

            {editingQ && (
              <div style={{ ...cardStyle, borderColor: "var(--primary)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{db.questions.find(q => q.id === editingQ.id) ? "Rediger" : "Nyt"} spørgsmål</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>Tema</label>
                    <select value={editingQ.theme_id} onChange={e => setEditingQ({ ...editingQ, theme_id: e.target.value })}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}>
                      {db.themes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>Titel</label>
                    <input value={editingQ.title} onChange={e => setEditingQ({ ...editingQ, title: e.target.value })}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }} />
                  </div>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>Spørgsmål</label>
                    <textarea value={editingQ.body} onChange={e => setEditingQ({ ...editingQ, body: e.target.value })}
                      style={{ width: "100%", minHeight: 80, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14, resize: "vertical" }} />
                  </div>
                  <div style={{ display: "flex", gap: 16 }}>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                      <input type="checkbox" checked={editingQ.allow_followup} onChange={e => setEditingQ({ ...editingQ, allow_followup: e.target.checked })} /> AI-opfølgning
                    </label>
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, cursor: "pointer" }}>
                      <input type="checkbox" checked={editingQ.is_active} onChange={e => setEditingQ({ ...editingQ, is_active: e.target.checked })} /> Aktiv
                    </label>
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => setEditingQ(null)} style={{ padding: "10px 20px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14 }}>Annuller</button>
                    <button onClick={() => saveQuestion(editingQ)} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>Gem</button>
                  </div>
                </div>
              </div>
            )}

            {db.themes.map(theme => {
              const themeQs = db.questions.filter(q => q.theme_id === theme.id).sort((a,b) => a.sort_order - b.sort_order);
              return (
                <div key={theme.id} style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{theme.icon}</span> {theme.name}
                  </h3>
                  {themeQs.map(q => (
                    <div key={q.id} style={{ ...cardStyle, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", opacity: q.is_active ? 1 : 0.5 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{q.title}</div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{q.body}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4, display: "flex", gap: 12 }}>
                          <span>{q.allow_followup ? "✅ Opfølgning" : "❌ Ingen opfølgning"}</span>
                          <span>{db.responses.filter(r => r.question_id === q.id && !r.is_followup).length} svar</span>
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => setEditingQ({ ...q })} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 12 }}>Rediger</button>
                        <button onClick={() => toggleQuestion(q.id)} style={{ padding: "6px 12px", borderRadius: 6, border: "1px solid var(--border)", background: q.is_active ? "#FEF2F2" : "var(--primary-pale)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 12, color: q.is_active ? "var(--danger)" : "var(--primary)" }}>
                          {q.is_active ? "Deaktivér" : "Aktivér"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        )}

        {/* ── Responses Tab ── */}
        {tab === "responses" && (
          <div className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700 }}>Besvarelser</h1>
              <button onClick={exportCSV} style={{ display: "flex", alignItems: "center", gap: 8, padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 500 }}>
                <Icon name="download" size={16} /> Eksportér CSV
              </button>
            </div>

            {/* Filters */}
            <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
              <select value={filterTheme} onChange={e => setFilterTheme(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
                <option value="">Alle temaer</option>
                {db.themes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
              </select>
              <select value={filterAge} onChange={e => setFilterAge(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
                <option value="">Alle aldre</option>
                {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
                <option value="">Alle områder</option>
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span style={{ fontSize: 13, color: "var(--muted)", alignSelf: "center" }}>{filteredResponses.length} resultater</span>
            </div>

            {filteredResponses.map(r => {
              const q = db.questions.find(q2 => q2.id === r.question_id);
              const t = q ? db.themes.find(t2 => t2.id === q.theme_id) : null;
              const meta = db.metadata.find(m => (m.citizen_id && r.citizen_id ? m.citizen_id === r.citizen_id : m.session_id === r.session_id));
              const followup = db.responses.find(f => f.parent_response_id === r.id);
              return (
                <div key={r.id} style={cardStyle}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ background: "var(--primary-pale)", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, color: "var(--primary)" }}>
                        {t?.icon} {t?.name?.split(" ")[0]}
                      </span>
                      <span style={{ background: r.response_type === "audio" ? "var(--accent-light)" : "var(--bg)", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                        {r.response_type === "audio" ? "🎤 Lyd" : "✏️ Tekst"}
                      </span>
                    </div>
                    <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmt(r.created_at)}</span>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{q?.body}</p>
                  {r.media_url && r.response_type === "audio" && (
                    <audio controls src={r.media_url} style={{ width: "100%", maxWidth: 400, borderRadius: 8, marginBottom: 8 }} />
                  )}
                  <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>{r.text_content}</p>
                  {followup && (
                    <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 14, marginTop: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>Opfølgning: {followup.followup_question_text}</p>
                      {followup.media_url && followup.response_type === "audio" && (
                        <audio controls src={followup.media_url} style={{ width: "100%", maxWidth: 400, borderRadius: 8, marginBottom: 6 }} />
                      )}
                      <p style={{ fontSize: 14, lineHeight: 1.5 }}>{followup.text_content}</p>
                    </div>
                  )}
                  {meta && (
                    <div style={{ display: "flex", gap: 12, marginTop: 10, flexWrap: "wrap" }}>
                      {meta.age_group && <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--bg)", padding: "2px 8px", borderRadius: 4 }}>🎂 {meta.age_group}</span>}
                      {meta.area && <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--bg)", padding: "2px 8px", borderRadius: 4 }}>📍 {meta.area}</span>}
                      {meta.role && <span style={{ fontSize: 11, color: "var(--muted)", background: "var(--bg)", padding: "2px 8px", borderRadius: 4 }}>👤 {meta.role}</span>}
                    </div>
                  )}
                </div>
              );
            })}
            {filteredResponses.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
                <p style={{ fontSize: 16 }}>Ingen besvarelser endnu</p>
                <p style={{ fontSize: 14, marginTop: 8 }}>Besvarelser dukker op her, når borgere har svaret.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Settings Tab ── */}
        {tab === "settings" && (
          <div className="fade-in">
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>AI-indstillinger</h1>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>System-prompt til opfølgning</h3>
              <textarea value={db.aiSettings.systemPrompt}
                onChange={e => saveAISettings({ ...db.aiSettings, systemPrompt: e.target.value })}
                style={{ width: "100%", minHeight: 200, padding: 14, borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, lineHeight: 1.6, resize: "vertical", fontFamily: "DM Sans" }} />
            </div>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Perspektiv-tærskel</h3>
              <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
                Antal besvarelser før andre borgeres perspektiver inkluderes i opfølgningen.
              </p>
              <input type="number" value={db.aiSettings.perspectiveThreshold}
                onChange={e => saveAISettings({ ...db.aiSettings, perspectiveThreshold: parseInt(e.target.value) || 30 })}
                style={{ width: 100, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }} />
              <span style={{ fontSize: 14, color: "var(--muted)", marginLeft: 10 }}>svar</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════
// ─── LOGIN SCREEN ─────────────────────────────
// ═══════════════════════════════════════════════

const LoginScreen = ({ db, onLogin, onBack }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    const user = db.adminUsers.find(u => u.email === email && u.password === password);
    if (user) onLogin(user);
    else setError("Forkert email eller adgangskode");
  };

  return (
    <div style={{ maxWidth: 400, margin: "0 auto", minHeight: "100vh", padding: "24px 20px", display: "flex", flexDirection: "column", justifyContent: "center" }} className="fade-in">
      <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 14, fontFamily: "DM Sans", marginBottom: 32, alignSelf: "flex-start" }}>
        <Icon name="back" size={18} /> Tilbage til borger-flow
      </button>
      <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 24, fontFamily: "Fraunces" }}>Admin-login</h2>
      {error && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 14 }}>{error}</p>}
      <input type="email" placeholder="Email" value={email} onChange={e => { setEmail(e.target.value); setError(""); }}
        style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", marginBottom: 12, fontSize: 16 }} />
      <input type="password" placeholder="Adgangskode" value={password} onChange={e => { setPassword(e.target.value); setError(""); }}
        onKeyDown={e => e.key === "Enter" && handleLogin()}
        style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "1px solid var(--border)", marginBottom: 20, fontSize: 16 }} />
      <button onClick={handleLogin}
        style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: "var(--primary)", color: "#fff", fontSize: 16, fontWeight: 600, cursor: "pointer", fontFamily: "DM Sans" }}>
        Log ind
      </button>
      <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 16, textAlign: "center" }}>
        Test-login: admin@norddjurs.dk / norddjurs2025
      </p>
    </div>
  );
};

// ═══════════════════════════════════════════════
// ─── MAIN APP ─────────────────────────────────
// ═══════════════════════════════════════════════

export default function App() {
  const [db, setDB] = useState(null);
  const [view, setView] = useState("citizen"); // citizen | login | admin
  const [adminUser, setAdminUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const stored = await getDB();
      if (stored) {
        // Merge in any missing fields from defaults
        const def = defaultDB();
        const merged = {
          ...def,
          ...stored,
          aiSettings: { ...def.aiSettings, ...(stored.aiSettings || {}) },
        };
        // Restore audio data from separate storage keys
        const hydrated = await hydrateAudio(merged);
        setDB(hydrated);
      } else {
        const def = defaultDB();
        setDB(def);
        await saveDB(def);
      }
      setLoading(false);
    })();
  }, []);

  if (loading || !db) return (
    <div style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <style>{css}</style>
      <div className="spin" style={{ width: 32, height: 32, border: "3px solid var(--border)", borderTop: "3px solid var(--primary)", borderRadius: "50%" }} />
    </div>
  );

  return (
    <>
      <style>{css}</style>
      {view === "citizen" && (
        <CitizenFlow db={db} setDB={setDB} onAdminClick={() => setView("login")} />
      )}
      {view === "login" && (
        <LoginScreen db={db} onLogin={(user) => { setAdminUser(user); setView("admin"); }} onBack={() => setView("citizen")} />
      )}
      {view === "admin" && adminUser && (
        <AdminPanel db={db} setDB={setDB} onLogout={() => { setAdminUser(null); setView("citizen"); }} />
      )}
    </>
  );
}