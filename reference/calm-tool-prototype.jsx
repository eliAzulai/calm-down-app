import { useState, useEffect, useRef, useCallback } from "react";

const PHASES = {
  CHECK_IN: "check-in",
  BREATHE: "breathe",
  GROUND: "ground",
  REFLECT: "reflect",
};

const ENERGY_LEVELS = [
  { value: 1, label: "Shutdown", color: "#4a6fa5", desc: "Frozen or numb" },
  { value: 2, label: "Low", color: "#6b9ac4", desc: "Tired or foggy" },
  { value: 3, label: "Calm Zone", color: "#48b5a0", desc: "Ready to think" },
  { value: 4, label: "Wired", color: "#e8a838", desc: "Restless or tense" },
  { value: 5, label: "Overload", color: "#d64550", desc: "Can't think straight" },
];

const GROUND_PROMPTS = [
  { sense: "See", count: 5, icon: "👁", prompt: "Name 5 things you can see right now" },
  { sense: "Touch", count: 4, icon: "✋", prompt: "Name 4 things you can feel or touch" },
  { sense: "Hear", count: 3, icon: "👂", prompt: "Name 3 things you can hear" },
  { sense: "Smell", count: 2, icon: "🫁", prompt: "Name 2 things you can smell" },
  { sense: "Taste", count: 1, icon: "👅", prompt: "Name 1 thing you can taste" },
];

const breathPatterns = [
  { name: "Box Breathing", inhale: 4, hold1: 4, exhale: 4, hold2: 4, desc: "Equal rhythm — steady and predictable" },
  { name: "4-7-8 Calm", inhale: 4, hold1: 7, exhale: 8, hold2: 0, desc: "Long exhale — slows everything down" },
  { name: "Simple Slow", inhale: 5, hold1: 0, exhale: 5, hold2: 0, desc: "Just in and out — nothing complicated" },
];

