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

const AREAS = ["Grenaa", "Auning", "Ørsted", "Glesborg", "Allingåbro", "Bønnerup", "Trustrup", "Vivild", "Hemmed", "Ørum", "Andet"];
const AGE_GROUPS = ["Under 18", "18-29", "30-44", "45-59", "60-74", "75+"];
const ROLES = ["Borger", "Medarbejder i kommunen", "Erhvervsdrivende", "Andet"];

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

  const confirmAudio = () => { onRecorded(audioBlob); };
  const resetAudio = () => { setAudioBlob(null); setElapsed(0); };
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

const CitizenFlow = ({ onAdminClick }) => {
  // Steps: 0=welcome, 1=auth, 2=consent, 3=theme, 4=question, 5=followup, 6=metadata, 7=thanks, 8=profile
  const [step, setStep] = useState(0);
  const [citizenToken, setCitizenToken] = useState(null);
  const [citizen, setCitizen] = useState(null);
  const [themes, setThemes] = useState([]);
  const [themeQuestions, setThemeQuestions] = useState([]);
  const [myResponses, setMyResponses] = useState([]);
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
  const [lastResponseId, setLastResponseId] = useState(null);
  const sessionId = useRef(uid());
  const startTime = useRef(Date.now());
  const prevStep = useRef(0);

  // Load themes on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/themes`)
      .then(r => r.ok ? r.json() : [])
      .then(setThemes)
      .catch(() => {});
  }, []);

  // Load my responses when entering profile
  useEffect(() => {
    if (step === 8 && citizenToken) {
      apiFetch("/api/citizen/responses", {}, citizenToken)
        .then(r => r.ok ? r.json() : [])
        .then(setMyResponses)
        .catch(() => {});
    }
  }, [step, citizenToken]);

  // ─── Auth ───
  const handleRegister = async () => {
    if (!authEmail.trim() || !authCode.trim()) { setAuthError("Udfyld både email og kode"); return; }
    if (authCode.length < 4) { setAuthError("Koden skal være mindst 4 tegn"); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/citizen/register", {
        method: "POST",
        body: JSON.stringify({ email: authEmail.trim(), code: authCode }),
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
      setStep(2);
    } catch {
      setAuthError("Kunne ikke forbinde til serveren");
    } finally {
      setLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!authEmail.trim() || !authCode.trim()) { setAuthError("Udfyld både email og kode"); return; }
    setLoading(true);
    try {
      const res = await apiFetch("/api/citizen/login", {
        method: "POST",
        body: JSON.stringify({ email: authEmail.trim(), code: authCode }),
      });
      if (!res.ok) { setAuthError("Forkert email eller kode"); return; }
      const data = await res.json();
      setCitizenToken(data.token);
      setCitizen(data.citizen);
      setAuthError("");
      // Load existing metadata for profile form pre-fill
      const meRes = await apiFetch("/api/citizen/me", {}, data.token);
      if (meRes.ok) {
        const me = await meRes.json();
        if (me.metadata) {
          setMetaAge(me.metadata.age_group || "");
          setMetaArea(me.metadata.area || "");
          setMetaRole(me.metadata.role || "");
        }
      }
      if (data.citizen.consent_given) {
        setConsent(true);
        setShareMetadata(true);
        setStep(3);
      } else {
        setStep(2);
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
    setAuthCode("");
    setAuthError("");
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
      body: JSON.stringify({ age_group: metaAge || null, area: metaArea || null, role: metaRole || null }),
    }, citizenToken);
    setMetaSaved(true);
    setTimeout(() => setMetaSaved(false), 2000);
  };

  const handleConsent = async () => {
    if (!consent || !citizen) return;
    await apiFetch("/api/citizen/consent", {
      method: "PUT",
      body: JSON.stringify({ consent_given: true }),
    }, citizenToken);
    setCitizen({ ...citizen, consent_given: true });
    setStep(3);
  };

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
    let responseId = null;
    let textContent = answer;

    try {
      if (audioBlob) {
        const formData = new FormData();
        formData.append("file", audioBlob, "optagelse.webm");
        const url = `${API_BASE}/api/responses/audio?question_id=${encodeURIComponent(currentQuestion.id)}&session_id=${encodeURIComponent(sessionId.current)}`;
        const headers = citizenToken ? { Authorization: `Bearer ${citizenToken}` } : {};
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
            question_id: currentQuestion.id,
            session_id: sessionId.current,
            text_content: answer,
            response_type: "text",
            is_followup: false,
          }),
        }, citizenToken);
        if (res.ok) {
          const data = await res.json();
          responseId = data.id;
        }
      }

      setLastResponseId(responseId);

      if (currentQuestion.allow_followup) {
        const res = await apiFetch("/api/followup", {
          method: "POST",
          body: JSON.stringify({
            answer: textContent,
            question_id: currentQuestion.id,
            theme_name: selectedTheme.name,
            question_text: currentQuestion.body,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setFollowupQ(data.followup_question || "");
        }
      }
    } catch (e) {
      console.error("Submit error:", e);
    }

    setLoading(false);
    setStep(5);
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
    goToNextQuestion();
  };

  const submitMetadata = async () => {
    await apiFetch("/api/citizen/metadata", {
      method: "PUT",
      body: JSON.stringify({ age_group: metaAge || null, area: metaArea || null, role: metaRole || null }),
    }, citizenToken);
    setStep(7);
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
        {themes.map(theme => {
          const qCount = theme.question_count || 0;
          return (
            <button key={theme.id} onClick={async () => {
              if (qCount === 0) return;
              setSelectedTheme(theme);
              setQuestionIndex(0);
              const res = await fetch(`${API_BASE}/api/themes/${theme.id}/questions`);
              if (res.ok) setThemeQuestions(await res.json());
              setStep(4);
            }}
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
      <TopBar onBack={() => { setStep(3); setSelectedTheme(null); setThemeQuestions([]); setAnswer(""); setAudioBlob(null); }} backLabel="Skift tema" />
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
          <p style={{ fontSize: 15, lineHeight: 1.5 }}>19. august 2026 — kom og hør, hvad borgerne i Norddjurs mener. Alle er velkomne!</p>
        </div>
        <button onClick={() => { setStep(3); setSelectedTheme(null); setThemeQuestions([]); setQuestionIndex(0); setAnswer(""); setAudioBlob(null); setFollowupQ(""); setFollowupAnswer(""); setFollowupAudioBlob(null); setInputMode("text"); setFollowupInputMode("text"); sessionId.current = uid(); startTime.current = Date.now(); }} style={bs}>Besvar et nyt tema</button>
        <button onClick={() => { prevStep.current = 7; setStep(8); }} style={{ marginTop: 12, background: "none", border: "none", color: "var(--primary)", fontSize: 15, cursor: "pointer", fontFamily: "DM Sans", fontWeight: 500 }}>👤 Gå til min profil</button>
      </div>
    </div>
  );

  // ── Step 8: Profile ──
  if (step === 8 && citizen) {
    const mainResponses = myResponses.filter(r => !r.is_followup);
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

const AdminPanel = ({ adminToken, onLogout }) => {
  const [tab, setTab] = useState("dashboard");
  const [themes, setThemes] = useState([]);
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

  const adminFetch = (path, options = {}) => apiFetch(path, options, adminToken);

  // Load initial data
  useEffect(() => {
    const load = async () => {
      const [themesRes, questionsRes, dashRes, aiRes] = await Promise.all([
        fetch(`${API_BASE}/api/themes`),
        adminFetch("/api/admin/questions"),
        adminFetch("/api/admin/dashboard"),
        adminFetch("/api/admin/ai-settings"),
      ]);
      if (themesRes.ok) setThemes(await themesRes.json());
      if (questionsRes.ok) setQuestions(await questionsRes.json());
      if (dashRes.ok) setDashboard(await dashRes.json());
      if (aiRes.ok) setAiSettings(await aiRes.json());
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
    adminFetch(`/api/admin/responses?${params}`)
      .then(r => r.ok ? r.json() : { responses: [] })
      .then(data => setResponses(data.responses || []));
  }, [tab, filterTheme, filterAge, filterArea]);

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "chart" },
    { id: "questions", label: "Spørgsmål", icon: "questions" },
    { id: "responses", label: "Besvarelser", icon: "list" },
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

        {/* ── Questions Tab ── */}
        {tab === "questions" && (
          <div className="fade-in">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
              <h1 style={{ fontSize: 28, fontWeight: 700 }}>Spørgsmål</h1>
              <button onClick={() => setEditingQ({ id: uid(), theme_id: themes[0]?.id || "", title: "", body: "", is_active: true, allow_followup: true, followup_prompt: "", sort_order: 99 })}
                style={{ padding: "10px 20px", borderRadius: 10, border: "none", background: "var(--primary)", color: "#fff", cursor: "pointer", fontFamily: "DM Sans", fontSize: 14, fontWeight: 600 }}>
                + Nyt spørgsmål
              </button>
            </div>

            {editingQ && (
              <div style={{ ...cardStyle, borderColor: "var(--primary)" }}>
                <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 16 }}>{questions.find(q => q.id === editingQ.id) ? "Rediger" : "Nyt"} spørgsmål</h3>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <label style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, display: "block" }}>Tema</label>
                    <select value={editingQ.theme_id} onChange={e => setEditingQ({ ...editingQ, theme_id: e.target.value })}
                      style={{ width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", fontSize: 14 }}>
                      {themes.map(t => <option key={t.id} value={t.id}>{t.icon} {t.name}</option>)}
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

            {themes.map(theme => {
              const themeQs = questions.filter(q => q.theme_id === theme.id).sort((a,b) => a.sort_order - b.sort_order);
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
                        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>
                          <span>{q.allow_followup ? "✅ Opfølgning" : "❌ Ingen opfølgning"}</span>
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
                {AREAS.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <span style={{ fontSize: 13, color: "var(--muted)", alignSelf: "center" }}>{responses.length} resultater</span>
            </div>

            {responses.map(r => {
              const q = r.question;
              const t = r.theme;
              const meta = r.metadata;
              const followup = r.followup_response;
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
