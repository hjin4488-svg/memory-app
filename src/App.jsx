import { useState, useEffect, useRef } from "react";

const CATEGORIES = [
  { id: "schedule", label: "📅 일정", color: "#4ECDC4" },
  { id: "shopping", label: "🛒 쇼핑", color: "#FF6B6B" },
  { id: "word", label: "📝 단어/메모", color: "#FFE66D" },
  { id: "delivery", label: "📦 배송", color: "#A8E6CF" },
  { id: "etc", label: "💡 기타", color: "#C3B1E1" },
];

const MONTHS = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
const DAYS = ["일","월","화","수","목","금","토"];

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return `${d.getMonth()+1}/${d.getDate()} (${DAYS[d.getDay()]})`;
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2,"0");
  const ampm = h < 12 ? "오전" : "오후";
  const hh = h % 12 || 12;
  return `${ampm} ${hh}:${m}`;
}

function getToday() {
  return new Date().toISOString().split("T")[0];
}

const initialMemos = [
  { id: 1, text: "헤드앤숄더 샴푸 주문 완료 — 재주문 금지", rawText: "아 샴푸 어 헤드앤숄더 그거 이미 주문했어 재주문 하면 안됨", category: "delivery", date: "2026-05-10", recordedAt: "2026-05-10T14:23:00", done: false },
  { id: 2, text: "아빠 생일 케이크 예약 (5월 15일)", rawText: "아빠 생일이 곧인데 케이크 예약해야 되는데 어 15일이잖아", category: "schedule", date: "2026-05-15", recordedAt: "2026-05-12T09:05:00", done: false },
  { id: 3, text: "코르티솔 = 스트레스 호르몬", rawText: "코르티솔인가 그게 뭐냐면 스트레스 받을 때 나오는 호르몬", category: "word", date: "2026-05-12", recordedAt: "2026-05-12T11:42:00", done: false },
];

async function callAI(rawText) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      messages: [{
        role: "user",
        content: `다음은 사용자가 두서없이 말한 내용입니다. 핵심 내용만 간결하게 한 줄로 정리해주세요. 불필요한 말버릇("어", "음", "그거", "뭐냐면" 등)은 제거하고, 기억해야 할 핵심 정보만 남겨주세요. 또한 아래 카테고리 중 가장 적합한 것을 하나 골라주세요.

카테고리: schedule(일정/약속), shopping(살 물건), word(단어/메모/정보), delivery(주문/배송), etc(기타)

응답은 반드시 아래 JSON 형식만 출력하세요 (마크다운 없이):
{"summary": "정리된 내용", "category": "카테고리ID"}

사용자 발화: "${rawText}"`
      }]
    })
  });
  const data = await res.json();
  const text = data.content?.map(c => c.text || "").join("") || "";
  const clean = text.replace(/```json|```/g, "").trim();
  return JSON.parse(clean);
}

