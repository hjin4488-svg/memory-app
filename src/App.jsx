import { useState, useEffect, useRef } from "react";

const DAYS = ["일","월","화","수","목","금","토"];
const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const COLORS = ["#4ECDC4","#FF6B6B","#FFE66D","#A8E6CF","#C3B1E1","#FF9F43","#54A0FF","#5F27CD","#01CBC6","#EE5A24"];

const DEFAULT_CATEGORIES = [
  { id: "schedule", label: "📅 약속/일정", color: "#4ECDC4" },
  { id: "shopping", label: "🛒 쇼핑", color: "#FF6B6B" },
  { id: "word", label: "📝 단어/메모", color: "#FFE66D" },
  { id: "delivery", label: "📦 배송", color: "#A8E6CF" },
  { id: "etc", label: "💡 기타", color: "#C3B1E1" },
];

function formatDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getMonth()+1}/${d.getDate()} (${DAYS[d.getDay()]})`;
}
function formatTime(isoStr) {
  const d = new Date(isoStr);
  const h = d.getHours(), m = String(d.getMinutes()).padStart(2,"0");
  return `${h<12?"오전":"오후"} ${h%12||12}:${m}`;
}
function getToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function getTomorrow() {
  const d = new Date(); d.setDate(d.getDate()+1);
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}

function getDday(dateStr) {
  const today = new Date(); today.setHours(0,0,0,0);
  const target = new Date(dateStr + "T00:00:00");
  const diff = Math.round((target - today) / 86400000);
  if (diff === 0) return { label: "오늘", color: "#FF6B6B" };
  if (diff < 0) return { label: `${Math.abs(diff)}일 지남`, color: "#555" };
  if (diff <= 3) return { label: `D-${diff}`, color: "#FF9F43" };
  return { label: `D-${diff}`, color: "#888" };
}

function similarityCheck(text1, text2) {
  const t1 = text1.toLowerCase().replace(/\s/g,"");
  const t2 = text2.toLowerCase().replace(/\s/g,"");
  if (t1.includes(t2) || t2.includes(t1)) return true;
  const words1 = t1.split(/[,.\s]/);
  const words2 = t2.split(/[,.\s]/);
  const common = words1.filter(w => w.length > 1 && words2.some(w2 => w2.includes(w) || w.includes(w2)));
  return common.length >= 2;
}

async function callAI(rawText, categories, todayStr, tomorrowStr) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const date = now.getDate();
  const dayOfWeek = now.getDay();
  const dayNames = ["일","월","화","수","목","금","토"];

  const catList = categories.map(c => `${c.id}(${c.label.replace(/[^\w가-힣]/g,"")})`).join(", ");
  const prompt = `오늘 날짜 정보:
- 오늘: ${year}년 ${month}월 ${date}일 (${dayNames[dayOfWeek]}요일)
- 오늘 날짜 문자열: ${todayStr}
- 내일 날짜 문자열: ${tomorrowStr}
- 올해: ${year}년

현재 카테고리 목록: ${catList}

사용자가 말한 내용: "${rawText}"

아래 세 가지 경우 중 하나로 판단하세요.

[경우 1] 일반 메모/기억 저장:
- summary: 핵심 한 줄 요약 (말버릇 "어","음","그거" 등 제거)
- category: 기존 카테고리 ID 중 적합한 것. 없으면 새 카테고리 한글 이름
- isNewCategory: 새 카테고리면 true
- date: 말 속 날짜를 YYYY-MM-DD 형식으로 정확히 변환
  * "5월 16일" → ${year}-05-16
  * "6월 1일" → ${year}-06-01
  * "내일" → ${tomorrowStr}
  * "다음주 월요일" → 오늘(${dayOfWeek}요일)부터 다음 월요일 계산
  * 날짜 언급 없으면 → ${todayStr}
- isRepeat: "매주","매일","매달" 언급시 true
- repeatRule: "weekly-MON","daily","monthly-15" 형태
- priority: "urgent"(급해/중요/빨리) 또는 "normal"
- type: "memo"