export default function CalmTool() {
  const [phase, setPhase] = useState(PHASES.CHECK_IN);
  const [energyBefore, setEnergyBefore] = useState(null);
  const [energyAfter, setEnergyAfter] = useState(null);
  const [selectedPattern, setSelectedPattern] = useState(0);
  const [breathState, setBreathState] = useState("idle");
  const [breathLabel, setBreathLabel] = useState("");
  const [breathProgress, setBreathProgress] = useState(0);
  const [cycleCount, setCycleCount] = useState(0);
  const [totalCycles] = useState(4);
  const [groundStep, setGroundStep] = useState(0);
  const [groundChecked, setGroundChecked] = useState([]);
  const [showComplete, setShowComplete] = useState(false);
  const breathTimerRef = useRef(null);
  const animFrameRef = useRef(null);
  const startTimeRef = useRef(null);
  const phaseDurationRef = useRef(0);

  const pattern = breathPatterns[selectedPattern];

  const stopBreathing = useCallback(() => {
    if (breathTimerRef.current) clearTimeout(breathTimerRef.current);
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    setBreathState("idle");
    setBreathLabel("");
    setBreathProgress(0);
    setCycleCount(0);
  }, []);

  const animateProgress = useCallback((duration) => {
    startTimeRef.current = performance.now();
    phaseDurationRef.current = duration * 1000;
    const tick = (now) => {
      const elapsed = now - startTimeRef.current;
      const p = Math.min(elapsed / phaseDurationRef.current, 1);
      setBreathProgress(p);
      if (p < 1) animFrameRef.current = requestAnimationFrame(tick);
    };
    animFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const runBreathCycle = useCallback((cycle) => {
    if (cycle >= totalCycles) {
      stopBreathing();
      setBreathState("done");
      setBreathLabel("Nice work");
      return;
    }
    setCycleCount(cycle + 1);
    const p = breathPatterns[selectedPattern];
    const phases = [];
    phases.push({ label: "Breathe in", duration: p.inhale, state: "inhale" });
    if (p.hold1 > 0) phases.push({ label: "Hold", duration: p.hold1, state: "hold" });
    phases.push({ label: "Breathe out", duration: p.exhale, state: "exhale" });
    if (p.hold2 > 0) phases.push({ label: "Hold", duration: p.hold2, state: "hold2" });

    let delay = 0;
    phases.forEach((ph) => {
      breathTimerRef.current = setTimeout(() => {
        setBreathState(ph.state);
        setBreathLabel(ph.label);
        animateProgress(ph.duration);
      }, delay);
      delay += ph.duration * 1000;
    });
    breathTimerRef.current = setTimeout(() => runBreathCycle(cycle + 1), delay);
  }, [selectedPattern, totalCycles, stopBreathing, animateProgress]);

  const startBreathing = () => {
    stopBreathing();
    runBreathCycle(0);
  };

  useEffect(() => () => { stopBreathing(); }, [stopBreathing]);

  const getBreathCircleScale = () => {
    if (breathState === "inhale") return 1 + breathProgress * 0.5;
    if (breathState === "exhale") return 1.5 - breathProgress * 0.5;
    if (breathState === "hold" || breathState === "hold2") return breathState === "hold" ? 1.5 : 1;
    return 1;
  };

  const handleGroundCheck = (idx) => {
    const next = [...groundChecked];
    if (next.includes(idx)) next.splice(next.indexOf(idx), 1);
    else next.push(idx);
    setGroundChecked(next);
  };

  const currentGround = GROUND_PROMPTS[groundStep];
  const groundDone = groundChecked.length >= currentGround?.count;

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(160deg, #0d1b2a 0%, #1b2d45 40%, #1a3a4a 100%)",
      fontFamily: "'Segoe UI', system-ui, sans-serif",
      color: "#e0e8f0",
      padding: "0",
      overflow: "hidden",
    }}>
      {/* Ambient background shapes */}
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
        <div style={{
          position: "absolute", top: "-20%", right: "-10%", width: "500px", height: "500px",
          borderRadius: "50%", background: "radial-gradient(circle, rgba(72,181,160,0.06) 0%, transparent 70%)",
        }} />
        <div style={{
          position: "absolute", bottom: "-15%", left: "-5%", width: "400px", height: "400px",
          borderRadius: "50%", background: "radial-gradient(circle, rgba(74,111,165,0.08) 0%, transparent 70%)",
        }} />
      </div>

      <div style={{ position: "relative", zIndex: 1, maxWidth: "480px", margin: "0 auto", padding: "24px 20px" }}>
        {/* Header */}
        <div style={{ textAlign: "center", marginBottom: "32px" }}>
          <h1 style={{
            fontSize: "28px", fontWeight: 300, margin: 0, letterSpacing: "2px",
            color: "#a8c5d6", textTransform: "uppercase",
          }}>Calm Station</h1>
          <p style={{ fontSize: "13px", color: "#5a7a8a", marginTop: "6px", letterSpacing: "1px" }}>
            Your regulation tool
          </p>
        </div>

        {/* Phase nav dots */}
        <div style={{ display: "flex", justifyContent: "center", gap: "12px", marginBottom: "32px" }}>
          {[
            { key: PHASES.CHECK_IN, label: "Check In" },
            { key: PHASES.BREATHE, label: "Breathe" },
            { key: PHASES.GROUND, label: "Ground" },
            { key: PHASES.REFLECT, label: "Reflect" },
          ].map((p, i) => {
            const isActive = p.key === phase;
            const phaseOrder = [PHASES.CHECK_IN, PHASES.BREATHE, PHASES.GROUND, PHASES.REFLECT];
            const isPast = phaseOrder.indexOf(phase) > i;
            return (
              <div key={p.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "6px" }}>
                <div style={{
                  width: "10px", height: "10px", borderRadius: "50%",
                  background: isActive ? "#48b5a0" : isPast ? "#3a7a6a" : "#2a3a4a",
                  transition: "all 0.4s ease",
                  boxShadow: isActive ? "0 0 12px rgba(72,181,160,0.4)" : "none",
                }} />
                <span style={{ fontSize: "10px", color: isActive ? "#48b5a0" : "#4a6070", letterSpacing: "0.5px" }}>
                  {p.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* CHECK-IN PHASE */}
        {phase === PHASES.CHECK_IN && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <div style={{
              background: "rgba(255,255,255,0.03)", borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.06)", padding: "28px 24px",
            }}>
              <p style={{ fontSize: "16px", color: "#8aa8b8", marginTop: 0, marginBottom: "24px", textAlign: "center" }}>
                Where's your energy right now?
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                {ENERGY_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setEnergyBefore(level.value)}
                    style={{
                      display: "flex", alignItems: "center", gap: "14px",
                      padding: "14px 18px", borderRadius: "12px",
                      border: energyBefore === level.value ? `2px solid ${level.color}` : "2px solid rgba(255,255,255,0.06)",
                      background: energyBefore === level.value ? `${level.color}18` : "rgba(255,255,255,0.02)",
                      cursor: "pointer", transition: "all 0.3s ease", textAlign: "left",
                    }}
                  >
                    <div style={{
                      width: "14px", height: "14px", borderRadius: "50%",
                      background: level.color, flexShrink: 0,
                      boxShadow: energyBefore === level.value ? `0 0 10px ${level.color}60` : "none",
                    }} />
                    <div>
                      <div style={{ fontSize: "15px", fontWeight: 500, color: "#d0dce4" }}>{level.label}</div>
                      <div style={{ fontSize: "12px", color: "#6a8898", marginTop: "2px" }}>{level.desc}</div>
                    </div>
                  </button>
                ))}
              </div>
              {energyBefore && (
                <button onClick={() => setPhase(PHASES.BREATHE)} style={{
                  width: "100%", marginTop: "24px", padding: "14px",
                  borderRadius: "12px", border: "none",
                  background: "linear-gradient(135deg, #48b5a0, #3a9a88)",
                  color: "#fff", fontSize: "15px", fontWeight: 600,
                  cursor: "pointer", letterSpacing: "0.5px",
                  boxShadow: "0 4px 16px rgba(72,181,160,0.25)",
                }}>
                  Let's start →
                </button>
              )}
            </div>
          </div>
        )}

        {/* BREATHE PHASE */}
        {phase === PHASES.BREATHE && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            {/* Pattern selector */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "24px", justifyContent: "center", flexWrap: "wrap" }}>
              {breathPatterns.map((bp, i) => (
                <button key={i} onClick={() => { stopBreathing(); setSelectedPattern(i); }} style={{
                  padding: "8px 14px", borderRadius: "20px", fontSize: "12px",
                  border: selectedPattern === i ? "1px solid #48b5a0" : "1px solid rgba(255,255,255,0.08)",
                  background: selectedPattern === i ? "rgba(72,181,160,0.15)" : "rgba(255,255,255,0.03)",
                  color: selectedPattern === i ? "#48b5a0" : "#6a8898",
                  cursor: "pointer", transition: "all 0.3s ease",
                }}>
                  {bp.name}
                </button>
              ))}
            </div>
            <p style={{ textAlign: "center", fontSize: "12px", color: "#5a7a8a", marginBottom: "28px" }}>
              {pattern.desc}
            </p>

            {/* Breathing circle */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", height: "240px", marginBottom: "20px" }}>
              <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
                {/* Outer ring */}
                <div style={{
                  width: "180px", height: "180px", borderRadius: "50%",
                  border: `2px solid ${breathState === "idle" ? "rgba(72,181,160,0.2)" : "rgba(72,181,160,0.4)"}`,
                  position: "absolute",
                  transform: `scale(${getBreathCircleScale()})`,
                  transition: breathState === "idle" ? "transform 0.3s ease" : `transform ${
                    breathState === "inhale" ? pattern.inhale :
                    breathState === "exhale" ? pattern.exhale :
                    breathState === "hold" ? pattern.hold1 : pattern.hold2
                  }s linear`,
                }} />
                {/* Inner glow */}
                <div style={{
                  width: "140px", height: "140px", borderRadius: "50%",
                  background: `radial-gradient(circle, ${
                    breathState === "inhale" ? "rgba(72,181,160,0.2)" :
                    breathState === "exhale" ? "rgba(72,181,160,0.08)" :
                    breathState === "hold" || breathState === "hold2" ? "rgba(72,181,160,0.15)" :
                    "rgba(72,181,160,0.05)"
                  } 0%, transparent 70%)`,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  flexDirection: "column",
                  transform: `scale(${getBreathCircleScale()})`,
                  transition: breathState === "idle" ? "all 0.3s ease" : `all ${
                    breathState === "inhale" ? pattern.inhale :
                    breathState === "exhale" ? pattern.exhale :
                    breathState === "hold" ? pattern.hold1 : pattern.hold2
                  }s linear`,
                }}>
                  <span style={{
                    fontSize: breathState === "idle" || breathState === "done" ? "14px" : "18px",
                    color: "#48b5a0", fontWeight: 300, letterSpacing: "1px",
                    transition: "font-size 0.3s ease",
                  }}>
                    {breathState === "idle" ? "Ready" : breathState === "done" ? "✓" : breathLabel}
                  </span>
                  {breathState !== "idle" && breathState !== "done" && (
                    <span style={{ fontSize: "11px", color: "#5a8a7a", marginTop: "4px" }}>
                      {cycleCount} / {totalCycles}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              {breathState === "idle" || breathState === "done" ? (
                <>
                  <button onClick={startBreathing} style={{
                    padding: "12px 32px", borderRadius: "12px", border: "none",
                    background: "linear-gradient(135deg, #48b5a0, #3a9a88)",
                    color: "#fff", fontSize: "14px", fontWeight: 600, cursor: "pointer",
                    boxShadow: "0 4px 16px rgba(72,181,160,0.25)",
                  }}>
                    {breathState === "done" ? "Again" : "Start"}
                  </button>
                  {breathState === "done" && (
                    <button onClick={() => { setPhase(PHASES.GROUND); setGroundStep(0); setGroundChecked([]); }} style={{
                      padding: "12px 32px", borderRadius: "12px",
                      border: "1px solid rgba(72,181,160,0.3)",
                      background: "transparent", color: "#48b5a0",
                      fontSize: "14px", fontWeight: 500, cursor: "pointer",
                    }}>
                      Next: Ground →
                    </button>
                  )}
                </>
              ) : (
                <button onClick={stopBreathing} style={{
                  padding: "10px 24px", borderRadius: "12px",
                  border: "1px solid rgba(255,255,255,0.1)",
                  background: "rgba(255,255,255,0.03)", color: "#8aa8b8",
                  fontSize: "13px", cursor: "pointer",
                }}>
                  Stop
                </button>
              )}
            </div>

            {/* Skip option */}
            <div style={{ textAlign: "center", marginTop: "24px" }}>
              <button onClick={() => { stopBreathing(); setPhase(PHASES.GROUND); setGroundStep(0); setGroundChecked([]); }} style={{
                background: "none", border: "none", color: "#4a6070",
                fontSize: "12px", cursor: "pointer", textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}>
                Skip to grounding
              </button>
            </div>
          </div>
        )}

        {/* GROUND PHASE */}
        {phase === PHASES.GROUND && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <div style={{
              background: "rgba(255,255,255,0.03)", borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.06)", padding: "28px 24px",
            }}>
              {/* Progress */}
              <div style={{ display: "flex", gap: "6px", marginBottom: "24px", justifyContent: "center" }}>
                {GROUND_PROMPTS.map((_, i) => (
                  <div key={i} style={{
                    width: "40px", height: "4px", borderRadius: "2px",
                    background: i < groundStep ? "#48b5a0" : i === groundStep ? "rgba(72,181,160,0.5)" : "rgba(255,255,255,0.08)",
                    transition: "all 0.3s ease",
                  }} />
                ))}
              </div>

              {groundStep < GROUND_PROMPTS.length ? (
                <>
                  <div style={{ textAlign: "center", marginBottom: "24px" }}>
                    <span style={{ fontSize: "36px", display: "block", marginBottom: "12px" }}>
                      {currentGround.icon}
                    </span>
                    <h3 style={{ fontSize: "20px", fontWeight: 300, color: "#c0d4e0", margin: 0, letterSpacing: "1px" }}>
                      {currentGround.sense}
                    </h3>
                    <p style={{ fontSize: "14px", color: "#6a8898", marginTop: "8px" }}>
                      {currentGround.prompt}
                    </p>
                  </div>

                  {/* Tap counters */}
                  <div style={{ display: "flex", gap: "10px", justifyContent: "center", flexWrap: "wrap", marginBottom: "24px" }}>
                    {Array.from({ length: currentGround.count }, (_, i) => (
                      <button
                        key={i}
                        onClick={() => handleGroundCheck(i)}
                        style={{
                          width: "52px", height: "52px", borderRadius: "50%",
                          border: groundChecked.includes(i) ? "2px solid #48b5a0" : "2px solid rgba(255,255,255,0.1)",
                          background: groundChecked.includes(i) ? "rgba(72,181,160,0.15)" : "rgba(255,255,255,0.02)",
                          color: groundChecked.includes(i) ? "#48b5a0" : "#4a6070",
                          fontSize: "16px", fontWeight: 600, cursor: "pointer",
                          transition: "all 0.2s ease",
                          display: "flex", alignItems: "center", justifyContent: "center",
                        }}
                      >
                        {groundChecked.includes(i) ? "✓" : i + 1}
                      </button>
                    ))}
                  </div>

                  <button
                    onClick={() => {
                      if (groundDone) {
                        if (groundStep < GROUND_PROMPTS.length - 1) {
                          setGroundStep(groundStep + 1);
                          setGroundChecked([]);
                        } else {
                          setPhase(PHASES.REFLECT);
                        }
                      }
                    }}
                    disabled={!groundDone}
                    style={{
                      width: "100%", padding: "12px", borderRadius: "12px", border: "none",
                      background: groundDone ? "linear-gradient(135deg, #48b5a0, #3a9a88)" : "rgba(255,255,255,0.05)",
                      color: groundDone ? "#fff" : "#4a5a6a", fontSize: "14px", fontWeight: 600,
                      cursor: groundDone ? "pointer" : "default",
                      transition: "all 0.3s ease",
                      boxShadow: groundDone ? "0 4px 16px rgba(72,181,160,0.25)" : "none",
                    }}
                  >
                    {groundStep < GROUND_PROMPTS.length - 1 ? "Next sense →" : "Almost done →"}
                  </button>
                </>
              ) : null}
            </div>

            <div style={{ textAlign: "center", marginTop: "16px" }}>
              <button onClick={() => setPhase(PHASES.REFLECT)} style={{
                background: "none", border: "none", color: "#4a6070",
                fontSize: "12px", cursor: "pointer", textDecoration: "underline",
                textUnderlineOffset: "3px",
              }}>
                Skip to reflect
              </button>
            </div>
          </div>
        )}

        {/* REFLECT PHASE */}
        {phase === PHASES.REFLECT && (
          <div style={{ animation: "fadeIn 0.5s ease" }}>
            <div style={{
              background: "rgba(255,255,255,0.03)", borderRadius: "16px",
              border: "1px solid rgba(255,255,255,0.06)", padding: "28px 24px",
              textAlign: "center",
            }}>
              {!showComplete ? (
                <>
                  <p style={{ fontSize: "16px", color: "#8aa8b8", marginTop: 0, marginBottom: "24px" }}>
                    Where's your energy now?
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                    {ENERGY_LEVELS.map((level) => (
                      <button
                        key={level.value}
                        onClick={() => setEnergyAfter(level.value)}
                        style={{
                          display: "flex", alignItems: "center", gap: "14px",
                          padding: "14px 18px", borderRadius: "12px",
                          border: energyAfter === level.value ? `2px solid ${level.color}` : "2px solid rgba(255,255,255,0.06)",
                          background: energyAfter === level.value ? `${level.color}18` : "rgba(255,255,255,0.02)",
                          cursor: "pointer", transition: "all 0.3s ease", textAlign: "left",
                        }}
                      >
                        <div style={{
                          width: "14px", height: "14px", borderRadius: "50%",
                          background: level.color, flexShrink: 0,
                        }} />
                        <div>
                          <div style={{ fontSize: "15px", fontWeight: 500, color: "#d0dce4" }}>{level.label}</div>
                          <div style={{ fontSize: "12px", color: "#6a8898", marginTop: "2px" }}>{level.desc}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                  {energyAfter && (
                    <button onClick={() => setShowComplete(true)} style={{
                      width: "100%", marginTop: "24px", padding: "14px",
                      borderRadius: "12px", border: "none",
                      background: "linear-gradient(135deg, #48b5a0, #3a9a88)",
                      color: "#fff", fontSize: "15px", fontWeight: 600, cursor: "pointer",
                      boxShadow: "0 4px 16px rgba(72,181,160,0.25)",
                    }}>
                      Done ✓
                    </button>
                  )}
                </>
              ) : (
                <div style={{ padding: "20px 0" }}>
                  <div style={{ fontSize: "40px", marginBottom: "16px" }}>
                    {energyAfter <= energyBefore ? "🎯" : "💪"}
                  </div>
                  <h2 style={{ fontSize: "22px", fontWeight: 300, color: "#c0d4e0", margin: "0 0 12px", letterSpacing: "1px" }}>
                    Session Complete
                  </h2>

                  {/* Before/After comparison */}
                  <div style={{
                    display: "flex", justifyContent: "center", gap: "24px",
                    margin: "24px 0", padding: "20px",
                    background: "rgba(255,255,255,0.02)", borderRadius: "12px",
                  }}>
                    <div>
                      <div style={{ fontSize: "11px", color: "#5a7a8a", marginBottom: "6px", letterSpacing: "1px", textTransform: "uppercase" }}>Before</div>
                      <div style={{
                        width: "16px", height: "16px", borderRadius: "50%", margin: "0 auto 6px",
                        background: ENERGY_LEVELS[energyBefore - 1]?.color,
                      }} />
                      <div style={{ fontSize: "14px", color: "#a0b8c8" }}>{ENERGY_LEVELS[energyBefore - 1]?.label}</div>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", color: "#4a6070", fontSize: "20px" }}>→</div>
                    <div>
                      <div style={{ fontSize: "11px", color: "#5a7a8a", marginBottom: "6px", letterSpacing: "1px", textTransform: "uppercase" }}>After</div>
                      <div style={{
                        width: "16px", height: "16px", borderRadius: "50%", margin: "0 auto 6px",
                        background: ENERGY_LEVELS[energyAfter - 1]?.color,
                      }} />
                      <div style={{ fontSize: "14px", color: "#a0b8c8" }}>{ENERGY_LEVELS[energyAfter - 1]?.label}</div>
                    </div>
                  </div>

                  <p style={{ fontSize: "14px", color: "#6a8898", lineHeight: "1.6", maxWidth: "300px", margin: "0 auto 24px" }}>
                    {energyAfter === 3
                      ? "You're in the calm zone. This is where you can think clearly and solve problems."
                      : energyAfter < energyBefore
                      ? "Your energy shifted down. Every time you practice, this gets easier."
                      : energyAfter > energyBefore
                      ? "Sometimes regulation takes more than one round. That's completely normal. Try again anytime."
                      : "You checked in with yourself. That awareness is a skill on its own."
                    }
                  </p>

                  {/* TSG connection */}
                  <div style={{
                    padding: "16px", borderRadius: "10px",
                    background: "rgba(72,181,160,0.06)",
                    border: "1px solid rgba(72,181,160,0.12)",
                    marginBottom: "24px",
                  }}>
                    <p style={{ fontSize: "13px", color: "#7aaa9a", margin: 0, lineHeight: "1.5", fontStyle: "italic" }}>
                      "A calm person can think. A calm person can choose. That's where self-government begins."
                    </p>
                  </div>

                  <button onClick={() => {
                    setPhase(PHASES.CHECK_IN);
                    setEnergyBefore(null);
                    setEnergyAfter(null);
                    setBreathState("idle");
                    setBreathLabel("");
                    setBreathProgress(0);
                    setCycleCount(0);
                    setGroundStep(0);
                    setGroundChecked([]);
                    setShowComplete(false);
                  }} style={{
                    padding: "12px 32px", borderRadius: "12px",
                    border: "1px solid rgba(72,181,160,0.3)",
                    background: "transparent", color: "#48b5a0",
                    fontSize: "14px", fontWeight: 500, cursor: "pointer",
                  }}>
                    Start Over
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        <style>{`
          @keyframes fadeIn {
            from { opacity: 0; transform: translateY(8px); }
            to { opacity: 1; transform: translateY(0); }
          }
          button:active { transform: scale(0.97); }
        `}</style>
      </div>
    </div>
  );
}