export default function App() {
  const [memos, setMemos] = useState(() => {
    try {
      const saved = localStorage.getItem("smart-memos-v2");
      return saved ? JSON.parse(saved) : initialMemos;
    } catch { return initialMemos; }
  });
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiResult, setAiResult] = useState(null);
  const [selectedCat, setSelectedCat] = useState("etc");
  const [selectedDate, setSelectedDate] = useState(getToday());
  const [recordedAt, setRecordedAt] = useState(null);
  const [filter, setFilter] = useState("all");
  const [view, setView] = useState("list");
  const [calMonth, setCalMonth] = useState(new Date());
  const [showDone, setShowDone] = useState(false);
  const [expandedId, setExpandedId] = useState(null);
  const recognitionRef = useRef(null);
  const [micSupport, setMicSupport] = useState(true);

  useEffect(() => {
    try { localStorage.setItem("smart-memos-v2", JSON.stringify(memos)); } catch {}
  }, [memos]);

  useEffect(() => {
    if (!("webkitSpeechRecognition" in window || "SpeechRecognition" in window)) {
      setMicSupport(false);
    }
  }, []);

  const startRecording = () => {
    if (!micSupport) return;
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SR();
    recognition.lang = "ko-KR";
    recognition.interimResults = true;
    recognition.continuous = false;
    recognitionRef.current = recognition;
    recognition.onresult = (e) => {
      const result = Array.from(e.results).map(r => r[0].transcript).join("");
      setTranscript(result);
    };
    recognition.onend = () => setRecording(false);
    recognition.onerror = () => setRecording(false);
    recognition.start();
    setRecording(true);
    setAiResult(null);
    setRecordedAt(new Date().toISOString());
  };

  const stopRecording = () => {
    if (recognitionRef.current) recognitionRef.current.stop();
    setRecording(false);
  };

  const runAI = async () => {
    if (!transcript.trim()) return;
    setAiProcessing(true);
    setAiResult(null);
    try {
      const result = await callAI(transcript);
      setAiResult(result);
      setSelectedCat(result.category || "etc");
    } catch {
      setAiResult({ summary: transcript, category: selectedCat });
    }
    setAiProcessing(false);
  };

  const saveMemo = () => {
    const text = aiResult?.summary || transcript.trim();
    if (!text) return;
    const newMemo = {
      id: Date.now(),
      text,
      rawText: transcript.trim(),
      category: selectedCat,
      date: selectedDate,
      recordedAt: recordedAt || new Date().toISOString(),
      done: false,
    };
    setMemos(prev => [newMemo, ...prev]);
    setTranscript("");
    setAiResult(null);
    setRecordedAt(null);
  };

  const toggleDone = (id) => setMemos(prev => prev.map(m => m.id === id ? { ...m, done: !m.done } : m));
  const deleteMemo = (id) => setMemos(prev => prev.filter(m => m.id !== id));
  const catOf = (id) => CATEGORIES.find(c => c.id === id) || CATEGORIES[4];

  const filtered = memos.filter(m => {
    if (!showDone && m.done) return false;
    if (filter !== "all" && m.category !== filter) return false;
    return true;
  });

  const calYear = calMonth.getFullYear();
  const calMonthIdx = calMonth.getMonth();
  const firstDay = new Date(calYear, calMonthIdx, 1).getDay();
  const daysInMonth = new Date(calYear, calMonthIdx + 1, 0).getDate();
  const calCells = Array(firstDay).fill(null).concat(Array.from({ length: daysInMonth }, (_, i) => i + 1));
  while (calCells.length % 7 !== 0) calCells.push(null);
  const memosByDate = {};
  memos.forEach(m => { if (!memosByDate[m.date]) memosByDate[m.date] = []; memosByDate[m.date].push(m); });
  const getDateStr = (day) => !day ? null : `${calYear}-${String(calMonthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const MemoCard = ({ memo, compact }) => {
    const cat = catOf(memo.category);
    const isExpanded = expandedId === memo.id;
    return (
      <div style={{
        background: "#1a1a24", borderRadius: 16,
        padding: compact ? "10px 14px" : "14px 16px",
        display: "flex", alignItems: "flex-start", gap: 12,
        borderLeft: `3px solid ${cat.color}`,
        opacity: memo.done ? 0.45 : 1, transition: "opacity .2s",
      }}>
        <button onClick={() => toggleDone(memo.id)} style={{
          width: compact ? 18 : 22, height: compact ? 18 : 22,
          borderRadius: "50%", border: `2px solid ${cat.color}`,
          background: memo.done ? cat.color : "transparent",
          cursor: "pointer", flexShrink: 0, marginTop: 2,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 9, color: "#0f0f14", fontWeight: 900,
        }}>{memo.done ? "✓" : ""}</button>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: compact ? 13 : 15, fontWeight: 600, lineHeight: 1.4,
            textDecoration: memo.done ? "line-through" : "none", wordBreak: "break-word",
          }}>{memo.text}</div>

          <div style={{ display: "flex", gap: 7, marginTop: 5, alignItems: "center", flexWrap: "wrap" }}>
            <span style={{
              fontSize: 11, background: cat.color + "22", color: cat.color,
              borderRadius: 6, padding: "2px 7px", fontWeight: 700,
            }}>{cat.label}</span>
            <span style={{ fontSize: 11, color: "#666" }}>{formatDate(memo.date)}</span>
            {memo.recordedAt && (
              <span style={{ fontSize: 11, color: "#555" }}>🕐 {formatTime(memo.recordedAt)}</span>
            )}
            {memo.rawText && memo.rawText !== memo.text && (
              <button onClick={() => setExpandedId(isExpanded ? null : memo.id)} style={{
                fontSize: 11, color: "#555", background: "none", border: "none",
                cursor: "pointer", padding: 0, textDecoration: "underline",
              }}>{isExpanded ? "원문 닫기" : "원문 보기"}</button>
            )}
          </div>

          {isExpanded && memo.rawText && (
            <div style={{
              marginTop: 8, padding: "8px 10px", background: "#111118",
              borderRadius: 8, fontSize: 12, color: "#666", lineHeight: 1.5, fontStyle: "italic",
            }}>
              🎙 "{memo.rawText}"
            </div>
          )}
        </div>

        <button onClick={() => deleteMemo(memo.id)} style={{
          background: "none", border: "none", color: "#444", fontSize: 16,
          cursor: "pointer", padding: 0, lineHeight: 1, flexShrink: 0,
        }}>×</button>
      </div>
    );
  };

  return (
    <div style={{
      minHeight: "100vh", background: "#0f0f14", color: "#f0ede8",
      fontFamily: "'Noto Sans KR', 'Apple SD Gothic Neo', sans-serif",
      display: "flex", flexDirection: "column", alignItems: "center", padding: "0 0 80px",
    }}>
      {/* Header */}
      <div style={{ width: "100%", maxWidth: 480, padding: "28px 20px 0", boxSizing: "border-box" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <div style={{ fontSize: 11, letterSpacing: 3, color: "#888", textTransform: "uppercase", marginBottom: 2 }}>Smart Memory</div>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: -1, lineHeight: 1 }}>나의 기억 도우미</div>
          </div>
          <div style={{
            background: "linear-gradient(135deg, #4ECDC4, #44A5FF)", borderRadius: 14,
            padding: "8px 14px", fontSize: 13, fontWeight: 700, color: "#fff",
          }}>{memos.filter(m => !m.done).length}개 남음</div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 20 }}>
          {["list", "calendar"].map(v => (
            <button key={v} onClick={() => setView(v)} style={{
              flex: 1, padding: "10px 0", borderRadius: 12, border: "none", cursor: "pointer",
              fontWeight: 700, fontSize: 14, transition: "all .2s",
              background: view === v ? "#4ECDC4" : "#1e1e28",
              color: view === v ? "#0f0f14" : "#888",
            }}>{v === "list" ? "📋 목록" : "📅 캘린더"}</button>
          ))}
        </div>
      </div>

      {/* Recording Panel */}
      <div style={{ width: "100%", maxWidth: 480, padding: "16px 20px 0", boxSizing: "border-box" }}>
        <div style={{
          background: "#1a1a24", borderRadius: 20, padding: 18,
          border: recording ? "1.5px solid #FF6B6B" : aiProcessing ? "1.5px solid #FFE66D" : "1.5px solid #2a2a38",
          transition: "border .3s",
        }}>
          {/* Date + recorded time */}
          <div style={{ display: "flex", gap: 10, alignItems: "center", marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: "#666" }}>날짜</span>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} style={{
              background: "#2a2a38", border: "none", borderRadius: 8, color: "#f0ede8",
              padding: "5px 10px", fontSize: 13, flex: 1,
            }} />
            {recordedAt && (
              <span style={{
                fontSize: 12, color: "#4ECDC4", whiteSpace: "nowrap",
                background: "#4ECDC411", borderRadius: 6, padding: "3px 8px",
              }}>🕐 {formatTime(recordedAt)}</span>
            )}
          </div>

          {/* Raw transcript */}
          <div style={{
            background: "#111118", borderRadius: 10, padding: "10px 12px", minHeight: 48,
            marginBottom: 10, fontSize: 14, lineHeight: 1.6,
            color: transcript ? "#aaa" : "#444", fontStyle: transcript ? "italic" : "normal",
          }}>
            {transcript || (recording ? "듣는 중..." : "버튼을 누르고 자유롭게 말해보세요")}
            {recording && <span style={{
              display: "inline-block", width: 7, height: 7, background: "#FF6B6B",
              borderRadius: "50%", marginLeft: 6, animation: "blink 1s infinite", verticalAlign: "middle",
            }} />}
          </div>

          {/* AI result */}
          {(aiProcessing || aiResult) && (
            <div style={{
              background: "#0d1520", borderRadius: 10, padding: "12px 14px", marginBottom: 10,
              border: "1px solid #44A5FF33",
            }}>
              {aiProcessing ? (
                <div style={{ fontSize: 13, color: "#44A5FF", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}>✦</span>
                  AI가 내용을 정리하는 중...
                </div>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: "#44A5FF", fontWeight: 700, marginBottom: 6, letterSpacing: 1 }}>✦ AI 정리 결과</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#f0ede8", marginBottom: 10, lineHeight: 1.4 }}>{aiResult.summary}</div>
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {CATEGORIES.map(c => (
                      <button key={c.id} onClick={() => setSelectedCat(c.id)} style={{
                        padding: "4px 11px", borderRadius: 20, border: "none", cursor: "pointer",
                        fontSize: 11, fontWeight: 700,
                        background: selectedCat === c.id ? c.color : "#1e1e28",
                        color: selectedCat === c.id ? "#0f0f14" : "#888",
                        transition: "all .15s",
                      }}>{c.label}</button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div style={{ display: "flex", gap: 8 }}>
            {micSupport ? (
              <button
                onMouseDown={startRecording} onMouseUp={stopRecording}
                onTouchStart={e => { e.preventDefault(); startRecording(); }}
                onTouchEnd={e => { e.preventDefault(); stopRecording(); }}
                style={{
                  flex: 5, padding: "13px 0", borderRadius: 13, border: "none", cursor: "pointer",
                  background: recording
                    ? "linear-gradient(135deg,#FF6B6B,#FF8E8E)"
                    : "linear-gradient(135deg,#4ECDC4,#44A5FF)",
                  color: "#0f0f14", fontWeight: 800, fontSize: 14,
                  transform: recording ? "scale(0.97)" : "scale(1)",
                  boxShadow: recording ? "0 0 20px #FF6B6B44" : "none",
                  transition: "all .15s",
                }}>{recording ? "🎤 녹음 중... (떼면 완료)" : "🎙 눌러서 말하기"}</button>
            ) : (
              <div style={{ flex: 5, padding: "13px 0", textAlign: "center", fontSize: 12, color: "#666", background: "#1e1e28", borderRadius: 13 }}>
                Chrome 브라우저에서 음성인식 가능
              </div>
            )}
            <button onClick={runAI} disabled={!transcript.trim() || aiProcessing} style={{
              flex: 3, padding: "13px 0", borderRadius: 13, border: "none",
              cursor: transcript.trim() && !aiProcessing ? "pointer" : "default",
              background: transcript.trim() && !aiProcessing ? "#FFE66D" : "#2a2a38",
              color: transcript.trim() && !aiProcessing ? "#0f0f14" : "#555",
              fontWeight: 800, fontSize: 13, transition: "all .15s",
            }}>✦ AI 정리</button>
            <button onClick={saveMemo} disabled={!aiResult && !transcript.trim()} style={{
              flex: 2, padding: "13px 0", borderRadius: 13, border: "none",
              cursor: (aiResult || transcript.trim()) ? "pointer" : "default",
              background: aiResult ? "#A8E6CF" : transcript.trim() ? "#f0ede822" : "#2a2a38",
              color: (aiResult || transcript.trim()) ? "#0f0f14" : "#555",
              fontWeight: 800, fontSize: 13, transition: "all .15s",
            }}>저장</button>
          </div>

          <input type="text" placeholder="직접 입력도 가능해요..."
            value={transcript} onChange={e => { setTranscript(e.target.value); setAiResult(null); }}
            onKeyDown={e => e.key === "Enter" && runAI()}
            style={{
              marginTop: 10, width: "100%", background: "#111118",
              border: "1px solid #2a2a38", borderRadius: 10,
              color: "#f0ede8", padding: "8px 12px", fontSize: 13,
            }} />
        </div>
      </div>

      {/* List / Calendar */}
      <div style={{ width: "100%", maxWidth: 480, padding: "16px 20px 0", boxSizing: "border-box" }}>

        {view === "list" && (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 12, overflowX: "auto", paddingBottom: 4 }}>
              <button onClick={() => setFilter("all")} style={{
                padding: "5px 13px", borderRadius: 20, border: "none", cursor: "pointer",
                fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                background: filter === "all" ? "#f0ede8" : "#1e1e28",
                color: filter === "all" ? "#0f0f14" : "#888",
              }}>전체</button>
              {CATEGORIES.map(c => (
                <button key={c.id} onClick={() => setFilter(c.id)} style={{
                  padding: "5px 13px", borderRadius: 20, border: "none", cursor: "pointer",
                  fontWeight: 700, fontSize: 12, whiteSpace: "nowrap",
                  background: filter === c.id ? c.color : "#1e1e28",
                  color: filter === c.id ? "#0f0f14" : "#888",
                }}>{c.label}</button>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontSize: 12, color: "#555" }}>{filtered.length}개</div>
              <button onClick={() => setShowDone(!showDone)} style={{
                background: "none", border: "1px solid #2a2a38", borderRadius: 8,
                color: "#666", padding: "4px 10px", fontSize: 11, cursor: "pointer",
              }}>{showDone ? "완료 숨기기" : "완료 보기"}</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {filtered.length === 0 && (
                <div style={{ textAlign: "center", color: "#444", padding: "40px 0", fontSize: 14 }}>메모가 없어요 🙂</div>
              )}
              {filtered.map(memo => <MemoCard key={memo.id} memo={memo} />)}
            </div>
          </>
        )}

        {view === "calendar" && (
          <>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx - 1))} style={{
                background: "#1e1e28", border: "none", color: "#f0ede8", width: 34, height: 34, borderRadius: 10, fontSize: 18, cursor: "pointer",
              }}>‹</button>
              <div style={{ fontWeight: 800, fontSize: 17 }}>{calYear}년 {MONTHS[calMonthIdx]}</div>
              <button onClick={() => setCalMonth(new Date(calYear, calMonthIdx + 1))} style={{
                background: "#1e1e28", border: "none", color: "#f0ede8", width: 34, height: 34, borderRadius: 10, fontSize: 18, cursor: "pointer",
              }}>›</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3, marginBottom: 3 }}>
              {DAYS.map((d, i) => (
                <div key={d} style={{
                  textAlign: "center", fontSize: 11, fontWeight: 700, padding: "3px 0",
                  color: i === 0 ? "#FF6B6B" : i === 6 ? "#44A5FF" : "#666",
                }}>{d}</div>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 3 }}>
              {calCells.map((day, i) => {
                const dateStr = getDateStr(day);
                const dayMemos = dateStr ? (memosByDate[dateStr] || []) : [];
                const isToday = dateStr === getToday();
                return (
                  <div key={i} style={{
                    background: isToday ? "#1e2a38" : day ? "#1a1a24" : "transparent",
                    borderRadius: 10, minHeight: 56, padding: "5px 4px 4px",
                    border: isToday ? "1.5px solid #44A5FF" : "1.5px solid transparent",
                  }}>
                    {day && (
                      <>
                        <div style={{
                          fontSize: 11, fontWeight: 700, marginBottom: 3,
                          color: isToday ? "#44A5FF" : i % 7 === 0 ? "#FF6B6B88" : i % 7 === 6 ? "#44A5FF88" : "#666",
                        }}>{day}</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {dayMemos.slice(0, 2).map(m => (
                            <div key={m.id} style={{
                              width: "100%", height: 4, borderRadius: 2,
                              background: catOf(m.category).color, opacity: m.done ? 0.3 : 1,
                            }} />
                          ))}
                          {dayMemos.length > 2 && <div style={{ fontSize: 8, color: "#666", textAlign: "center" }}>+{dayMemos.length - 2}</div>}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
            {memos.filter(m => m.date.startsWith(`${calYear}-${String(calMonthIdx+1).padStart(2,"0")}`)).length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ fontSize: 12, color: "#666", marginBottom: 10 }}>이번 달 메모</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {memos
                    .filter(m => m.date.startsWith(`${calYear}-${String(calMonthIdx+1).padStart(2,"0")}`))
                    .sort((a, b) => a.date.localeCompare(b.date))
                    .map(memo => <MemoCard key={memo.id} memo={memo} compact />)}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <style>{`
        @keyframes blink { 0%,100%{opacity:1} 50%{opacity:0} }
        @keyframes spin { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        input[type="date"]::-webkit-calendar-picker-indicator { filter: invert(0.5); }
        input { outline: none; }
        ::-webkit-scrollbar { height: 4px; }
        ::-webkit-scrollbar-thumb { background: #333; border-radius: 2px; }
      `}</style>
    </div>
  );
}