[경우 2] 앱 수정 명령:
- type: "command"
- action: "merge" | "rename" | "delete"
- targets: 카테고리 ID 배열
- newName: 새 이름
- newId: 합칠 때 남길 ID

[경우 3] 리포트 요청 ("이번주 뭐했어","이번달 뭐 샀어"):
- type: "report"
- period: "week" 또는 "month"

반드시 JSON만 출력 (마크다운 절대 금지):`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{ role: "user", content: prompt }]
    })
  });
  const data = await res.json();
  const text = data.content?.map(c => c.text||"").join("") || "";
  return JSON.parse(text.replace(/```json|```/g,"").trim());
}

async function generateReport(memos, categories, period) {
  const now = new Date();
  const cutoff = new Date();
  if (period === "week") cutoff.setDate(now.getDate() - 7);
  else cutoff.setDate(1);
  const recent = memos.filter(m => new Date(m.date) >= cutoff);
  if (!recent.length) return "해당 기간에 메모가 없어요.";
  const summary = recent.map(m => {
    const cat = categories.find(c => c.id === m.category);
    return `[${cat?.label||m.category}] ${m.text} (${m.date})${m.done?" ✓":""}`;
  }).join("\n");
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      messages: [{ role: "user", content: `다음은 사용자의 ${period==="week"?"이번 주":"이번 달"} 메모 목록이에요. 친근하고 간결하게 요약해주세요. 완료된 것과 미완료 구분해서, 2-3문장으로:\n${summary}` }]
    })
  });
  const data = await res.json();
  return data.content?.map(c => c.text||"").join("") || "요약 실패";
}

export default function App() {
  const [categories, setCategories] = useState(() => {
    try { return JSON.parse(localStorage.getItem("cats-v4")) || DEFAULT_CATEGORIES; } catch { return DEFAULT_CATEGORIES; }
  });
  const [memos, setMemos] = useState(() => {
    try { return JSON.parse(localStorage.getItem("memos-v4")) || []; } catch { return []; }
  });
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [commandResult, setCommandResult] = useState(null);
  const [reportText, setReportText] = useState(null);
  const [duplicates, setDuplicates] = useState([]);
  const [selectedCat, setSelectedCat] = useState("etc");
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [recordedAt, setRecordedAt] = useState(null);
  const [filter, setFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [view, setView] = useState("list");
  const [calMonth, setCalMonth] = useState(new Date());
  const [showDone, setShowDone] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const [micSupport, setMicSupport] = useState(true);
  const [photoMap, setPhotoMap] = useState({});
  const fileInputRef = useRef(null);
  const attachingIdRef = useRef(null);
  const recognitionRef = useRef(null);

  useEffect(() => { try { localStorage.setItem("cats-v4", JSON.stringify(categories)); } catch {} }, [categories]);
  useEffect(() => { try { localStorage.setItem("memos-v4", JSON.stringify(memos)); } catch {} }, [memos]);
  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) setMicSupport(false);
  }, []);

  useEffect(() => {
    const old = memos.filter(m => {
      if (m.done) return false;
      const days = Math.round((new Date() - new Date(m.recordedAt||m.date+"T00:00:00")) / 86400000);
      return days >= 7;
    });
    if (old.length > 0 && !sessionStorage.getItem("notified")) {
      sessionStorage.setItem("notified","1");
      setTimeout(() => setCommandResult(`⏰ 오래된 메모 ${old.length}개가 있어요! 혹시 잊으신 거 아닌가요?`), 1000);
    }
  }, []);

  const catOf = (id) => categories.find(c => c.id === id) || { label: id, color: "#888" };
  const nextColor = () => COLORS[categories.length % COLORS.length];

  // 녹음 토글 (한번 누르면 시작, 다시 누르면 종료 후 자동 AI 분석)
  const toggleRecording = () => {
    if (recording) {
      // 종료
      recognitionRef.current?.stop();
      setRecording(false);
    } else {
      // 시작
      if (!micSupport) return;
      const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
      const r = new SR();
      r.lang = "ko-KR"; r.interimResults = true; r.continuous = true;
      recognitionRef.current = r;
      r.onresult = (e) => setTranscript(Array.from(e.results).map(x => x[0].transcript).join(""));
      r.onend = () => {
        setRecording(false);
      };
      r.onerror = () => setRecording(false);
      r.start();
      setRecording(true);
      setAiResult(null); setCommandResult(null); setReportText(null); setDuplicates([]);
      setRecordedAt(new Date().toISOString());
    }
  };

  // 녹음 종료 후 자동 AI 분석
  useEffect(() => {
    if (!recording && transcript.trim() && !aiResult && !aiProcessing) {
      runAI(transcript);
    }
  }, [recording]);

  const runAI = async (text) => {
    const t = text || transcript;
    if (!t.trim()) return;
    setAiProcessing(true);
    setAiResult(null); setCommandResult(null); setReportText(null); setDuplicates([]);
    try {
      const result = await callAI(t, categories, getToday(), getTomorrow());

      if (result.type === "report") {
        const reportStr = await generateReport(memos, categories, result.period);
        setReportText(reportStr);
        setTranscript(""); setRecordedAt(null);
      } else if (result.type === "command") {
        if (result.action === "merge" && result.targets?.length >= 2) {
          const keepId = result.newId || result.targets[0];
          const removeIds = result.targets.filter(id => id !== keepId);
          setCategories(prev => prev.map(c => c.id===keepId ? {...c, label:"📌 "+result.newName} : c).filter(c => !removeIds.includes(c.id)));
          setMemos(prev => prev.map(m => removeIds.includes(m.category) ? {...m, category:keepId} : m));
          setCommandResult(`✅ 카테고리를 "${result.newName}"으로 합쳤어요!`);
        } else if (result.action === "rename" && result.targets?.[0]) {
          setCategories(prev => prev.map(c => c.id===result.targets[0] ? {...c, label:"📌 "+result.newName} : c));
          setCommandResult(`✅ 카테고리 이름을 "${result.newName}"으로 변경했어요!`);
        } else if (result.action === "delete" && result.targets?.[0]) {
          setCategories(prev => prev.filter(c => !result.targets.includes(c.id)));
          setCommandResult(`✅ 카테고리를 삭제했어요!`);
        }
        setTranscript(""); setRecordedAt(null);
      } else {
        if (result.isNewCategory && result.category) {
          const newCat = { id: "cat_"+Date.now(), label: "📌 "+result.category, color: nextColor() };
          setCategories(prev => [...prev, newCat]);
          result.categoryId = newCat.id;
        } else {
          result.categoryId = result.category;
        }
        setSelectedCat(result.categoryId || "etc");
        setSelectedDate(result.date || getToday());
        const dups = memos.filter(m => !m.done && similarityCheck(m.text, result.summary));
        setDuplicates(dups);
        setAiResult(result);
      }
    } catch {
      setAiResult({ type:"memo", summary:t, categoryId:selectedCat, date:getToday(), priority:"normal" });
    }
    setAiProcessing(false);
  };

  const saveMemo = () => {
    const text = aiResult?.summary || transcript.trim();
    if (!text) return;
    setMemos(prev => [{
      id: Date.now(), text,
      rawText: transcript.trim(),
      category: selectedCat,
      date: selectedDate,
      recordedAt: recordedAt || new Date().toISOString(),
      done: false,
      priority: aiResult?.priority || "normal",
      isRepeat: aiResult?.isRepeat || false,
      repeatRule: aiResult?.repeatRule || "",
    }, ...prev]);
    setTranscript(""); setAiResult(null); setRecordedAt(null); setDuplicates([]);
  };

  const toggleDone = (id) => setMemos(prev => prev.map(m => m.id===id ? {...m, done:!m.done} : m));
  const deleteMemo = (id) => setMemos(prev => prev.filter(m => m.id!==id));

  const handlePhoto = (e) => {
    const file = e.target.files?.[0];
    if (!file || !attachingIdRef.current) return;
    const reader = new FileReader();
    reader.onload = (ev) => setPhotoMap(prev => ({...prev, [attachingIdRef.current]: ev.target.result}));
    reader.readAsDataURL(file);
  };

  const filtered = memos.filter(m => {
    if (!showDone && m.done) return false;
    if (filter !== "all" && m.category !== filter) return false;
    if (searchQuery && !m.text.includes(searchQuery) && !(m.rawText||"").includes(searchQuery)) return false;
    return true;
  });

  const calYear = calMonth.getFullYear(), calMonthIdx = calMonth.getMonth();
  const firstDay = new Date(calYear, calMonthIdx, 1).getDay();
  const daysInMonth = new Date(calYear, calMonthIdx+1, 0).getDate();
  const calCells = Array(firstDay).fill(null).concat(Array.from({length:daysInMonth},(_,i)=>i+1));
  while (calCells.length%7!==0) calCells.push(null);
  const memosByDate = {};
  memos.forEach(m => { if (!memosByDate[m.date]) memosByDate[m.date]=[]; memosByDate[m.date].push(m); });
  const getDateStr = (day) => !day ? null : `${calYear}-${String(calMonthIdx+1).padStart(2,"0")}-${String(day).padStart(2,"0")}`;

  const MemoCard = ({ memo, compact }) => {
    const cat = catOf(memo.category);
    const isExp = expandedId === memo.id;
    const dday = getDday(memo.date);
    const photo = photoMap[memo.id];
    const isUrgent = memo.priority === "urgent";
    return (
      <div style={{
        background:"#1a1a24", borderRadius:16,
        padding: compact ? "10px 14px" : "14px 16px",
        display:"flex", alignItems:"flex-start", gap:12,
        borderLeft:`3px solid ${isUrgent?"#FF6B6B":cat.color}`,
        opacity: memo.done?0.45:1, transition:"opacity .2s",
        boxShadow: isUrgent&&!memo.done?"0 0 12px #FF6B6B22":"none",
      }}>
        <button onClick={()=>toggleDone(memo.id)} style={{
          width:compact?18:22, height:compact?18:22,
          borderRadius:"50%", border:`2px solid ${cat.color}`,
          background: memo.done?cat.color:"transparent",
          cursor:"pointer", flexShrink:0, marginTop:2,
          display:"flex", alignItems:"center", justifyContent:"center",
          fontSize:9, color:"#0f0f14", fontWeight:900,
        }}>{memo.done?"✓":""}</button>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginBottom:3 }}>
            {isUrgent&&!memo.done && <span style={{ fontSize:11, color:"#FF6B6B", fontWeight:800 }}>🔴 급함</span>}
            {memo.isRepeat && <span style={{ fontSize:10, color:"#888" }}>🔁</span>}
          </div>
          <div style={{
            fontSize:compact?13:15, fontWeight:600, lineHeight:1.4,
            textDecoration:memo.done?"line-through":"none", wordBreak:"break-word",
          }}>{memo.text}</div>
          {photo&&!compact && (
            <img src={photo} alt="첨부" style={{ marginTop:8, width:"100%", maxHeight:160, objectFit:"cover", borderRadius:8 }} />
          )}
          <div style={{ display:"flex", gap:6, marginTop:5, alignItems:"center", flexWrap:"wrap" }}>
            <span style={{
              fontSize:11, background:cat.color+"22", color:cat.color,
              borderRadius:6, padding:"2px 7px", fontWeight:700,
            }}>{cat.label}</span>
            <span style={{ fontSize:11, color:"#666" }}>{formatDate(memo.date)}</span>
            {!memo.done && <span style={{ fontSize:11, color:dday.color, fontWeight:700 }}>{dday.label}</span>}
            {memo.recordedAt && <span style={{ fontSize:11, color:"#555" }}>🕐 {formatTime(memo.recordedAt)}</span>}
            {memo.rawText&&memo.rawText!==memo.text && (
              <button onClick={()=>setExpandedId(isExp?null:memo.id)} style={{
                fontSize:11, color:"#555", background:"none", border:"none",
                cursor:"pointer", padding:0, textDecoration:"underline",
              }}>{isExp?"원문 닫기":"원문 보기"}</button>
            )}
            {!compact && (
              <button onClick={()=>{ attachingIdRef.current=memo.id; fileInputRef.current?.click(); }} style={{
                fontSize:11, color:"#555", background:"none", border:"none", cursor:"pointer", padding:0,
              }}>📷 {photo?"사진변경":"사진추가"}</button>
            )}
          </div>
          {isExp&&memo.rawText && (
            <div style={{
              marginTop:8, padding:"8px 10px", background:"#111118",
              borderRadius:8, fontSize:12, color:"#666", lineHeight:1.5, fontStyle:"italic",
            }}>🎙 "{memo.rawText}"</div>
          )}
        </div>
        <button onClick={()=>deleteMemo(memo.id)} style={{
          background:"none", border:"none", color:"#444", fontSize:16,
          cursor:"pointer", padding:0, lineHeight:1, flexShrink:0,
        }}>×</button>
      </div>
    );
  };

  return (
    <div style={{
      minHeight:"100vh", background:"#0f0f14", color:"#f0ede8",
      fontFamily:"'Noto Sans KR','Apple SD Gothic Neo',sans-serif",
      display:"flex", flexDirection:"column", alignItems:"center", padding:"0 0 80px",
    }}>
      <input type="file" accept="image/*" ref={fileInputRef} onChange={handlePhoto} style={{ display:"none" }} />

      {/* Header */}
      <div style={{ width:"100%", maxWidth:480, padding:"28px 20px 0", boxSizing:"border-box" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div>
            <div style={{ fontSize:11, letterSpacing:3, color:"#888", textTransform:"uppercase", marginBottom:2 }}>Smart Memory</div>
            <div style={{ fontSize:26, fontWeight:800, letterSpacing:-1 }}>나의 기억 도우미</div>
          </div>
          <div style={{
            background:"linear-gradient(135deg,#4ECDC4,#44A5FF)",
            borderRadius:14, padding:"8px 14px", fontSize:13, fontWeight:700, color:"#fff",
          }}>{memos.filter(m=>!m.done).length}개 남음</div>
        </div>
        <div style={{ display:"flex", gap:8, marginTop:20 }}>
          {["list","calendar"].map(v=>(
            <button key={v} onClick={()=>setView(v)} style={{
              flex:1, padding:"10px 0", borderRadius:12, border:"none", cursor:"pointer",
              fontWeight:700, fontSize:14,
              background:view===v?"#4ECDC4":"#1e1e28",
              color:view===v?"#0f0f14":"#888",
            }}>{v==="list"?"📋 목록":"📅 캘린더"}</button>
          ))}
        </div>
      </div>

      {/* Recording Panel */}
      <div style={{ width:"100%", maxWidth:480, padding:"16px 20px 0", boxSizing:"border-box" }}>
        <div style={{
          background:"#1a1a24", borderRadius:20, padding:18,
          border: recording?"1.5px solid #FF6B6B":aiProcessing?"1.5px solid #FFE66D":"1.5px solid #2a2a38",
          transition:"border .3s",
        }}>
          <div style={{ fontSize:12, color:"#555", marginBottom:10, lineHeight:1.6 }}>
            💡 버튼 눌러 말하고 → 다시 누르면 자동 분석돼요<br/>
            <span style={{ color:"#444" }}>"5월 16일 희태 결혼식" / "급하게 내일 병원 예약"</span>
          </div>

          {/* Transcript */}
          <div style={{
            background:"#111118", borderRadius:10, padding:"10px 12px", minHeight:52,
            marginBottom:10, fontSize:14, lineHeight:1.6,
            color:transcript?"#bbb":"#444", fontStyle:transcript?"italic":"normal",
          }}>
            {transcript||(recording?"듣는 중...":"버튼을 누르고 자유롭게 말해보세요")}
            {recording && <span style={{
              display:"inline-block", width:7, height:7, background:"#FF6B6B",
              borderRadius:"50%", marginLeft:6, animation:"blink 1s infinite", verticalAlign:"middle",
            }}/>}
          </div>

          {/* Duplicate warning */}
          {duplicates.length>0 && (
            <div style={{
              background:"#1f1400", borderRadius:10, padding:"10px 14px", marginBottom:10,
              border:"1px solid #FF9F4333",
            }}>
              <div style={{ fontSize:12, color:"#FF9F43", fontWeight:700, marginBottom:6 }}>⚠️ 비슷한 메모가 이미 있어요!</div>
              {duplicates.map(d=>(
                <div key={d.id} style={{ fontSize:12, color:"#888", marginBottom:3 }}>• {d.text}</div>
              ))}
              <div style={{ fontSize:11, color:"#666", marginTop:4 }}>그래도 저장하시겠어요?</div>
            </div>
          )}

          {/* Command result */}
          {commandResult && (
            <div style={{
              background:"#0d1f14", borderRadius:10, padding:"10px 14px", marginBottom:10,
              border:"1px solid #4ECDC433", fontSize:14, color:"#4ECDC4", fontWeight:600,
            }}>{commandResult}</div>
          )}

          {/* Report */}
          {reportText && (
            <div style={{
              background:"#0d1520", borderRadius:10, padding:"12px 14px", marginBottom:10,
              border:"1px solid #44A5FF33",
            }}>
              <div style={{ fontSize:11, color:"#44A5FF", fontWeight:700, marginBottom:6 }}>📊 AI 리포트</div>
              <div style={{ fontSize:14, color:"#f0ede8", lineHeight:1.7 }}>{reportText}</div>
            </div>
          )}

          {/* AI result */}
          {(aiProcessing||aiResult) && (
            <div style={{
              background:"#0d1520", borderRadius:10, padding:"12px 14px", marginBottom:10,
              border:"1px solid #44A5FF33",
            }}>
              {aiProcessing?(
                <div style={{ fontSize:13, color:"#44A5FF", display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ display:"inline-block", animation:"spin 1s linear infinite" }}>✦</span>
                  AI가 분석하는 중...
                </div>
              ):(
                <>
                  <div style={{ fontSize:11, color:"#44A5FF", fontWeight:700, marginBottom:6 }}>✦ AI 분석 결과</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:6 }}>
                    {aiResult.priority==="urgent" && <span style={{ fontSize:12, color:"#FF6B6B", fontWeight:800 }}>🔴 급함</span>}
                    {aiResult.isRepeat && <span style={{ fontSize:12, color:"#888" }}>🔁 반복: {aiResult.repeatRule}</span>}
                  </div>
                  <div style={{ fontSize:16, fontWeight:700, color:"#f0ede8", marginBottom:10, lineHeight:1.4 }}>{aiResult.summary}</div>
                  <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
                    <span style={{ fontSize:12, color:"#666" }}>📅</span>
                    <input type="date" value={selectedDate} onChange={e=>setSelectedDate(e.target.value)} style={{
                      background:"#1e1e28", border:"none", borderRadius:8,
                      color:"#f0ede8", padding:"4px 10px", fontSize:13,
                    }}/>
                    {recordedAt && <span style={{ fontSize:11, color:"#4ECDC4" }}>🕐 {formatTime(recordedAt)}</span>}
                  </div>
                  <div style={{ display:"flex", gap:6, flexWrap:"wrap" }}>
                    {categories.map(c=>(
                      <button key={c.id} onClick={()=>setSelectedCat(c.id)} style={{
                        padding:"4px 11px", borderRadius:20, border:"none", cursor:"pointer",
                        fontSize:11, fontWeight:700, transition:"all .15s",
                        background:selectedCat===c.id?c.color:"#1e1e28",
                        color:selectedCat===c.id?"#0f0f14":"#888",
                      }}>{c.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* 버튼: 녹음 + 저장 */}
          <div style={{ display:"flex", gap:8 }}>
            {micSupport?(
              <button onClick={toggleRecording} style={{
                flex:3, padding:"15px 0", borderRadius:13, border:"none", cursor:"pointer",
                background: recording
                  ?"linear-gradient(135deg,#FF6B6B,#FF8E8E)"
                  :"linear-gradient(135deg,#4ECDC4,#44A5FF)",
                color:"#0f0f14", fontWeight:800, fontSize:15,
                transform:recording?"scale(0.97)":"scale(1)",
                boxShadow:recording?"0 0 20px #FF6B6B44":"none",
                transition:"all .15s",
              }}>{recording?"🔴 녹음 중 (눌러서 완료)":"🎙 눌러서 말하기"}</button>
            ):(
              <div style={{ flex:3, padding:"15px 0", textAlign:"center", fontSize:12, color:"#666", background:"#1e1e28", borderRadius:13 }}>
                Chrome에서 음성인식 가능
              </div>
            )}
            <button onClick={saveMemo} disabled={!aiResult&&!transcript.trim()} style={{
              flex:1, padding:"15px 0", borderRadius:13, border:"none",
              cursor:(aiResult||transcript.trim())?"pointer":"default",
              background:aiResult?"#A8E6CF":transcript.trim()?"#f0ede822":"#2a2a38",
              color:(aiResult||transcript.trim())?"#0f0f14":"#555",
              fontWeight:800, fontSize:15, transition:"all .15s",
            }}>저장 ✓</button>
          </div>

          {/* 직접 입력 */}
          <input type="text" placeholder="직접 입력 후 엔터..."
            value={transcript} onChange={e=>{setTranscript(e.target.value);setAiResult(null);setCommandResult(null);setReportText(null);setDuplicates([]);}}
            onKeyDown={e=>e.key==="Enter"&&runAI(e.target.value)}
            style={{
              marginTop:10, width:"100%", background:"#111118",
              border:"1px solid #2a2a38", borderRadius:10,
              color:"#f0ede8", padding:"8px 12px", fontSize:13,
            }}/>
        </div>
      </div>

      {/* List / Calendar */}
      <div style={{ width:"100%", maxWidth:480, padding:"16px 20px 0", boxSizing:"border-box" }}>
        {view==="list" && (
          <>
            <div style={{ position:"relative", marginBottom:12 }}>
              <input type="text" placeholder="🔍 메모 검색..."
                value={searchQuery} onChange={e=>setSearchQuery(e.target.value)}
                style={{
                  width:"100%", background:"#1a1a24", border:"1px solid #2a2a38",
                  borderRadius:12, color:"#f0ede8", padding:"10px 14px", fontSize:13,
                }}/>
              {searchQuery && (
                <button onClick={()=>setSearchQuery("")} style={{
                  position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                  background:"none", border:"none", color:"#666", cursor:"pointer", fontSize:16,
                }}>×</button>
              )}
            </div>
            <div style={{ display:"flex", gap:6, marginBottom:12, overflowX:"auto", paddingBottom:4 }}>
              <button onClick={()=>setFilter("all")} style={{
                padding:"5px 13px", borderRadius:20, border:"none", cursor:"pointer",
                fontWeight:700, fontSize:12, whiteSpace:"nowrap",
                background:filter==="all"?"#f0ede8":"#1e1e28",
                color:filter==="all"?"#0f0f14":"#888",
              }}>전체</button>
              {categories.map(c=>(
                <button key={c.id} onClick={()=>setFilter(c.id)} style={{
                  padding:"5px 13px", borderRadius:20, border:"none", cursor:"pointer",
                  fontWeight:700, fontSize:12, whiteSpace:"nowrap",
                  background:filter===c.id?c.color:"#1e1e28",
                  color:filter===c.id?"#0f0f14":"#888",
                }}>{c.label}</button>
              ))}
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:10 }}>
              <div style={{ fontSize:12, color:"#555" }}>{filtered.length}개</div>
              <button onClick={()=>setShowDone(!showDone)} style={{
                background:"none", border:"1px solid #2a2a38", borderRadius:8,
                color:"#666", padding:"4px 10px", fontSize:11, cursor:"pointer",
              }}>{showDone?"완료 숨기기":"완료 보기"}</button>
            </div>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {filtered.length===0 && (
                <div style={{ textAlign:"center", color:"#444", padding:"40px 0", fontSize:14 }}>
                  {searchQuery?`"${searchQuery}" 검색 결과가 없어요`:"메모가 없어요 🙂"}
                </div>
              )}
              {filtered.map(memo=><MemoCard key={memo.id} memo={memo}/>)}
            </div>
          </>
        )}

        {view==="calendar" && (
          <>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:14 }}>
              <button onClick={()=>setCalMonth(new Date(calYear,calMonthIdx-1))} style={{
                background:"#1e1e28", border:"none", color:"#f0ede8", width:34, height:34, borderRadius:10, fontSize:18, cursor:"pointer",
              }}>‹</button>
              <div style={{ fontWeight:800, fontSize:17 }}>{calYear}년 {MONTHS[calMonthIdx]}</div>
              <button onClick={()=>setCalMonth(new Date(calYear,calMonthIdx+1))} style={{
                background:"#1e1e28", border:"none", color:"#f0ede8", width:34, height:34, borderRadius:10, fontSize:18, cursor:"pointer",
              }}>›</button>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3, marginBottom:3 }}>
              {DAYS.map((d,i)=>(
                <div key={d} style={{
                  textAlign:"center", fontSize:11, fontWeight:700, padding:"3px 0",
                  color:i===0?"#FF6B6B":i===6?"#44A5FF":"#666",
                }}>{d}</div>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:3 }}>
              {calCells.map((day,i)=>{
                const dateStr=getDateStr(day);
                const dayMemos=dateStr?(memosByDate[dateStr]||[]):[];
                const isToday=dateStr===getToday();
                const hasUrgent=dayMemos.some(m=>m.priority==="urgent"&&!m.done);
                return (
                  <div key={i} style={{
                    background:isToday?"#1e2a38":day?"#1a1a24":"transparent",
                    borderRadius:10, minHeight:56, padding:"5px 4px 4px",
                    border:hasUrgent?"1.5px solid #FF6B6B55":isToday?"1.5px solid #44A5FF":"1.5px solid transparent",
                  }}>
                    {day&&(
                      <>
                        <div style={{
                          fontSize:11, fontWeight:700, marginBottom:3,
                          color:isToday?"#44A5FF":i%7===0?"#FF6B6B88":i%7===6?"#44A5FF88":"#666",
                        }}>{day}</div>
                        <div style={{ display:"flex", flexDirection:"column", gap:2 }}>
                          {dayMemos.slice(0,2).map(m=>(
                            <div key={m.id} style={{
                              width:"100%", height:4, borderRadius:2,
                              background:m.priority==="urgent"?"#FF6B6B":catOf(m.category).color,
                              opacity:m.done?0.3:1,
                            }}/>
                          ))}
                          {dayMemos.length>2&&<div style={{ fontSize:8, color:"#666", textAlign:"center" }}>+{dayMemos.length-2}</div>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {memos.filter(m=>m.date.startsWith(`${calYear}-${String(calMonthIdx+1).padStart(2,"0")}`)).length>0&&(
              <div style={{ marginTop:18 }}>
                <div style={{ fontSize:12, color:"#666", marginBottom:10 }}>이번 달 메모</div>
                <div style={{ display:"flex", flexDirection:"column", gap:8 }}>
                  {memos
                    .filter(m=>m.date.startsWith(`${calYear}-${String(calMonthIdx+1).padStart(2,"0")}`))
                    .sort((a,b)=>a.date.localeCompare(b.date))
                    .map(memo=><MemoCard key={memo.id} memo={memo} compact/>)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing:border-box; -webkit-tap-highlight-color:transparent; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter:invert(0.5); }
        input { outline:none; }
        ::-webkit-scrollbar { height:4px; }
        ::-webkit-scrollbar-thumb { background:#333; border-radius:2px; }
      `}</style>
    </div>
  );
}
