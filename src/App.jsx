import { useState, useEffect, useRef } from "react";

// ─── API ───
const API_BASE = "http://localhost:8321";

const apiFetch = (path, options = {}, token = null) => {
  const headers = { ...(options.headers || {}) };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (!(options.body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
  }
  return fetch(`${API_BASE}${path}`, { ...options, headers });
};

// ─── Utility ───
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const fmt = (d) => new Date(d).toLocaleDateString("da-DK", { day: "numeric", month: "short", year: "numeric" });

const AGE_GROUPS = ["Under 25", "25-39", "40-54", "55-69", "70+"];
const CURRENT_CONSENT_VERSION = 1; // Skal matche CURRENT_CONSENT_VERSION i backend/main.py

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
  const [transcribing, setTranscribing] = useState(false);
  const [transcription, setTranscription] = useState(null);
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
        transcribeBlob(blob);
      };
      mediaRef.current = mr;
      mr.start(200);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(p => {
        if (p >= 29) { mr.stop(); setRecording(false); clearInterval(timerRef.current); }
        return p + 1;
      }), 1000);
    } catch {
      alert("Kunne ikke få adgang til mikrofonen. Tillad venligst mikrofon-adgang.");
    }
  };

  const transcribeBlob = async (blob) => {
    setTranscribing(true);
    try {
      const formData = new FormData();
      formData.append("file", blob, "optagelse.webm");
      const res = await fetch(`${API_BASE}/api/transcribe`, { method: "POST", body: formData });
      if (res.ok) {
        const data = await res.json();
        setTranscription(data.text ?? "");
      } else {
        setTranscription("");
      }
    } catch {
      setTranscription("");
    }
    setTranscribing(false);
  };

  const stopRecording = () => {
    mediaRef.current?.stop();
    setRecording(false);
    clearInterval(timerRef.current);
  };

  const confirmAudio = () => { onRecorded(audioBlob, transcription); };
  const resetAudio = () => { setAudioBlob(null); setElapsed(0); setTranscription(null); };
  const fmtTime = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,"0")}`;

  if (audioBlob) {
    return (
      <div className="fade-in" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16 }}>
        <audio controls src={URL.createObjectURL(audioBlob)} style={{ width: "100%", maxWidth: 360, borderRadius: 12 }} />
        <p style={{ color: "var(--muted)", fontSize: 14 }}>Varighed: {fmtTime(elapsed)}</p>
        {transcribing ? (
          <div style={{ display: "flex", alignItems: "center", gap: 10, color: "var(--muted)", fontSize: 14 }}>
            <div className="spin" style={{ width: 16, height: 16, border: "2px solid var(--border)", borderTop: "2px solid var(--primary)", borderRadius: "50%" }} />
            Transskriberer...
          </div>
        ) : transcription !== null && (
          <div style={{ width: "100%", padding: 14, background: "var(--primary-pale)", borderRadius: 12, border: "1px solid var(--primary)" }}>
            <p style={{ fontSize: 12, fontWeight: 600, color: "var(--primary)", marginBottom: 4 }}>Hvad vi hørte:</p>
            <p style={{ fontSize: 14, lineHeight: 1.5 }}>{transcription || "(ingen tale opfanget)"}</p>
          </div>
        )}
        <div style={{ display: "flex", gap: 12 }}>
          <button onClick={resetAudio} style={{ padding: "12px 24px", borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 15, fontWeight: 500 }}>Optag igen</button>
          <button onClick={confirmAudio} disabled={transcribing} style={{ padding: "12px 24px", borderRadius: 12, border: "none", background: "var(--primary)", color: "#fff", cursor: transcribing ? "wait" : "pointer", fontFamily: "DM Sans", fontSize: 15, fontWeight: 600, opacity: transcribing ? 0.6 : 1 }}>Brug optagelse</button>
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
        {recording ? `Optager... ${fmtTime(elapsed)} / 1:30` : "Tryk for at optage (max 90 sek)"}
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

const CitizenFlow = ({ onAdminClick }) => {
  // Steps: 0=welcome, 1=theme, 2=question, 3=auth, 4=consent, 5=followup, 6=metadata, 7=thanks, 8=profile, 9=privacy-policy, 10=change-password
  const [step, setStep] = useState(0);
  const [citizenToken, setCitizenToken] = useState(() => localStorage.getItem("citizenToken"));
  const [citizen, setCitizen] = useState(() => { try { return JSON.parse(localStorage.getItem("citizen")); } catch { return null; } });
  const [forloeb, setForloeb] = useState([]);
  const [selectedForloeb, setSelectedForloeb] = useState(null);
  const [showCitizenQuestionModal, setShowCitizenQuestionModal] = useState(false);
  const [citizenQuestionText, setCitizenQuestionText] = useState("");
  const [citizenQuestionAnonymous, setCitizenQuestionAnonymous] = useState(false);
  const [citizenQuestionSubmitting, setCitizenQuestionSubmitting] = useState(false);
  const [citizenQuestionSuccess, setCitizenQuestionSuccess] = useState(false);
  const [themes, setThemes] = useState([]);
  const [areas, setAreas] = useState([]);
  const [themeQuestions, setThemeQuestions] = useState([]);
  const [myResponses, setMyResponses] = useState([]);
  const [authMode, setAuthMode] = useState("register");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [consent, setConsent] = useState(false);
  const [pendingAnswer, setPendingAnswer] = useState(null);
  const [customArea, setCustomArea] = useState("");
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
  const [inputMode, setInputMode] = useState("text");
  const [followupInputMode, setFollowupInputMode] = useState("text");
  const [profileConfirmDelete, setProfileConfirmDelete] = useState(false);
  const [consentExpanded, setConsentExpanded] = useState(false);
  const [privacyPolicyText, setPrivacyPolicyText] = useState(null);
  const [citizenFrozen, setCitizenFrozen] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [changePasswordError, setChangePasswordError] = useState("");
  const [metaSaved, setMetaSaved] = useState(false);
  const [lastResponseId, setLastResponseId] = useState(null);
  const sessionId = useRef(uid());
  const startTime = useRef(Date.now());
  const prevStep = useRef(0);

  // Persist login i localStorage
  useEffect(() => {
    if (citizenToken && citizen) {
      localStorage.setItem("citizenToken", citizenToken);
      localStorage.setItem("citizen", JSON.stringify(citizen));
    } else {
      localStorage.removeItem("citizenToken");
      localStorage.removeItem("citizen");
    }
  }, [citizenToken, citizen]);

  // Load forloeb, themes og areas on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/forloeb`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setForloeb(data);
        if (data.length === 1) setSelectedForloeb(data[0]);
      })
      .catch(() => {});
    fetch(`${API_BASE}/api/themes`)
      .then(r => r.ok ? r.json() : [])
      .then(setThemes)
      .catch(() => {});
    fetch(`${API_BASE}/api/areas`)
      .then(r => r.ok ? r.json() : [])
      .then(setAreas)
      .catch(() => {});
  }, []);

  // Load my responses when logged in (bruges til "allerede besvaret"-tjek og profil)
  const loadMyResponses = () => {
    if (!citizenToken) return;
    apiFetch("/api/citizen/responses", {}, citizenToken)
      .then(r => r.ok ? r.json() : [])
      .then(setMyResponses)
      .catch(() => {});
  };

  useEffect(() => {
    if (citizenToken) loadMyResponses();
  }, [citizenToken]);

  // Hent privatlivspolitik når step 9 vises (opgave 12)
  useEffect(() => {
    if (step === 9 && !privacyPolicyText) {
      apiFetch("/api/privacy-policy")
        .then(r => r.ok ? r.json() : null)
        .then(data => { if (data?.text) setPrivacyPolicyText(data.text); })
        .catch(() => {});
    }
  }, [step]);

  // ─── Submit answer + hent opfølgning (kaldes efter auth + samtykke) ───
  const submitAndFollowup = async (token, citizenObj, pending) => {
    const pa = pending || pendingAnswer;
    if (!pa) { goToNextQuestion(); return; }
    setLoading(true);
    let responseId = null;
    let textContent = pa.text_content;
    let hasFollowup = false;
    try {
      if (pa.audioBlob) {
        const formData = new FormData();
        formData.append("file", pa.audioBlob, "optagelse.webm");
        const url = `${API_BASE}/api/responses/audio?question_id=${encodeURIComponent(pa.question_id)}&session_id=${encodeURIComponent(sessionId.current)}`;
        const headers = token ? { Authorization: `Bearer ${token}` } : {};
        const res = await fetch(url, { method: "POST", headers, body: formData });
        if (res.ok) {
          const data = await res.json();
          responseId = data.id;
          textContent = data.transcription || data.text_content || "[Lydbesvarelse]";
        }
      } else {
        const res = await apiFetch("/api/responses", {
          method: "POST",
          body: JSON.stringify({
            question_id: pa.question_id,
            session_id: sessionId.current,
            text_content: pa.text_content,
            response_type: "text",
            is_followup: false,
          }),
        }, token);
        if (res.ok) {
          const data = await res.json();
          responseId = data.id;
        }
      }
      setLastResponseId(responseId);
      if (pa.allowFollowup) {
        const res = await apiFetch("/api/followup", {
          method: "POST",
          body: JSON.stringify({
            answer: textContent,
            question_id: pa.question_id,
            theme_name: pa.themeName || "",
            question_text: pa.questionText || "",
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.followup_question) {
            setFollowupQ(data.followup_question);
            hasFollowup = true;
          }
        }
      }
    } catch (e) {
      console.error("Submit error:", e);
    }
    setLoading(false);
    setPendingAnswer(null);
    loadMyResponses();  // opgave 15: opdatér besvarelser efter indsendelse
    if (hasFollowup) {
      setStep(5);
    } else {
      goToNextQuestion();
    }
  };

  // ─── Saml svar lokalt (ingen API-kald endnu) ───
  const handleCollectAnswer = () => {
    if (answerType === "text" && answer.trim().length < 20) return;
    if (answerType === "audio" && !audioBlob) return;
    const pending = {
      question_id: currentQuestion.id,
      text_content: answer,
      audioBlob: audioBlob,
      response_type: answerType === "audio" ? "audio" : "text",
      allowFollowup: currentQuestion.allow_followup,
      themeName: selectedTheme?.name || selectedForloeb?.title || "",
      questionText: currentQuestion.body || "",
    };
    setPendingAnswer(pending);
    if (!citizenToken) {
      prevStep.current = 2;
      setStep(3);
    } else if (!citizen?.consent_given) {
      setStep(4);
    } else {
      submitAndFollowup(citizenToken, citizen, pending);
    }
  };

  // ─── Auth ───
  const validateEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const validatePassword = (pw) => {
    if (pw.length < 8) return "Mindst 8 tegn";
    if (!/[A-Z]/.test(pw)) return "Mindst ét stort bogstav";
    if (!/[a-z]/.test(pw)) return "Mindst ét lille bogstav";
    if (!/[0-9]/.test(pw)) return "Mindst ét tal";
    return null;
  };

  const handleRegister = async () => {
    if (!authEmail.trim() || !authPassword.trim()) { setAuthError("Udfyld både email og adgangskode"); return; }
    if (!validateEmail(authEmail)) { setAuthError("Ugyldig email-adresse"); return; }
    const pwErr = validatePassword(authPassword);
    if (pwErr) { setAuthError(pwErr); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/citizen/register", {
        method: "POST",
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      });
      if (!res.ok) {
        const err = await res.json();
        setAuthError(err.detail || "Registrering fejlede");
        return;
      }
      const data = await res.json();
      setCitizenToken(data.token);
      setCitizen(data.citizen);
      setAuthError("");
      setStep(4);
    } catch {
      setAuthError("Kunne ikke forbinde til serveren");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!authEmail.trim() || !authPassword.trim()) { setAuthError("Udfyld både email og adgangskode"); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/citizen/login", {
        method: "POST",
        body: JSON.stringify({ email: authEmail.trim(), password: authPassword }),
      });
      if (!res.ok) { setAuthError("Forkert email eller adgangskode"); return; }
      const data = await res.json();
      setCitizenToken(data.token);
      setCitizen(data.citizen);
      setAuthError("");
      const meRes = await apiFetch("/api/citizen/me", {}, data.token);
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.metadata) {
          setMetaAge(me.metadata.age_group || "");
          setMetaArea(me.metadata.area || "");
        }
      }
      setCitizenFrozen(data.citizen.frozen || false);
      // Tvungen kodeordsskift — sendes til step 10 og kan ikke navigere væk
      if (data.citizen.must_change_password) {
        setStep(10);
        return;
      }
      const hasValidConsent = data.citizen.consent_given &&
        (data.citizen.consent_version || 1) >= CURRENT_CONSENT_VERSION;
      if (hasValidConsent) {
        setConsent(true);
        await submitAndFollowup(data.token, data.citizen, pendingAnswer);
      } else {
        setStep(4);
      }
    } catch {
      setAuthError("Kunne ikke forbinde til serveren");
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setCitizenToken(null);
    setCitizen(null);
    setAuthEmail("");
    setAuthPassword("");
    setAuthError("");
    setMyResponses([]);
    setCitizenFrozen(false);
    if (forloeb.length > 1) setSelectedForloeb(null);
    setStep(0);
  };

  // ─── Profile actions ───
  const handleDeleteAllData = async () => {
    if (!citizen) return;
    await apiFetch("/api/citizen/delete-all", { method: "DELETE" }, citizenToken);
    setCitizenToken(null);
    setCitizen(null);
    setProfileConfirmDelete(false);
    setStep(0);
  };

  const handleSaveMetadata = async () => {
    if (!citizen) return;
    await apiFetch("/api/citizen/metadata", {
      method: "PUT",
      body: JSON.stringify({ age_group: metaAge || null, area: metaArea || null }),
    }, citizenToken);
    setMetaSaved(true);
    setTimeout(() => setMetaSaved(false), 2000);
  };

  const handleConsent = async () => {
    if (!consent || !citizen) return;
    setLoading(true);
    try {
      await apiFetch("/api/citizen/consent", {
        method: "PUT",
        body: JSON.stringify({ consent_given: true }),
      }, citizenToken);
      const updatedCitizen = { ...citizen, consent_given: true };
      setCitizen(updatedCitizen);
      if (pendingAnswer) {
        await submitAndFollowup(citizenToken, updatedCitizen, pendingAnswer);
      } else {
        goToNextQuestion();
      }
    } catch (e) {
      console.error("Samtykke fejl:", e);
      goToNextQuestion();
    } finally {
      setLoading(false);
    }
  };

  const currentQuestion = themeQuestions[questionIndex] || null;
  const answeredQuestionIds = new Set(myResponses.filter(r => !r.is_followup).map(r => r.question_id));

  const goToNextQuestion = () => {
    setAnswer(""); setAudioBlob(null); setAnswerType("text"); setInputMode("text");
    setFollowupQ(""); setFollowupAnswer(""); setFollowupAudioBlob(null); setFollowupAnswerType("text"); setFollowupInputMode("text");
    setPendingAnswer(null);
    if (questionIndex + 1 < themeQuestions.length) { setQuestionIndex(questionIndex + 1); setStep(2); }
    else { setStep(6); }
  };

  const submitFollowup = async () => {
    const textContent = followupAnswerType === "text" ? followupAnswer : "";
    try {
      if (followupAudioBlob) {
        const formData = new FormData();
        formData.append("file", followupAudioBlob, "optagelse.webm");
        const url = `${API_BASE}/api/responses/audio?question_id=${encodeURIComponent(currentQuestion.id)}&session_id=${encodeURIComponent(sessionId.current)}&is_followup=true${lastResponseId ? `&parent_response_id=${encodeURIComponent(lastResponseId)}` : ""}&followup_question_text=${encodeURIComponent(followupQ)}`;
        const headers = citizenToken ? { Authorization: `Bearer ${citizenToken}` } : {};
        await fetch(url, { method: "POST", headers, body: formData });
      } else {
        await apiFetch("/api/responses", {
          method: "POST",
          body: JSON.stringify({
            question_id: currentQuestion.id,
            session_id: sessionId.current,
            text_content: textContent,
            response_type: "text",
            is_followup: true,
            parent_response_id: lastResponseId,
            followup_question_text: followupQ,
          }),
        }, citizenToken);
      }
    } catch (e) {
      console.error("Followup submit error:", e);
    }
    loadMyResponses();  // opgave 15
    goToNextQuestion();
  };

  const submitMetadata = async () => {
    let areaValue = metaArea;
    if (metaArea === "Andet" && customArea.trim()) {
      try {
        await apiFetch("/api/areas", {
          method: "POST",
          body: JSON.stringify({ name: customArea.trim() }),
        });
        areaValue = customArea.trim();
        if (!areas.includes(customArea.trim())) {
          setAreas(prev => [...prev, customArea.trim()]);
        }
      } catch (e) {
        console.error("Area creation error:", e);
      }
    }
    await apiFetch("/api/citizen/metadata", {
      method: "PUT",
      body: JSON.stringify({ age_group: metaAge || null, area: areaValue || null }),
    }, citizenToken);
    setStep(7);
  };

  const cs = { maxWidth: 480, margin: "0 auto", minHeight: "100vh", padding: "24px 20px", display: "flex", flexDirection: "column" };
  const bp = { width: "100%", padding: "18px 24px", borderRadius: 16, border: "none", background: "var(--primary)", color: "#fff", fontSize: 17, fontWeight: 600, cursor: "pointer", fontFamily: "DM Sans", transition: "all 0.2s", boxShadow: "0 2px 12px rgba(45, 90, 61, 0.2)" };
  const bs = { ...bp, background: "transparent", color: "var(--primary)", border: "2px solid var(--primary)", boxShadow: "none" };

  const handleDeleteSingleResponse = async (responseId) => {
    await apiFetch(`/api/citizen/responses/${responseId}`, { method: "DELETE" }, citizenToken);
    setMyResponses(prev => prev.filter(r => r.id !== responseId && r.parent_response_id !== responseId));
  };

  const BackBtn = ({ onClick, label = "Tilbage" }) => (
    <button onClick={onClick} style={{ background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 6, color: "var(--muted)", fontSize: 14, fontFamily: "DM Sans" }}>
      <Icon name="back" size={18} /> {label}
    </button>
  );

  const TopBar = ({ onBack, backLabel }) => (
    <div style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", paddingBottom: 12, marginBottom: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <BackBtn onClick={onBack} label={backLabel} />
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {selectedForloeb?.allow_citizen_questions && citizenToken && (
            <button
              onClick={() => setShowCitizenQuestionModal(true)}
              style={{ background: "var(--accent-light)", border: "1px solid var(--accent)", borderRadius: 10, padding: "6px 12px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--accent)", fontWeight: 500 }}
            >
              ➕ Stil spørgsmål
            </button>
          )}
          {citizen ? (
            <button onClick={() => { prevStep.current = step; setStep(8); }} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--muted)", display: "flex", alignItems: "center", gap: 6 }}>👤 Min profil</button>
          ) : (
            <button onClick={() => { prevStep.current = step; setStep(3); }} style={{ background: "var(--primary)", border: "none", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "#fff", fontWeight: 500 }}>Log ind</button>
          )}
        </div>
      </div>
    </div>
  );

  // ── Step 0: Welcome ──
  if (step === 0) return (
    <div style={cs} className="fade-in">
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 16 }}>
        {citizen ? (
          <button onClick={() => { prevStep.current = 0; setStep(8); }} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--muted)" }}>👤 Min profil</button>
        ) : (
          <button onClick={() => { prevStep.current = 0; setStep(3); }} style={{ background: "var(--primary)", border: "none", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "#fff", fontWeight: 500 }}>Log ind</button>
        )}
      </div>
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
        <div style={{ width: 120, height: 120, borderRadius: 20, background: "var(--primary)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24, boxShadow: "0 8px 24px rgba(45, 90, 61, 0.25)" }}>
          <span style={{ fontSize: 52 }}>🗣️</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 12, lineHeight: 1.2 }}>Stemmer fra Norddjurs</h1>
        <p style={{ fontSize: 17, color: "var(--muted)", lineHeight: 1.6, maxWidth: 340, marginBottom: 40 }}>Vi vil gerne høre din holdning til kommunens prioriteringer. Det tager kun 2-4 minutter.</p>
        <button onClick={() => setStep(1)} style={bp}>Kom i gang</button>
        <button onClick={onAdminClick} style={{ marginTop: 40, background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "DM Sans", opacity: 0.5 }}>Admin</button>
      </div>
    </div>
  );

  // ── Step 1: Vælg forløb (hvis flere) eller vælg tema ──
  if (step === 1) {
    // Forløb ikke valgt og der er flere — vis forløb-valg
    if (!selectedForloeb) {
      if (forloeb.length === 0) return (
        <div style={cs} className="fade-in">
          <TopBar onBack={() => setStep(0)} backLabel="Tilbage" />
          <p style={{ color: "var(--muted)", marginTop: 60, textAlign: "center", fontSize: 15 }}>Ingen aktive forløb i øjeblikket.</p>
        </div>
      );
      return (
        <div style={cs} className="fade-in">
          <TopBar onBack={() => setStep(0)} backLabel="Tilbage" />
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Vælg et forløb</h2>
          <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>Hvilket projekt vil du bidrage til?</p>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            {forloeb.map(f => (
              <button key={f.id} onClick={async () => {
                setSelectedForloeb(f);
                if (f.mode === "questions") {
                  const res = await fetch(`${API_BASE}/api/forloeb/${f.id}/questions`);
                  if (res.ok) setThemeQuestions(await res.json());
                  setQuestionIndex(0);
                  setStep(2);
                }
                // themes-mode: bliv på step 1, vis temaer nedenfor
              }}
                style={{ padding: "22px 20px", borderRadius: 16, border: "2px solid var(--border)", background: "var(--card)", cursor: "pointer", textAlign: "left", transition: "all 0.2s" }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "var(--primary-pale)"; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--card)"; }}
              >
                <div style={{ fontWeight: 700, fontSize: 17, fontFamily: "DM Sans", marginBottom: 6 }}>{f.title}</div>
                {f.description && <div style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5, marginBottom: 8 }}>{f.description}</div>}
                <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 500 }}>
                  {f.mode === "themes"
                    ? `${(f.themes || []).length} temaer`
                    : `${f.question_count || 0} spørgsmål`}
                </div>
              </button>
            ))}
          </div>
        </div>
      );
    }

    // Forløb valgt, questions-mode — burde aldrig lande her (skip til step 2)
    if (selectedForloeb.mode === "questions") {
      setStep(2);
      return null;
    }

    // Forløb valgt, themes-mode — vis temaerne i det valgte forløb
    const forloebThemes = themes.filter(t => t.forloeb_id === selectedForloeb.id);
    const backFromThemes = () => {
      if (forloeb.length > 1) { setSelectedForloeb(null); }
      else { setStep(0); }
    };
    return (
      <div style={cs} className="fade-in">
        <TopBar onBack={backFromThemes} backLabel={forloeb.length > 1 ? "Skift forløb" : "Tilbage"} />
        <div style={{ background: "var(--primary-pale)", borderRadius: 12, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)" }}>📋 {selectedForloeb.title}</span>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Vælg et tema</h2>
        <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>Hvad vil du gerne sige noget om?</p>
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          {forloebThemes.map(theme => {
            const qCount = theme.question_count || 0;
            return (
              <button key={theme.id} onClick={async () => {
                if (qCount === 0) return;
                setSelectedTheme(theme);
                setQuestionIndex(0);
                const res = await fetch(`${API_BASE}/api/themes/${theme.id}/questions`);
                if (res.ok) setThemeQuestions(await res.json());
                setStep(2);
              }}
                style={{ padding: "22px 20px", borderRadius: 16, border: "2px solid var(--border)", background: "var(--card)", cursor: qCount > 0 ? "pointer" : "not-allowed", display: "flex", alignItems: "center", gap: 16, transition: "all 0.2s", textAlign: "left", opacity: qCount > 0 ? 1 : 0.4 }}
                onMouseEnter={e => { if (qCount > 0) { e.currentTarget.style.borderColor = "var(--primary)"; e.currentTarget.style.background = "var(--primary-pale)"; } }}
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
  }

  // ── Step 2: Spørgsmål ──
  if (step === 2 && currentQuestion) {
    const alreadyAnswered = citizen && answeredQuestionIds.has(currentQuestion.id);
    const isQuestionsMode = selectedForloeb?.mode === "questions";
    const backFromQuestion = () => {
      setStep(1);
      if (!isQuestionsMode) { setSelectedTheme(null); setThemeQuestions([]); }
      setAnswer(""); setAudioBlob(null);
    };
    return (
      <div style={cs} className="fade-in">
        <TopBar onBack={backFromQuestion} backLabel={isQuestionsMode ? "Tilbage" : "Skift tema"} />
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ background: "var(--primary-pale)", borderRadius: 12, padding: "8px 14px", display: "inline-flex", alignItems: "center", gap: 8 }}>
            {selectedTheme ? (
              <><span>{selectedTheme.icon}</span><span style={{ fontSize: 13, fontWeight: 500, color: "var(--primary)" }}>{selectedTheme.name}</span></>
            ) : (
              <span style={{ fontSize: 13, fontWeight: 500, color: "var(--primary)" }}>📋 {selectedForloeb?.title}</span>
            )}
          </div>
          <span style={{ fontSize: 13, fontWeight: 500, color: "var(--muted)" }}>Spørgsmål {questionIndex + 1} af {themeQuestions.length}</span>
        </div>
        <div style={{ width: "100%", height: 4, background: "var(--border)", borderRadius: 2, marginBottom: 24 }}>
          <div style={{ width: `${((questionIndex + 1) / themeQuestions.length) * 100}%`, height: "100%", background: "var(--primary)", borderRadius: 2, transition: "width 0.4s ease" }} />
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 700, lineHeight: 1.3, marginBottom: 28 }}>{currentQuestion.body}</h2>
        {alreadyAnswered ? (
          <div style={{ background: "var(--primary-pale)", borderRadius: 16, padding: 20, border: "1px solid var(--primary)", marginBottom: 20 }}>
            <p style={{ fontSize: 15, fontWeight: 600, color: "var(--primary)", marginBottom: 8 }}>Du har allerede svaret på dette spørgsmål</p>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>Du kan se og slette dit svar i din profil, hvis du vil svare igen.</p>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={() => { prevStep.current = 2; setStep(8); }} style={{ padding: "10px 18px", borderRadius: 10, border: "1px solid var(--primary)", background: "transparent", color: "var(--primary)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 500 }}>Gå til profil</button>
              <button onClick={goToNextQuestion} style={{ padding: "10px 18px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>
                {questionIndex + 1 < themeQuestions.length ? "Næste spørgsmål" : "Afslut tema"}
              </button>
            </div>
          </div>
        ) : (
          <>
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
                <AudioRecorder onRecorded={(blob, transcription) => { setAudioBlob(blob); setAnswerType("audio"); if (transcription) setAnswer(transcription); }} />
              </div>
            )}
            <button onClick={handleCollectAnswer} disabled={loading || (answerType === "text" && answer.trim().length < 20) || (answerType === "audio" && !audioBlob)}
              style={{ ...bp, opacity: loading || (answerType === "text" && answer.trim().length < 20) || (answerType === "audio" && !audioBlob) ? 0.4 : 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
              {loading ? (<><div className="spin" style={{ width: 20, height: 20, border: "2px solid rgba(255,255,255,0.3)", borderTop: "2px solid #fff", borderRadius: "50%" }} /> Behandler...</>) : (<>Send svar <Icon name="arrow" size={20} color="#fff" /></>)}
            </button>
          </>
        )}
      </div>
    );
  }

  // ── Step 3: Auth (login/opret konto) ──
  if (step === 3) {
    const emailOk = validateEmail(authEmail);
    const pwErr = authPassword ? validatePassword(authPassword) : null;
    const pwOk = authPassword.length > 0 && !pwErr;
    return (
      <div style={cs} className="fade-in">
        <TopBar onBack={() => setStep(prevStep.current)} backLabel="Tilbage" />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", marginTop: 8 }}>
          <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>{authMode === "login" ? "Log ind" : "Opret konto"}</h2>
          <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>
            {authMode === "login" ? "Log ind for at gemme dit svar." : "Opret en konto for at gemme dit svar — du kan altid se, ændre eller slette det igen."}
          </p>
          {authError && <p style={{ color: "var(--danger)", fontSize: 14, marginBottom: 14, padding: "10px 14px", background: "#FEF2F2", borderRadius: 10 }}>{authError}</p>}
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Email</label>
            <div style={{ position: "relative" }}>
              <input type="email" value={authEmail} onChange={e => { setAuthEmail(e.target.value); setAuthError(""); }} placeholder="din@email.dk"
                style={{ width: "100%", padding: 16, paddingRight: 44, borderRadius: 14, border: `2px solid ${authEmail ? (emailOk ? "var(--success)" : "var(--danger)") : "var(--border)"}`, fontSize: 16, outline: "none" }} />
              {authEmail && <span style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18 }}>{emailOk ? "✓" : "✗"}</span>}
            </div>
            {authEmail && !emailOk && <p style={{ fontSize: 13, color: "var(--danger)", marginTop: 4 }}>Ugyldig email-adresse</p>}
          </div>
          <div style={{ marginBottom: 24 }}>
            <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 6, display: "block" }}>Adgangskode</label>
            <div style={{ position: "relative" }}>
              <input type="password" value={authPassword} onChange={e => { setAuthPassword(e.target.value); setAuthError(""); }}
                placeholder={authMode === "register" ? "Min. 8 tegn, stort+lille+tal" : "Din adgangskode"}
                onKeyDown={e => e.key === "Enter" && (authMode === "login" ? handleLogin() : handleRegister())}
                style={{ width: "100%", padding: 16, paddingRight: 44, borderRadius: 14, border: `2px solid ${authPassword ? (pwOk ? "var(--success)" : "var(--danger)") : "var(--border)"}`, fontSize: 16, outline: "none" }} />
              {authPassword && <span style={{ position: "absolute", right: 16, top: "50%", transform: "translateY(-50%)", fontSize: 18 }}>{pwOk ? "✓" : "✗"}</span>}
            </div>
            {authMode === "register" && authPassword && pwErr && <p style={{ fontSize: 13, color: "var(--danger)", marginTop: 4 }}>{pwErr}</p>}
            {authMode === "register" && (
              <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
                {[
                  { label: "8+ tegn", ok: authPassword.length >= 8 },
                  { label: "Stort bogstav", ok: /[A-Z]/.test(authPassword) },
                  { label: "Lille bogstav", ok: /[a-z]/.test(authPassword) },
                  { label: "Tal", ok: /[0-9]/.test(authPassword) },
                ].map(r => (
                  <span key={r.label} style={{ fontSize: 12, padding: "3px 8px", borderRadius: 6, background: r.ok ? "var(--primary-pale)" : "var(--bg)", color: r.ok ? "var(--primary)" : "var(--muted)", border: `1px solid ${r.ok ? "var(--primary)" : "var(--border)"}` }}>
                    {r.ok ? "✓ " : ""}{r.label}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button onClick={authMode === "login" ? handleLogin : handleRegister} disabled={loading} style={{ ...bp, opacity: loading ? 0.6 : 1 }}>
            {loading ? "Vent..." : (authMode === "login" ? "Log ind" : "Opret konto")}
          </button>
          <button onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setAuthError(""); }}
            style={{ marginTop: 16, background: "none", border: "none", color: "var(--primary)", fontSize: 15, cursor: "pointer", fontFamily: "DM Sans", fontWeight: 500 }}>
            {authMode === "login" ? "Har du ikke en konto? Opret én her" : "Har du allerede en konto? Log ind"}
          </button>
        </div>
      </div>
    );
  }

  // ── Step 4: Samtykke (GDPR art. 13 — opgave 11) ──
  if (step === 4) return (
    <div style={cs} className="fade-in">
      <TopBar onBack={() => setStep(3)} backLabel="Tilbage" />
      <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Samtykke</h2>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 20, lineHeight: 1.5 }}>Inden du gemmer dit svar, beder vi dig læse og acceptere nedenstående.</p>

        {/* Kort opsummering */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, marginBottom: 16, border: "1px solid var(--border)" }}>
          <p style={{ fontSize: 15, fontWeight: 600, marginBottom: 10 }}>Hvad vi bruger dine data til</p>
          <ul style={{ paddingLeft: 20, fontSize: 14, lineHeight: 1.8, color: "var(--fg)" }}>
            <li>Dine svar bruges i Norddjurs Kommunes budgetproces for Budget 2027</li>
            <li>En lokal AI-model (kører på kommunens server — ingen data forlader netværket) bruger dit svar til at stille et opfølgningsspørgsmål</li>
            <li>Anonymiserede resultater præsenteres for kommunens politikere</li>
            <li>Du kan til enhver tid trække dit samtykke tilbage og slette alle dine data via din profil</li>
          </ul>
          <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            <p style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
              <strong>Dataansvarlig:</strong> Norddjurs Kommune, Torvet 3, 8500 Grenaa<br/>
              <strong>Retsgrundlag:</strong> GDPR artikel 6, stk. 1, litra a (samtykke)<br/>
              <strong>Opbevaring:</strong> Dine data slettes senest februar 2027
            </p>
          </div>
        </div>

        {/* Accordion: Fuld tekst */}
        <button
          onClick={() => setConsentExpanded(!consentExpanded)}
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", padding: "14px 18px", background: "var(--card)", border: "1px solid var(--border)", borderRadius: consentExpanded ? "12px 12px 0 0" : 12, cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 500, color: "var(--primary)", marginBottom: 0 }}
        >
          <span>Læs den fulde databehandlingsinformation</span>
          <span style={{ transform: consentExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", display: "inline-block" }}>▼</span>
        </button>
        {consentExpanded && (
          <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderTop: "none", borderRadius: "0 0 12px 12px", padding: 18, marginBottom: 16, fontSize: 13, lineHeight: 1.7, color: "var(--fg)" }}>
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Dataansvarlig</p>
            <p style={{ color: "var(--muted)", marginBottom: 12 }}>Norddjurs Kommune, Torvet 3, 8500 Grenaa, tlf. 89 59 10 00, norddjurs@norddjurs.dk</p>

            <p style={{ fontWeight: 600, marginBottom: 6 }}>Databeskyttelsesrådgiver (DPO)</p>
            <p style={{ color: "var(--muted)", marginBottom: 12 }}>dbr@norddjurs.dk, tlf. 89 59 15 23</p>

            <p style={{ fontWeight: 600, marginBottom: 6 }}>Formål og retsgrundlag</p>
            <p style={{ color: "var(--muted)", marginBottom: 12 }}>Indsamling af borgerholdninger til brug i kommunens budgetproces for Budget 2027. Retsgrundlag: GDPR artikel 6, stk. 1, litra a (dit samtykke).</p>

            <p style={{ fontWeight: 600, marginBottom: 6 }}>Hvilke data indsamles?</p>
            <p style={{ color: "var(--muted)", marginBottom: 12 }}>Email, krypteret adgangskode, besvarelser (tekst/lyd), frivillig metadata (aldersgruppe, by/område).</p>

            <p style={{ fontWeight: 600, marginBottom: 6 }}>AI-behandling</p>
            <p style={{ color: "var(--muted)", marginBottom: 12 }}>Dine svar bruges til at generere opfølgningsspørgsmål via en lokal AI-model. AI'en kører på kommunens egen server — ingen data sendes til eksterne tjenester. AI'en træffer ingen beslutninger der påvirker dig.</p>

            <p style={{ fontWeight: 600, marginBottom: 6 }}>Modtagere og opbevaring</p>
            <p style={{ color: "var(--muted)", marginBottom: 12 }}>Kun projektmedarbejdere i Norddjurs Kommune. Anonymiserede resultater præsenteres for politikere. Data slettes senest februar 2027.</p>

            <p style={{ fontWeight: 600, marginBottom: 6 }}>Dine rettigheder</p>
            <p style={{ color: "var(--muted)", marginBottom: 12 }}>Indsigt (art. 15), berigtigelse (art. 16), sletning (art. 17), begrænsning (art. 18), dataportabilitet (art. 20), indsigelse (art. 21). Du kan til enhver tid trække dit samtykke tilbage via din profil — alle dine data slettes permanent.</p>

            <p style={{ fontWeight: 600, marginBottom: 6 }}>Klageadgang</p>
            <p style={{ color: "var(--muted)" }}>Du kan klage til Datatilsynet på <span style={{ color: "var(--primary)" }}>datatilsynet.dk</span>.</p>
          </div>
        )}
        {consentExpanded && <div style={{ height: 8 }} />}

        <button
          onClick={() => { prevStep.current = 4; setStep(9); }}
          style={{ background: "none", border: "none", color: "var(--primary)", fontSize: 14, cursor: "pointer", textAlign: "left", padding: "8px 0", fontFamily: "DM Sans", textDecoration: "underline", marginBottom: 16 }}
        >
          Læs den fulde privatlivspolitik
        </button>

        {/* Checkbox */}
        <label style={{ display: "flex", alignItems: "flex-start", gap: 14, cursor: "pointer", marginBottom: 24, padding: 16, background: consent ? "var(--primary-pale)" : "var(--card)", borderRadius: 14, border: `2px solid ${consent ? "var(--primary)" : "var(--border)"}`, transition: "all 0.2s" }}>
          <div onClick={() => setConsent(!consent)} style={{ width: 28, height: 28, borderRadius: 8, border: `2px solid ${consent ? "var(--primary)" : "var(--border)"}`, background: consent ? "var(--primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, marginTop: 2, transition: "all 0.2s" }}>
            {consent && <Icon name="check" size={16} color="#fff" />}
          </div>
          <span onClick={() => setConsent(!consent)} style={{ fontSize: 15, lineHeight: 1.5 }}>Jeg har læst og forstået, hvad mine data bruges til, og giver samtykke til behandlingen.</span>
        </label>
        <button onClick={handleConsent} disabled={!consent || loading} style={{ ...bp, opacity: consent && !loading ? 1 : 0.4, cursor: consent && !loading ? "pointer" : "not-allowed" }}>
          {loading ? "Gemmer..." : "Giv samtykke og fortsæt"}
        </button>
      </div>
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
        {citizen ? (
          <button onClick={() => { prevStep.current = 5; setStep(8); }} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--muted)" }}>👤 Min profil</button>
        ) : (
          <button onClick={() => { prevStep.current = 5; setStep(3); }} style={{ background: "var(--primary)", border: "none", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "#fff", fontWeight: 500 }}>Log ind</button>
        )}
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
      <p style={{ fontSize: 15, color: "var(--muted)", marginBottom: 4, lineHeight: 1.5 }}>Disse oplysninger hjælper os med at sikre, at vi hører fra borgere i hele kommunen.</p>
      <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24, lineHeight: 1.5 }}>Det er frivilligt — du kan altid ændre det igen i din profil.</p>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Aldersgruppe</label>
        <select value={metaAge} onChange={e => setMetaAge(e.target.value)} style={{ width: "100%", padding: "16px 14px", borderRadius: 12, border: "2px solid var(--border)", background: "var(--card)", fontSize: 16, appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238A8678' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
          <option value="">Vælg...</option>
          {AGE_GROUPS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>
      <div style={{ marginBottom: 20 }}>
        <label style={{ display: "block", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>Område i kommunen</label>
        <select value={metaArea} onChange={e => { setMetaArea(e.target.value); if (e.target.value !== "Andet") setCustomArea(""); }} style={{ width: "100%", padding: "16px 14px", borderRadius: 12, border: "2px solid var(--border)", background: "var(--card)", fontSize: 16, appearance: "none", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238A8678' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`, backgroundRepeat: "no-repeat", backgroundPosition: "right 14px center" }}>
          <option value="">Vælg...</option>
          {areas.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="Andet">Andet</option>
        </select>
        {metaArea === "Andet" && (
          <input
            type="text"
            value={customArea}
            onChange={e => setCustomArea(e.target.value)}
            placeholder="Skriv din by"
            style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid var(--border)", fontSize: 16, outline: "none", marginTop: 10 }}
            onFocus={e => e.target.style.borderColor = "var(--primary)"}
            onBlur={e => e.target.style.borderColor = "var(--border)"}
          />
        )}
      </div>
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
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>19. august 2026 — kom og hør, hvad borgerne i Norddjurs mener. Alle er velkomne!</p>
        </div>
        <button onClick={() => {
          setStep(1);
          setSelectedTheme(null);
          setThemeQuestions([]);
          setQuestionIndex(0);
          setAnswer("");
          setAudioBlob(null);
          setFollowupQ("");
          setFollowupAnswer("");
          setFollowupAudioBlob(null);
          setInputMode("text");
          setFollowupInputMode("text");
          sessionId.current = uid();
          startTime.current = Date.now();
          if (forloeb.length > 1) setSelectedForloeb(null);
        }} style={bs}>Besvar {selectedForloeb?.mode === "questions" ? "et andet forløb" : "et nyt tema"}</button>
        <button onClick={() => { prevStep.current = 7; setStep(8); }} style={{ marginTop: 12, background: "none", border: "none", color: "var(--primary)", fontSize: 15, cursor: "pointer", fontFamily: "DM Sans", fontWeight: 500 }}>👤 Gå til min profil</button>
      </div>
    </div>
  );

  // ── Step 9: Privatlivspolitik (opgave 12) ──
  if (step === 9) return (
    <div style={cs} className="fade-in">
      <TopBar onBack={() => setStep(prevStep.current || 4)} backLabel="Tilbage" />
      <div style={{ flex: 1 }}>
        <h2 style={{ fontSize: 22, fontWeight: 700, marginBottom: 20 }}>Privatlivspolitik</h2>
        {!privacyPolicyText ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>
            <div className="spin" style={{ width: 32, height: 32, border: "2px solid var(--border)", borderTop: "2px solid var(--primary)", borderRadius: "50%", margin: "0 auto 16px" }} />
            Indlæser...
          </div>
        ) : (
          <div>
            {privacyPolicyText.split("\n").map((line, i) => {
              if (line.startsWith("# ")) return <h1 key={i} style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, marginTop: i > 0 ? 20 : 0 }}>{line.slice(2)}</h1>;
              if (line.startsWith("## ")) return <h2 key={i} style={{ fontSize: 16, fontWeight: 700, marginBottom: 8, marginTop: 20, color: "var(--primary)" }}>{line.slice(3)}</h2>;
              if (line.startsWith("**") && line.endsWith("**")) return <p key={i} style={{ fontSize: 13, fontWeight: 600, color: "var(--muted)", marginBottom: 4 }}>{line.slice(2, -2)}</p>;
              if (line.startsWith("- **")) {
                const match = line.match(/^- \*\*(.+?)\*\*(.*)$/);
                if (match) return <p key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4, paddingLeft: 12 }}>• <strong>{match[1]}</strong>{match[2]}</p>;
              }
              if (line.startsWith("- ")) return <p key={i} style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 4, paddingLeft: 12 }}>• {line.slice(2)}</p>;
              if (line === "---") return <hr key={i} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "16px 0" }} />;
              if (line.trim() === "") return <div key={i} style={{ height: 8 }} />;
              return <p key={i} style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 6, color: "var(--fg)" }}>{line}</p>;
            })}
            <div style={{ marginTop: 28, padding: 16, background: "var(--primary-pale)", borderRadius: 12, border: "1px solid var(--primary)" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "var(--primary)", marginBottom: 4 }}>Klageadgang</p>
              <p style={{ fontSize: 13, color: "var(--fg)", lineHeight: 1.6 }}>
                Du kan klage til Datatilsynet på{" "}
                <a href="https://datatilsynet.dk" target="_blank" rel="noopener noreferrer" style={{ color: "var(--primary)", fontWeight: 600 }}>datatilsynet.dk</a>
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  // ── Step 10: Tvungen kodeordsskift (efter admin-nulstilling) ──
  if (step === 10) return (
    <div style={cs} className="fade-in">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center" }}>
        <div style={{ width: 56, height: 56, borderRadius: "50%", background: "#FEF9EE", border: "2px solid #F0C060", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
          <span style={{ fontSize: 24 }}>🔑</span>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>Skift adgangskode</h2>
        <p style={{ fontSize: 15, color: "var(--muted)", lineHeight: 1.6, marginBottom: 24 }}>
          Din adgangskode er blevet nulstillet af en administrator. Du skal oprette en ny adgangskode for at fortsætte.
        </p>
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginBottom: 24 }}>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Ny adgangskode</label>
            <input
              type="password"
              value={newPassword}
              onChange={e => { setNewPassword(e.target.value); setChangePasswordError(""); }}
              placeholder="Min. 8 tegn, stort + lille bogstav + tal"
              style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid var(--border)", fontSize: 16, outline: "none", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "var(--primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 6 }}>Bekræft ny adgangskode</label>
            <input
              type="password"
              value={confirmPassword}
              onChange={e => { setConfirmPassword(e.target.value); setChangePasswordError(""); }}
              placeholder="Gentag adgangskoden"
              style={{ width: "100%", padding: "14px 16px", borderRadius: 12, border: "2px solid var(--border)", fontSize: 16, outline: "none", boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "var(--primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
          </div>
          {changePasswordError && (
            <p style={{ color: "var(--danger)", fontSize: 13, marginTop: 10 }}>{changePasswordError}</p>
          )}
        </div>
        <button
          onClick={async () => {
            if (!newPassword || !confirmPassword) { setChangePasswordError("Udfyld begge felter"); return; }
            if (newPassword !== confirmPassword) { setChangePasswordError("Adgangskoderne er ikke ens"); return; }
            setLoading(true);
            try {
              const res = await apiFetch("/api/citizen/change-password", {
                method: "PUT",
                body: JSON.stringify({ new_password: newPassword, confirm_password: confirmPassword }),
              }, citizenToken);
              if (!res.ok) {
                const err = await res.json();
                setChangePasswordError(err.detail || "Skift mislykkedes");
                return;
              }
              // Adgangskode skiftet — nulstil og fortsæt normalt
              setNewPassword("");
              setConfirmPassword("");
              setChangePasswordError("");
              const updatedCitizen = { ...citizen, must_change_password: false };
              setCitizen(updatedCitizen);
              localStorage.setItem("citizen", JSON.stringify(updatedCitizen));
              const hasValidConsent = updatedCitizen.consent_given &&
                (updatedCitizen.consent_version || 1) >= CURRENT_CONSENT_VERSION;
              if (hasValidConsent) {
                setConsent(true);
                await submitAndFollowup(citizenToken, updatedCitizen, pendingAnswer);
              } else {
                setStep(4);
              }
            } catch {
              setChangePasswordError("Kunne ikke forbinde til serveren");
            } finally {
              setLoading(false);
            }
          }}
          disabled={loading}
          style={{ ...bp, opacity: loading ? 0.6 : 1 }}
        >
          {loading ? "Gemmer..." : "Gem ny adgangskode og fortsæt"}
        </button>
      </div>
    </div>
  );

  // ── Step 8: Profile ──
  if (step === 8 && citizen) {
    const mainResponses = myResponses.filter(r => !r.is_followup);
    return (
      <div style={cs} className="fade-in">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
          <BackBtn onClick={() => setStep(prevStep.current || 1)} label="Tilbage" />
          <button onClick={handleLogout} style={{ background: "none", border: "1px solid var(--border)", borderRadius: 10, padding: "6px 14px", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--muted)" }}>Log ud</button>
        </div>
        <h2 style={{ fontSize: 24, fontWeight: 700, marginBottom: 4 }}>Min profil</h2>
        <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 28 }}>{citizen.email}</p>

        {/* Metadata */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Mine oplysninger</h3>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Aldersgruppe</label>
            <select value={metaAge} onChange={e => setMetaAge(e.target.value)} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)" }}>
              <option value="">Ikke angivet</option>
              {AGE_GROUPS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Område</label>
            <select value={metaArea} onChange={e => { setMetaArea(e.target.value); if (e.target.value !== "Andet") setCustomArea(""); }} style={{ width: "100%", padding: 12, borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, background: "var(--bg)" }}>
              <option value="">Ikke angivet</option>
              {areas.map(o => <option key={o} value={o}>{o}</option>)}
              <option value="Andet">Andet</option>
            </select>
            {metaArea === "Andet" && (
              <input
                type="text"
                value={customArea}
                onChange={e => setCustomArea(e.target.value)}
                placeholder="Skriv din by"
                style={{ width: "100%", padding: "10px 12px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, outline: "none", marginTop: 8, background: "var(--bg)" }}
              />
            )}
          </div>
          <button onClick={handleSaveMetadata} style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {metaSaved ? "✓ Gemt!" : "Gem ændringer"}
          </button>
        </div>

        {/* My responses */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginBottom: 20 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Mine besvarelser ({mainResponses.length})</h3>
          {mainResponses.length === 0 ? (
            <p style={{ fontSize: 14, color: "var(--muted)" }}>Du har ikke besvaret nogen spørgsmål endnu.</p>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {mainResponses.map(r => {
                const q = r.question;
                const t = r.theme;
                const followup = r.followup_response;
                return (
                  <div key={r.id} style={{ padding: 14, background: "var(--bg)", borderRadius: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                      <div style={{ fontSize: 12, color: "var(--primary)", fontWeight: 500 }}>{t?.icon} {t?.name} — {fmt(r.created_at)}</div>
                      <button onClick={() => handleDeleteSingleResponse(r.id)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: "var(--danger)", padding: "0 4px", fontFamily: "DM Sans", flexShrink: 0 }}>Slet</button>
                    </div>
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

        {/* Opgave 13a: Download mine data */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>Download mine data</h3>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>Download alle dine besvarelser og oplysninger som en JSON-fil (GDPR artikel 20 — dataportabilitet).</p>
          <button
            onClick={async () => {
              const res = await apiFetch("/api/citizen/export", {}, citizenToken);
              if (res.ok) {
                const data = await res.json();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "mine-data-norddjurs.json";
                a.click();
                URL.revokeObjectURL(url);
              }
            }}
            style={{ display: "flex", alignItems: "center", gap: 8, padding: "12px 20px", borderRadius: 10, border: "1px solid var(--primary)", background: "var(--primary-pale)", color: "var(--primary)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}
          >
            <Icon name="download" size={18} color="var(--primary)" /> Download mine data (JSON)
          </button>
        </div>

        {/* Opgave 13b: Frys mine data */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>
            {citizenFrozen ? "Dine data er frosset" : "Frys mine data"}
          </h3>
          <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, marginBottom: 12 }}>
            {citizenFrozen
              ? "Dine besvarelser indgår ikke i analyser eller AI-opfølgninger, mens dine data er frosset. Du kan til enhver tid ophæve frysningen."
              : "Dine besvarelser bevares, men ekskluderes fra dashboard, analyse og AI-perspektiver (GDPR artikel 18 — ret til begrænsning)."}
          </p>
          <button
            onClick={async () => {
              const res = await apiFetch("/api/citizen/freeze", { method: "PUT" }, citizenToken);
              if (res.ok) {
                const data = await res.json();
                setCitizenFrozen(data.frozen);
              }
            }}
            style={{ padding: "12px 20px", borderRadius: 10, border: `1px solid ${citizenFrozen ? "var(--success)" : "var(--muted)"}`, background: citizenFrozen ? "#F0FFF4" : "var(--bg)", color: citizenFrozen ? "var(--success)" : "var(--muted)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}
          >
            {citizenFrozen ? "✓ Fjern frys" : "Frys mine data"}
          </button>
        </div>

        {/* Opgave 13c + 12: Links */}
        <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginBottom: 16 }}>
          <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Dine rettigheder</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <button
              onClick={() => { prevStep.current = 8; setStep(9); }}
              style={{ display: "flex", alignItems: "center", gap: 8, background: "none", border: "none", color: "var(--primary)", fontSize: 14, cursor: "pointer", fontFamily: "DM Sans", fontWeight: 500, textAlign: "left", padding: 0 }}
            >
              📋 Læs privatlivspolitikken
            </button>
            <a
              href="https://datatilsynet.dk"
              target="_blank"
              rel="noopener noreferrer"
              style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--primary)", fontSize: 14, fontFamily: "DM Sans", fontWeight: 500, textDecoration: "none" }}
            >
              🏛️ Klage til Datatilsynet (datatilsynet.dk)
            </a>
          </div>
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

  // ── Modal: Stil et borgerspørgsmål ──
  if (showCitizenQuestionModal) return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 100, display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div className="fade-in" style={{ background: "var(--bg)", borderRadius: "20px 20px 0 0", padding: 28, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}>
        {citizenQuestionSuccess ? (
          <div style={{ textAlign: "center", padding: "20px 0" }}>
            <div style={{ width: 64, height: 64, borderRadius: "50%", background: "var(--primary-pale)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 16px" }}>
              <Icon name="check" size={32} color="var(--primary)" />
            </div>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Tak for dit spørgsmål!</h3>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.6, marginBottom: 24 }}>
              {selectedForloeb?.citizen_question_requires_approval
                ? "Dit spørgsmål er modtaget og vil blive gennemgået, inden det vises til andre."
                : "Dit spørgsmål er nu tilføjet til forløbet og kan besvares af andre borgere."}
            </p>
            <button onClick={() => { setShowCitizenQuestionModal(false); setCitizenQuestionSuccess(false); setCitizenQuestionText(""); setCitizenQuestionAnonymous(false); }} style={bp}>Luk</button>
          </div>
        ) : (
          <>
            <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Stil et spørgsmål</h3>
            <p style={{ fontSize: 14, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
              Er der et spørgsmål, du gerne vil have andre borgere til at tage stilling til?
            </p>
            <textarea
              value={citizenQuestionText}
              onChange={e => setCitizenQuestionText(e.target.value)}
              placeholder="Skriv dit spørgsmål her..."
              maxLength={500}
              style={{ width: "100%", minHeight: 100, padding: 16, borderRadius: 14, border: "2px solid var(--border)", background: "var(--card)", resize: "vertical", fontSize: 16, lineHeight: 1.6, outline: "none", marginBottom: 6, boxSizing: "border-box" }}
              onFocus={e => e.target.style.borderColor = "var(--primary)"}
              onBlur={e => e.target.style.borderColor = "var(--border)"}
            />
            <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>{citizenQuestionText.length}/500 tegn</p>
            <label style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer", marginBottom: 24 }}>
              <div
                onClick={() => setCitizenQuestionAnonymous(!citizenQuestionAnonymous)}
                style={{ width: 26, height: 26, borderRadius: 7, border: `2px solid ${citizenQuestionAnonymous ? "var(--primary)" : "var(--border)"}`, background: citizenQuestionAnonymous ? "var(--primary)" : "#fff", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, transition: "all 0.2s" }}
              >
                {citizenQuestionAnonymous && <Icon name="check" size={14} color="#fff" />}
              </div>
              <span style={{ fontSize: 14, lineHeight: 1.4 }}>Send anonymt — mit navn vises ikke ved spørgsmålet</span>
            </label>
            <div style={{ display: "flex", gap: 12 }}>
              <button
                onClick={() => { setShowCitizenQuestionModal(false); setCitizenQuestionText(""); setCitizenQuestionAnonymous(false); }}
                style={{ ...bs, flex: 1 }}
              >Annuller</button>
              <button
                onClick={async () => {
                  if (citizenQuestionText.trim().length < 10) return;
                  setCitizenQuestionSubmitting(true);
                  try {
                    const res = await apiFetch(`/api/forloeb/${selectedForloeb.id}/citizen-question`, {
                      method: "POST",
                      body: JSON.stringify({ body: citizenQuestionText.trim(), is_anonymous: citizenQuestionAnonymous }),
                    }, citizenToken);
                    if (res.ok) setCitizenQuestionSuccess(true);
                  } catch {}
                  setCitizenQuestionSubmitting(false);
                }}
                disabled={citizenQuestionText.trim().length < 10 || citizenQuestionSubmitting}
                style={{ ...bp, flex: 1, opacity: citizenQuestionText.trim().length < 10 ? 0.4 : 1 }}
              >
                {citizenQuestionSubmitting ? "Sender..." : "Send spørgsmål"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );

  return null;
};

// ═══════════════════════════════════════════════
// ─── ADMIN PANEL ──────────────────────────────
// ═══════════════════════════════════════════════

const AdminPanel = ({ adminToken, onLogout }) => {
  const [tab, setTab] = useState("dashboard");
  const [themes, setThemes] = useState([]);
  const [areas, setAreas] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [responses, setResponses] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [aiSettings, setAiSettings] = useState({ system_prompt: "", perspective_threshold: 30 });
  const [editingQ, setEditingQ] = useState(null);
  const [analysisResults, setAnalysisResults] = useState({});
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [filterTheme, setFilterTheme] = useState("");
  const [filterAge, setFilterAge] = useState("");
  const [filterArea, setFilterArea] = useState("");
  const [filterFlagged, setFilterFlagged] = useState(false);
  const [moderationRules, setModerationRules] = useState([]);
  const [newRule, setNewRule] = useState({ rule_type: "word", pattern: "", description: "" });
  const [newTheme, setNewTheme] = useState({ name: "", icon: "📋" });
  const [deletingThemeId, setDeletingThemeId] = useState(null);
  const [consentOverview, setConsentOverview] = useState(null);
  const [citizenSearch, setCitizenSearch] = useState("");
  const [citizenResults, setCitizenResults] = useState([]);
  const [resetResult, setResetResult] = useState(null); // { email, temp_password, expires_at }
  const [forloebList, setForloebList] = useState([]);
  const [editingForloeb, setEditingForloeb] = useState(null); // null | 'new' | { ...forloeb }
  const [newForloebData, setNewForloebData] = useState({ title: "", description: "", slug: "", mode: "themes", allow_citizen_questions: false, citizen_question_requires_approval: true, is_active: true, sort_order: 0 });
  const [pendingQuestions, setPendingQuestions] = useState([]);
  const [pendingForloebId, setPendingForloebId] = useState(null);

  const adminFetch = (path, options = {}) => apiFetch(path, options, adminToken);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      const [themesRes, areasRes, questionsRes, dashRes, aiRes, forloebRes] = await Promise.all([
        fetch(`${API_BASE}/api/themes`),
        fetch(`${API_BASE}/api/areas`),
        adminFetch("/api/admin/questions"),
        adminFetch("/api/admin/dashboard"),
        adminFetch("/api/admin/ai-settings"),
        adminFetch("/api/admin/forloeb"),
      ]);
      if (themesRes.ok) setThemes(await themesRes.json());
      if (areasRes.ok) setAreas(await areasRes.json());
      if (questionsRes.ok) setQuestions(await questionsRes.json());
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (aiRes.ok) setAiSettings(await aiRes.json());
      if (forloebRes.ok) setForloebList(await forloebRes.json());
    };
    load();
  }, []);

  // Load responses when tab or filters change
  useEffect(() => {
    if (tab !== "responses") return;
    const params = new URLSearchParams();
    if (filterTheme) params.set("theme_id", filterTheme);
    if (filterAge) params.set("age_group", filterAge);
    if (filterArea) params.set("area", filterArea);
    if (filterFlagged) params.set("flagged_only", "true");
    adminFetch(`/api/admin/responses?${params}`)
      .then(r => r.ok ? r.json() : { responses: [] })
      .then(data => setResponses(data.responses || []));
  }, [tab, filterTheme, filterAge, filterArea, filterFlagged]);

  // Load moderation rules when tab is moderation
  useEffect(() => {
    if (tab !== "moderation") return;
    adminFetch("/api/admin/moderation-rules")
      .then(r => r.ok ? r.json() : [])
      .then(setModerationRules);
  }, [tab]);

  // Opgave 14c: Load samtykke-oversigt
  useEffect(() => {
    if (tab !== "consent") return;
    adminFetch("/api/admin/consent-overview")
      .then(r => r.ok ? r.json() : null)
      .then(setConsentOverview);
  }, [tab]);

  // Load forløb
  useEffect(() => {
    if (tab !== "forloeb") return;
    adminFetch("/api/admin/forloeb")
      .then(r => r.ok ? r.json() : [])
      .then(setForloebList);
  }, [tab]);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "chart" },
    { id: "forloeb", label: "Forløb", icon: "list" },
    { id: "questions", label: "Spørgsmål", icon: "questions" },
    { id: "responses", label: "Besvarelser", icon: "list" },
    { id: "moderation", label: "Moderation", icon: "settings" },
    { id: "consent", label: "Samtykker", icon: "check" },
    { id: "citizens", label: "Borgere", icon: "questions" },
    { id: "settings", label: "AI-indstillinger", icon: "settings" },
  ];

  const responsesPerTheme = (dashboard?.per_theme || []).map(t => ({
    label: t.icon + " " + t.name.split(" ")[0],
    value: t.count,
  }));

  const runAnalysis = async (type) => {
    setAnalysisLoading(true);
    try {
      const res = await adminFetch("/api/admin/analysis", {
        method: "POST",
        body: JSON.stringify({ analysis_type: type }),
      });
      if (res.ok) {
        const data = await res.json();
        setAnalysisResults(prev => ({ ...prev, [type]: data.result }));
      }
    } catch (e) {
      console.error("Analysis error:", e);
    }
    setAnalysisLoading(false);
  };

  const exportCSV = async () => {
    const res = await adminFetch("/api/admin/export/csv");
    if (res.ok) {
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "norddjurs-besvarelser.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const saveQuestion = async (q) => {
    const isNew = !questions.find(e => e.id === q.id);
    const res = isNew
      ? await adminFetch("/api/admin/questions", { method: "POST", body: JSON.stringify(q) })
      : await adminFetch(`/api/admin/questions/${q.id}`, { method: "PUT", body: JSON.stringify(q) });
    if (res.ok) {
      const updated = await res.json();
      setQuestions(prev => isNew ? [...prev, updated] : prev.map(e => e.id === updated.id ? updated : e));
    }
    setEditingQ(null);
  };

  const toggleQuestion = async (qId) => {
    const q = questions.find(q => q.id === qId);
    const res = await adminFetch(`/api/admin/questions/${qId}`, {
      method: "PUT",
      body: JSON.stringify({ is_active: !q.is_active }),
    });
    if (res.ok) {
      const updated = await res.json();
      setQuestions(prev => prev.map(q => q.id === qId ? updated : q));
    }
  };

  const saveAISettings = async (settings) => {
    setAiSettings(settings);
    await adminFetch("/api/admin/ai-settings", {
      method: "PUT",
      body: JSON.stringify({
        system_prompt: settings.system_prompt,
        perspective_threshold: settings.perspective_threshold,
      }),
    });
  };

  const createTheme = async () => {
    if (!newTheme.name.trim()) return;
    const res = await adminFetch("/api/admin/themes", { method: "POST", body: JSON.stringify(newTheme) });
    if (res.ok) {
      const t = await res.json();
      setThemes(prev => [...prev, t]);
      setNewTheme({ name: "", icon: "📋" });
    }
  };

  const deleteTheme = async (themeId) => {
    const res = await adminFetch(`/api/admin/themes/${themeId}`, { method: "DELETE" });
    if (res.ok) {
      setThemes(prev => prev.filter(t => t.id !== themeId));
      setQuestions(prev => prev.filter(q => q.theme_id !== themeId));
      setDeletingThemeId(null);
    }
  };

  const excludeResponse = async (responseId) => {
    const res = await adminFetch(`/api/admin/responses/${responseId}/exclude`, { method: "PUT" });
    if (res.ok) setResponses(prev => prev.filter(r => r.id !== responseId));
  };

  const approveResponse = async (responseId) => {
    const res = await adminFetch(`/api/admin/responses/${responseId}/approve`, { method: "PUT" });
    if (res.ok) setResponses(prev => prev.map(r => r.id === responseId ? { ...r, is_flagged: false } : r));
  };

  const createRule = async () => {
    if (!newRule.pattern.trim()) return;
    const res = await adminFetch("/api/admin/moderation-rules", { method: "POST", body: JSON.stringify(newRule) });
    if (res.ok) {
      const rule = await res.json();
      setModerationRules(prev => [...prev, rule]);
      setNewRule({ rule_type: "word", pattern: "", description: "" });
    }
  };

  const deleteRule = async (ruleId) => {
    const res = await adminFetch(`/api/admin/moderation-rules/${ruleId}`, { method: "DELETE" });
    if (res.ok) setModerationRules(prev => prev.filter(r => r.id !== ruleId));
  };

  const toggleRule = async (ruleId) => {
    const res = await adminFetch(`/api/admin/moderation-rules/${ruleId}/toggle`, { method: "PUT" });
    if (res.ok) {
      const updated = await res.json();
      setModerationRules(prev => prev.map(r => r.id === ruleId ? updated : r));
    }
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
              {dashboard?.total_responses ?? "—"} besvarelser i alt
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, marginBottom: 20 }}>
              <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Besvarelser pr. tema</h3>
                <BarChart data={responsesPerTheme} />
              </div>
              <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Aldersfordeling</h3>
                <DonutChart data={dashboard?.age_distribution || []} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
              <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Områdefordeling</h3>
                <DonutChart data={dashboard?.area_distribution || []} />
              </div>
              <div style={cardStyle}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600 }}>AI-analyse</h3>
                </div>
                {(dashboard?.total_responses || 0) < 3 ? (
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

        {/* ── Forløb Tab ── */}
        {tab === "forloeb" && (
          <div className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700 }}>Forløb</h1>
              <button
                onClick={() => { setEditingForloeb("new"); setNewForloebData({ title: "", description: "", slug: "", mode: "themes", allow_citizen_questions: false, citizen_question_requires_approval: true, is_active: true, sort_order: 0 }); }}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}
              >+ Nyt forløb</button>
            </div>

            {/* Opret/rediger forløb */}
            {editingForloeb && (
              <div style={{ background: "var(--card)", borderRadius: 16, padding: 24, border: "1px solid var(--primary)", marginBottom: 24 }}>
                <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 16 }}>
                  {editingForloeb === "new" ? "Opret nyt forløb" : `Rediger: ${editingForloeb.title}`}
                </h3>
                {[
                  { label: "Titel", key: "title", type: "text", placeholder: "F.eks. Budget 2027" },
                  { label: "URL-navn (slug)", key: "slug", type: "text", placeholder: "f.eks. budget-2027" },
                ].map(({ label, key, type, placeholder }) => (
                  <div key={key} style={{ marginBottom: 14 }}>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</label>
                    <input
                      type={type}
                      value={editingForloeb === "new" ? newForloebData[key] : editingForloeb[key] || ""}
                      onChange={e => {
                        const val = e.target.value;
                        if (editingForloeb === "new") setNewForloebData(p => ({ ...p, [key]: val }));
                        else setEditingForloeb(p => ({ ...p, [key]: val }));
                      }}
                      placeholder={placeholder}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15 }}
                    />
                  </div>
                ))}
                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Beskrivelse</label>
                  <textarea
                    value={editingForloeb === "new" ? newForloebData.description || "" : editingForloeb.description || ""}
                    onChange={e => {
                      const val = e.target.value;
                      if (editingForloeb === "new") setNewForloebData(p => ({ ...p, description: val }));
                      else setEditingForloeb(p => ({ ...p, description: val }));
                    }}
                    placeholder="Kort beskrivelse til borgeren..."
                    style={{ width: "100%", minHeight: 70, padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, resize: "vertical" }}
                  />
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 14 }}>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Tilstand</label>
                    <select
                      value={editingForloeb === "new" ? newForloebData.mode : editingForloeb.mode}
                      onChange={e => {
                        const val = e.target.value;
                        if (editingForloeb === "new") setNewForloebData(p => ({ ...p, mode: val }));
                        else setEditingForloeb(p => ({ ...p, mode: val }));
                      }}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15 }}
                    >
                      <option value="themes">Temaer</option>
                      <option value="questions">Spørgsmål (direkte)</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: "block", fontSize: 13, fontWeight: 600, marginBottom: 4 }}>Status</label>
                    <select
                      value={editingForloeb === "new" ? String(newForloebData.is_active) : String(editingForloeb.is_active)}
                      onChange={e => {
                        const val = e.target.value === "true";
                        if (editingForloeb === "new") setNewForloebData(p => ({ ...p, is_active: val }));
                        else setEditingForloeb(p => ({ ...p, is_active: val }));
                      }}
                      style={{ width: "100%", padding: "10px 14px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15 }}
                    >
                      <option value="true">Aktivt</option>
                      <option value="false">Inaktivt</option>
                    </select>
                  </div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14, marginBottom: 20 }}>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={editingForloeb === "new" ? newForloebData.allow_citizen_questions : editingForloeb.allow_citizen_questions}
                      onChange={e => {
                        const val = e.target.checked;
                        if (editingForloeb === "new") setNewForloebData(p => ({ ...p, allow_citizen_questions: val }));
                        else setEditingForloeb(p => ({ ...p, allow_citizen_questions: val }));
                      }}
                    />
                    <span style={{ fontSize: 13 }}>Borgere kan stille spørgsmål</span>
                  </label>
                  <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                    <input
                      type="checkbox"
                      checked={editingForloeb === "new" ? newForloebData.citizen_question_requires_approval : editingForloeb.citizen_question_requires_approval}
                      onChange={e => {
                        const val = e.target.checked;
                        if (editingForloeb === "new") setNewForloebData(p => ({ ...p, citizen_question_requires_approval: val }));
                        else setEditingForloeb(p => ({ ...p, citizen_question_requires_approval: val }));
                      }}
                    />
                    <span style={{ fontSize: 13 }}>Borgerspørgsmål kræver godkendelse</span>
                  </label>
                </div>
                <div style={{ display: "flex", gap: 12 }}>
                  <button
                    onClick={async () => {
                      const payload = editingForloeb === "new" ? newForloebData : editingForloeb;
                      const method = editingForloeb === "new" ? "POST" : "PUT";
                      const url = editingForloeb === "new" ? "/api/admin/forloeb" : `/api/admin/forloeb/${editingForloeb.id}`;
                      const res = await adminFetch(url, { method, body: JSON.stringify(payload) });
                      if (res.ok) {
                        const updated = await adminFetch("/api/admin/forloeb").then(r => r.ok ? r.json() : []);
                        setForloebList(updated);
                        setEditingForloeb(null);
                      }
                    }}
                    style={{ padding: "10px 24px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}
                  >{editingForloeb === "new" ? "Opret forløb" : "Gem ændringer"}</button>
                  <button onClick={() => setEditingForloeb(null)} style={{ padding: "10px 20px", borderRadius: 10, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14 }}>Annuller</button>
                </div>
              </div>
            )}

            {/* Liste over forløb */}
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {forloebList.length === 0 && <p style={{ color: "var(--muted)", fontSize: 14 }}>Ingen forløb oprettet endnu.</p>}
              {forloebList.map(f => (
                <div key={f.id} style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                    <div>
                      <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 2 }}>{f.title}</h3>
                      <div style={{ fontSize: 13, color: "var(--muted)" }}>
                        /{f.slug} · {f.mode === "themes" ? "Temaer" : "Direkte spørgsmål"} · {f.is_active ? "✅ Aktivt" : "⏸ Inaktivt"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={() => setEditingForloeb({ ...f })} style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13 }}>Rediger</button>
                      <button
                        onClick={async () => {
                          if (!confirm(`Slet forløbet "${f.title}"?`)) return;
                          await adminFetch(`/api/admin/forloeb/${f.id}`, { method: "DELETE" });
                          setForloebList(prev => prev.filter(x => x.id !== f.id));
                        }}
                        style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--danger)" }}
                      >Slet</button>
                    </div>
                  </div>
                  {f.description && <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12, lineHeight: 1.5 }}>{f.description}</p>}

                  {/* Tilknyttet indhold */}
                  {f.mode === "themes" && f.themes && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: f.allow_citizen_questions ? 12 : 0 }}>
                      {f.themes.map(t => (
                        <span key={t.id} style={{ fontSize: 12, padding: "3px 10px", borderRadius: 20, background: "var(--primary-pale)", color: "var(--primary)", border: "1px solid var(--primary)" }}>
                          {t.icon} {t.name} ({t.question_count} spørgsmål)
                        </span>
                      ))}
                    </div>
                  )}
                  {f.mode === "questions" && (
                    <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: f.allow_citizen_questions ? 12 : 0 }}>{f.question_count} aktive spørgsmål</p>
                  )}

                  {/* Borgerspørgsmål */}
                  {f.allow_citizen_questions && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12, marginTop: 8 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <span style={{ fontSize: 13, color: "var(--primary)", fontWeight: 500 }}>💬 Borgere kan stille spørgsmål{f.citizen_question_requires_approval ? " (kræver godkendelse)" : ""}</span>
                        <button
                          onClick={async () => {
                            const res = await adminFetch(`/api/admin/forloeb/${f.id}/pending-questions`);
                            if (res.ok) {
                              setPendingQuestions(await res.json());
                              setPendingForloebId(f.id);
                            }
                          }}
                          style={{ padding: "5px 12px", borderRadius: 8, border: "1px solid var(--primary)", background: "var(--primary-pale)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--primary)" }}
                        >Se afventende spørgsmål</button>
                      </div>
                      {pendingForloebId === f.id && pendingQuestions.length > 0 && (
                        <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
                          {pendingQuestions.map(q => (
                            <div key={q.id} style={{ padding: 14, background: "var(--bg)", borderRadius: 10, border: "1px solid var(--border)" }}>
                              <p style={{ fontSize: 14, fontWeight: 500, marginBottom: 4 }}>{q.body}</p>
                              <p style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10 }}>
                                Fra: {q.is_anonymous ? "Anonym" : (q.submitted_by_email || "Ukendt")} · {fmt(q.created_at)}
                              </p>
                              <div style={{ display: "flex", gap: 8 }}>
                                <button
                                  onClick={async () => {
                                    await adminFetch(`/api/admin/questions/${q.id}/approve`, { method: "PUT" });
                                    setPendingQuestions(prev => prev.filter(x => x.id !== q.id));
                                  }}
                                  style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13 }}
                                >Godkend</button>
                                <button
                                  onClick={async () => {
                                    await adminFetch(`/api/admin/questions/${q.id}`, { method: "DELETE" }).catch(() => {});
                                    setPendingQuestions(prev => prev.filter(x => x.id !== q.id));
                                  }}
                                  style={{ padding: "6px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, color: "var(--danger)" }}
                                >Afvis</button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      {pendingForloebId === f.id && pendingQuestions.length === 0 && (
                        <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 8 }}>Ingen afventende spørgsmål.</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Tema-tilknytning (themes-mode forløb) */}
            {forloebList.some(f => f.mode === "themes") && (
              <div style={{ background: "var(--card)", borderRadius: 16, padding: 20, border: "1px solid var(--border)", marginTop: 24 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Tilknyt temaer til forløb</h3>
                <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>Vælg hvilket forløb hvert tema tilhører.</p>
                {themes.map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10 }}>
                    <span style={{ fontSize: 20 }}>{t.icon}</span>
                    <span style={{ fontSize: 14, flex: 1 }}>{t.name}</span>
                    <select
                      value={t.forloeb_id || ""}
                      onChange={async e => {
                        const fid = e.target.value || null;
                        const res = await adminFetch(`/api/admin/themes/${t.id}/forloeb?forloeb_id=${fid || ""}`, { method: "PUT" });
                        if (res.ok) {
                          const updated = await fetch(`${API_BASE}/api/themes`).then(r => r.json());
                          setThemes(updated);
                        }
                      }}
                      style={{ padding: "6px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}
                    >
                      <option value="">Ikke tilknyttet</option>
                      {forloebList.filter(f => f.mode === "themes").map(f => (
                        <option key={f.id} value={f.id}>{f.title}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Questions Tab ── */}
        {tab === "questions" && (
          <div className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700 }}>Spørgsmål</h1>
              <button onClick={() => setEditingQ({ id: uid(), theme_id: themes[0]?.id || null, forloeb_id: null, title: "", body: "", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 99 })}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>
                + Nyt spørgsmål
              </button>
            </div>

            {/* Tema CRUD */}
            <div style={{ ...cardStyle, marginBottom: 28 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Temaer</h3>
              <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
                <input value={newTheme.name} onChange={e => setNewTheme({ ...newTheme, name: e.target.value })} placeholder="Temanavn"
                  style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }} />
                <input value={newTheme.icon} onChange={e => setNewTheme({ ...newTheme, icon: e.target.value })} placeholder="🏷️" maxLength={4}
                  style={{ width: 60, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 18, textAlign: "center" }} />
                <button onClick={createTheme} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>Tilføj</button>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {themes.map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: "var(--bg)", borderRadius: 8 }}>
                    <span style={{ fontSize: 20 }}>{t.icon}</span>
                    <span style={{ flex: 1, fontWeight: 500 }}>{t.name}</span>
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>{t.question_count} spørgsmål</span>
                    {deletingThemeId === t.id ? (
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => deleteTheme(t.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--danger)", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "DM Sans" }}>Slet</button>
                        <button onClick={() => setDeletingThemeId(null)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: "var(--card)", cursor: "pointer", fontSize: 12, fontFamily: "DM Sans" }}>Annuller</button>
                      </div>
                    ) : (
                      <button onClick={() => setDeletingThemeId(t.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--danger)", background: "transparent", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontFamily: "DM Sans" }}>Slet</button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {editingQ && (
              <div style={{ ...cardStyle, borderColor: "var(--primary)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{questions.find(q => q.id === editingQ.id) ? "Rediger" : "Nyt"} spørgsmål</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>Tilhørsforhold</label>
                    <select
                      value={editingQ.forloeb_id ? `f:${editingQ.forloeb_id}` : (editingQ.theme_id ? `t:${editingQ.theme_id}` : "")}
                      onChange={e => {
                        const v = e.target.value;
                        if (v.startsWith("t:")) setEditingQ({ ...editingQ, theme_id: v.slice(2), forloeb_id: null });
                        else if (v.startsWith("f:")) setEditingQ({ ...editingQ, theme_id: null, forloeb_id: v.slice(2) });
                        else setEditingQ({ ...editingQ, theme_id: null, forloeb_id: null });
                      }}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}
                    >
                      <option value="">— Vælg —</option>
                      {themes.length > 0 && <optgroup label="Temaer">
                        {themes.map(t => <option key={t.id} value={`t:${t.id}`}>{t.icon} {t.name}</option>)}
                      </optgroup>}
                      {forloebList.filter(f => f.mode === "questions").length > 0 && <optgroup label="Forløb (direkte spørgsmål)">
                        {forloebList.filter(f => f.mode === "questions").map(f => <option key={f.id} value={`f:${f.id}`}>📋 {f.title}</option>)}
                      </optgroup>}
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

            {/* Tema-spørgsmål */}
            {themes.map(theme => {
              const themeQs = questions.filter(q => q.theme_id === theme.id).sort((a,b) => a.sort_order - b.sort_order);
              return (
                <div key={theme.id} style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
                    <span>{theme.icon}</span> {theme.name}
                  </h3>
                  {themeQs.length === 0 && <p style={{ fontSize: 13, color: "var(--muted)", padding: "8px 0" }}>Ingen spørgsmål i dette tema.</p>}
                  {themeQs.map(q => (
                    <div key={q.id} style={{ ...cardStyle, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", opacity: q.is_active ? 1 : 0.5 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{q.title}</div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{q.body}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          <span>{q.allow_followup ? "✅ Opfølgning" : "❌ Ingen opfølgning"}</span>
                          {q.is_citizen_submitted && <span style={{ marginLeft: 8, color: "var(--accent)" }}>💬 Borgerspørgsmål{!q.is_approved ? " ⏳" : ""}</span>}
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

            {/* Forløb-spørgsmål (questions-mode) */}
            {(() => {
              const looseQs = questions.filter(q => !q.theme_id && q.forloeb_id).sort((a,b) => a.sort_order - b.sort_order);
              if (looseQs.length === 0) return null;
              return (
                <div style={{ marginBottom: 24 }}>
                  <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 10, color: "var(--primary)" }}>📋 Direkte forløb-spørgsmål</h3>
                  {looseQs.map(q => (
                    <div key={q.id} style={{ ...cardStyle, marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 20px", opacity: q.is_active ? 1 : 0.5 }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 14 }}>{q.title}</div>
                        <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 2 }}>{q.body}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          <span>{q.allow_followup ? "✅ Opfølgning" : "❌ Ingen opfølgning"}</span>
                          {q.is_citizen_submitted && <span style={{ marginLeft: 8, color: "var(--accent)" }}>💬 Borgerspørgsmål{!q.is_approved ? " ⏳" : ""}</span>}
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
            })()}
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
                {themes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
              </select>
              <select value={filterAge} onChange={e => setFilterAge(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
                <option value="">Alle aldre</option>
                {AGE_GROUPS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={filterArea} onChange={e => setFilterArea(e.target.value)}
                style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 13 }}>
                <option value="">Alle områder</option>
                {areas.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer", padding: "8px 12px", borderRadius: 8, border: `1px solid ${filterFlagged ? "var(--danger)" : "var(--border)"}`, background: filterFlagged ? "#FEF2F2" : "var(--card)", color: filterFlagged ? "var(--danger)" : "inherit" }}>
                <input type="checkbox" checked={filterFlagged} onChange={e => setFilterFlagged(e.target.checked)} /> 🚩 Kun flaggede
              </label>
              <span style={{ fontSize: 13, color: "var(--muted)", alignSelf: "center" }}>{responses.length} resultater</span>
            </div>

            {responses.map(r => {
              const q = r.question;
              const t = r.theme;
              const meta = r.metadata;
              const followup = r.followup_response;
              return (
                <div key={r.id} style={{ ...cardStyle, borderLeft: r.is_flagged ? "4px solid var(--danger)" : undefined }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, flexWrap: "wrap", gap: 8 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <span style={{ background: "var(--primary-pale)", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500, color: "var(--primary)" }}>
                        {t?.icon} {t?.name?.split(" ")[0]}
                      </span>
                      <span style={{ background: r.response_type === "audio" ? "var(--accent-light)" : "var(--bg)", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 500 }}>
                        {r.response_type === "audio" ? "🎤 Lyd" : "✏️ Tekst"}
                      </span>
                      {r.is_flagged && <span style={{ background: "#FEF2F2", color: "var(--danger)", padding: "3px 10px", borderRadius: 6, fontSize: 12, fontWeight: 600 }}>🚩 Flagget</span>}
                    </div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span style={{ fontSize: 12, color: "var(--muted)" }}>{fmt(r.created_at)}</span>
                      {r.is_flagged && <button onClick={() => approveResponse(r.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "var(--success)", color: "#fff", cursor: "pointer", fontSize: 12, fontFamily: "DM Sans", fontWeight: 600 }}>Godkend</button>}
                      <button onClick={() => excludeResponse(r.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--muted)", background: "transparent", color: "var(--muted)", cursor: "pointer", fontSize: 12, fontFamily: "DM Sans" }}>Udgå</button>
                    </div>
                  </div>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>{q?.body}</p>
                  <p style={{ fontSize: 15, lineHeight: 1.6, marginBottom: 8 }}>{r.text_content}</p>
                  {followup && (
                    <div style={{ borderLeft: "3px solid var(--accent)", paddingLeft: 14, marginTop: 12 }}>
                      <p style={{ fontSize: 12, fontWeight: 600, color: "var(--accent)", marginBottom: 4 }}>Opfølgning: {followup.followup_question_text}</p>
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
            {responses.length === 0 && (
              <div style={{ textAlign: "center", padding: 60, color: "var(--muted)" }}>
                <p style={{ fontSize: 16 }}>Ingen besvarelser endnu</p>
                <p style={{ fontSize: 14, marginTop: 8 }}>Besvarelser dukker op her, når borgere har svaret.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Moderation Tab ── */}
        {tab === "moderation" && (
          <div className="fade-in">
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Indholdsmoderation</h1>
            <p style={{ color: "var(--muted)", marginBottom: 28 }}>Regler for automatisk flagning af besvarelser. Flaggede svar publiceres ikke automatisk.</p>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Tilføj regel</h3>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 0 }}>
                <select value={newRule.rule_type} onChange={e => setNewRule({ ...newRule, rule_type: e.target.value })}
                  style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}>
                  <option value="word">Ord/frase</option>
                  <option value="regex">Regex</option>
                </select>
                <input value={newRule.pattern} onChange={e => setNewRule({ ...newRule, pattern: e.target.value })} placeholder="Mønster (fx 'idiot')"
                  style={{ flex: 1, minWidth: 160, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }} />
                <input value={newRule.description} onChange={e => setNewRule({ ...newRule, description: e.target.value })} placeholder="Beskrivelse (valgfri)"
                  style={{ flex: 1, minWidth: 120, padding: "8px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }} />
                <button onClick={createRule} style={{ padding: "8px 16px", borderRadius: 8, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>Tilføj</button>
              </div>
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>Aktive regler ({moderationRules.length})</h3>
              {moderationRules.length === 0 ? (
                <p style={{ color: "var(--muted)", fontSize: 14 }}>Ingen regler oprettet endnu.</p>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {moderationRules.map(rule => (
                    <div key={rule.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", background: rule.is_active ? "var(--bg)" : "#f5f5f5", borderRadius: 8, opacity: rule.is_active ? 1 : 0.5 }}>
                      <span style={{ fontSize: 12, padding: "2px 8px", borderRadius: 4, background: rule.rule_type === "regex" ? "var(--accent-light)" : "var(--primary-pale)", color: rule.rule_type === "regex" ? "var(--accent)" : "var(--primary)", fontWeight: 600 }}>{rule.rule_type}</span>
                      <code style={{ flex: 1, fontSize: 13, fontFamily: "monospace" }}>{rule.pattern}</code>
                      <span style={{ fontSize: 13, color: "var(--muted)", minWidth: 100 }}>{rule.description}</span>
                      <button onClick={() => toggleRule(rule.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "1px solid var(--border)", background: rule.is_active ? "var(--primary-pale)" : "var(--bg)", cursor: "pointer", fontSize: 12, fontFamily: "DM Sans", color: rule.is_active ? "var(--primary)" : "var(--muted)" }}>
                        {rule.is_active ? "Aktiv" : "Inaktiv"}
                      </button>
                      <button onClick={() => deleteRule(rule.id)} style={{ padding: "4px 10px", borderRadius: 6, border: "none", background: "#FEF2F2", color: "var(--danger)", cursor: "pointer", fontSize: 12, fontFamily: "DM Sans" }}>Slet</button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={cardStyle}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Se flaggede besvarelser</h3>
              <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 14 }}>Gå til besvarelsestabben og filtrer på "Kun flaggede" for at se og godkende flaggede svar.</p>
              <button onClick={() => { setFilterFlagged(true); setTab("responses"); }} style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>
                Vis flaggede besvarelser
              </button>
            </div>
          </div>
        )}

        {/* ── Consent Tab (opgave 14c) ── */}
        {tab === "consent" && (
          <div className="fade-in">
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 24 }}>Samtykke-oversigt</h1>
            {!consentOverview ? (
              <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Indlæser...</div>
            ) : (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 16, marginBottom: 28 }}>
                  {[
                    { label: "Borgere i alt", value: consentOverview.total_citizens, color: "var(--primary)" },
                    { label: "Aktivt samtykke", value: consentOverview.consent_given, color: "var(--success)" },
                    { label: "Trukket tilbage", value: consentOverview.consent_withdrawn, color: "var(--danger)" },
                    { label: "Frosne konti", value: consentOverview.frozen_count, color: "var(--accent)" },
                  ].map(s => (
                    <div key={s.label} style={{ background: "var(--card)", borderRadius: 14, padding: 18, border: "1px solid var(--border)", textAlign: "center" }}>
                      <div style={{ fontSize: 32, fontWeight: 700, color: s.color }}>{s.value}</div>
                      <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                <div style={{ ...cardStyle, marginBottom: 24 }}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Aktive samtykker pr. version</h3>
                  <p style={{ fontSize: 13, color: "var(--muted)", marginBottom: 12 }}>Aktuel samtykke-version: <strong>v{consentOverview.current_consent_version}</strong></p>
                  {consentOverview.by_version.length === 0 ? (
                    <p style={{ fontSize: 14, color: "var(--muted)" }}>Ingen aktive samtykker endnu.</p>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {consentOverview.by_version.map(v => (
                        <div key={v.version} style={{ display: "flex", justifyContent: "space-between", padding: "10px 14px", background: v.version < consentOverview.current_consent_version ? "#FEF9EE" : "var(--primary-pale)", borderRadius: 8, border: `1px solid ${v.version < consentOverview.current_consent_version ? "#F0C060" : "var(--primary)"}` }}>
                          <span style={{ fontSize: 14 }}>Version {v.version} {v.version < consentOverview.current_consent_version ? "⚠️ (forældet)" : "✓ (aktuel)"}</span>
                          <strong style={{ fontSize: 14 }}>{v.count} borgere</strong>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div style={cardStyle}>
                  <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Seneste samtykke-hændelser</h3>
                  {consentOverview.recent_logs.length === 0 ? (
                    <p style={{ fontSize: 14, color: "var(--muted)" }}>Ingen hændelser endnu.</p>
                  ) : (
                    <div style={{ overflowX: "auto" }}>
                      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                        <thead>
                          <tr style={{ borderBottom: "2px solid var(--border)" }}>
                            {["Handling", "Version", "Tidspunkt", "IP"].map(h => (
                              <th key={h} style={{ textAlign: "left", padding: "8px 10px", color: "var(--muted)", fontWeight: 600 }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {consentOverview.recent_logs.map((l, i) => (
                            <tr key={i} style={{ borderBottom: "1px solid var(--border)" }}>
                              <td style={{ padding: "8px 10px", color: l.consent_given ? "var(--success)" : "var(--danger)", fontWeight: 500 }}>
                                {l.consent_given ? "✓ Givet" : "✗ Trukket tilbage"}
                              </td>
                              <td style={{ padding: "8px 10px" }}>v{l.consent_version}</td>
                              <td style={{ padding: "8px 10px", color: "var(--muted)" }}>{fmt(l.created_at)}</td>
                              <td style={{ padding: "8px 10px", color: "var(--muted)", fontSize: 12 }}>{l.ip_address || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}

        {/* ── Citizens Tab (borgerstyring + kode-nulstilling) ── */}
        {tab === "citizens" && (
          <div className="fade-in">
            <h1 style={{ fontSize: 28, fontWeight: 700, marginBottom: 8 }}>Borgere</h1>
            <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 24 }}>Søg efter borgere og nulstil adgangskoder.</p>

            {/* Søgefelt */}
            <div style={{ ...cardStyle, marginBottom: 24 }}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Søg efter borger</h3>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  type="text"
                  value={citizenSearch}
                  onChange={e => setCitizenSearch(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && adminFetch(`/api/admin/citizens?q=${encodeURIComponent(citizenSearch)}`).then(r => r.ok ? r.json() : []).then(setCitizenResults)}
                  placeholder="Søg på email..."
                  style={{ flex: 1, padding: "12px 16px", borderRadius: 10, border: "1px solid var(--border)", fontSize: 15, outline: "none" }}
                />
                <button
                  onClick={() => adminFetch(`/api/admin/citizens?q=${encodeURIComponent(citizenSearch)}`).then(r => r.ok ? r.json() : []).then(d => { setCitizenResults(d); setResetResult(null); })}
                  style={{ padding: "12px 20px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}
                >
                  Søg
                </button>
              </div>
            </div>

            {/* Resultat af nulstilling — vises kun én gang */}
            {resetResult && (
              <div style={{ background: "#FFFBEB", border: "2px solid #F0C060", borderRadius: 14, padding: 20, marginBottom: 24 }}>
                <p style={{ fontWeight: 700, fontSize: 15, marginBottom: 8 }}>⚠️ Midlertidig adgangskode — vis kun til rette person</p>
                <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>Denne kode vises kun én gang. Giv den videre til borgeren mundtligt eller på papir.</p>
                <div style={{ display: "flex", alignItems: "center", gap: 12, background: "#fff", borderRadius: 10, padding: "14px 18px", border: "1px solid #F0C060" }}>
                  <code style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2, flex: 1 }}>{resetResult.temp_password}</code>
                  <button
                    onClick={() => navigator.clipboard.writeText(resetResult.temp_password)}
                    style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg)", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13 }}
                  >
                    Kopiér
                  </button>
                </div>
                <p style={{ fontSize: 13, color: "var(--muted)", marginTop: 10 }}>
                  Borger: <strong>{resetResult.citizen_email}</strong> &nbsp;·&nbsp;
                  Udløber: <strong>{fmt(resetResult.expires_at)}</strong> (24 timer)
                </p>
                <button onClick={() => setResetResult(null)} style={{ marginTop: 12, background: "none", border: "none", color: "var(--muted)", fontSize: 13, cursor: "pointer", fontFamily: "DM Sans" }}>
                  Luk
                </button>
              </div>
            )}

            {/* Søgeresultater */}
            {citizenResults.length > 0 && (
              <div style={cardStyle}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Resultater ({citizenResults.length})</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {citizenResults.map(c => (
                    <div key={c.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px", background: "var(--bg)", borderRadius: 10, flexWrap: "wrap", gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{c.email}</div>
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2, display: "flex", gap: 12 }}>
                          <span>Oprettet: {fmt(c.created_at)}</span>
                          <span>Svar: {c.response_count}</span>
                          {c.must_change_password && <span style={{ color: "#D97706", fontWeight: 600 }}>⚠️ Afventer kodeordsskift</span>}
                          {c.frozen && <span style={{ color: "var(--accent)", fontWeight: 600 }}>❄️ Fryst</span>}
                        </div>
                      </div>
                      <button
                        onClick={async () => {
                          if (!window.confirm(`Nulstil adgangskode for ${c.email}?`)) return;
                          const res = await adminFetch(`/api/admin/citizens/${c.id}/reset-password`, { method: "POST" });
                          if (res.ok) {
                            const data = await res.json();
                            setResetResult(data);
                            // Opdatér listen så status vises
                            setCitizenResults(prev => prev.map(x => x.id === c.id ? { ...x, must_change_password: true } : x));
                          }
                        }}
                        style={{ padding: "10px 16px", borderRadius: 10, border: "1px solid #D97706", background: "#FFFBEB", color: "#92400E", cursor: "pointer", fontFamily: "DM Sans", fontSize: 13, fontWeight: 600, flexShrink: 0 }}
                      >
                        Nulstil adgangskode
                      </button>
                    </div>
                  ))}
                </div>
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
              <textarea value={aiSettings.system_prompt}
                onChange={e => saveAISettings({ ...aiSettings, system_prompt: e.target.value })}
                style={{ width: "100%", minHeight: 200, padding: 14, borderRadius: 10, border: "1px solid var(--border)", fontSize: 14, lineHeight: 1.6, resize: "vertical", fontFamily: "DM Sans" }} />
            </div>
            <div style={cardStyle}>
              <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 14 }}>Perspektiv-tærskel</h3>
              <p style={{ fontSize: 14, color: "var(--muted)", marginBottom: 12 }}>
                Antal besvarelser før andre borgeres perspektiver inkluderes i opfølgningen.
              </p>
              <input type="number" value={aiSettings.perspective_threshold}
                onChange={e => saveAISettings({ ...aiSettings, perspective_threshold: parseInt(e.target.value) || 30 })}
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

const LoginScreen = ({ onLogin, onBack }) => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${API_BASE}/api/admin/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (res.ok) {
        const data = await res.json();
        onLogin(data.token);
      } else {
        setError("Forkert email eller adgangskode");
      }
    } catch {
      setError("Kunne ikke forbinde til serveren");
    } finally {
      setLoading(false);
    }
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
      <button onClick={handleLogin} disabled={loading}
        style={{ width: "100%", padding: "16px", borderRadius: 12, border: "none", background: "var(--primary)", color: "#fff", fontSize: 16, fontWeight: 600, cursor: loading ? "wait" : "pointer", fontFamily: "DM Sans", opacity: loading ? 0.7 : 1 }}>
        {loading ? "Logger ind..." : "Log ind"}
      </button>
    </div>
  );
};

// ═══════════════════════════════════════════════
// ─── MAIN APP ─────────────────────────────────
// ═══════════════════════════════════════════════

export default function App() {
  const [view, setView] = useState("citizen"); // citizen | login | admin
  const [adminToken, setAdminToken] = useState(null);

  return (
    <>
      <style>{css}</style>
      {view === "citizen" && (
        <CitizenFlow onAdminClick={() => setView("login")} />
      )}
      {view === "login" && (
        <LoginScreen onLogin={(token) => { setAdminToken(token); setView("admin"); }} onBack={() => setView("citizen")} />
      )}
      {view === "admin" && adminToken && (
        <AdminPanel adminToken={adminToken} onLogout={() => { setAdminToken(null); setView("citizen"); }} />
      )}
    </>
  );
}
