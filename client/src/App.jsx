import { useEffect, useState, useRef, useCallback } from 'react';
import { io } from 'socket.io-client';
import GameEngine from './GameEngine';
import './App.css';

function toRoman(num) {
  const romanNumerals = [
    { value: 10, numeral: 'X' },
    { value: 9, numeral: 'IX' },
    { value: 5, numeral: 'V' },
    { value: 4, numeral: 'IV' },
    { value: 1, numeral: 'I' }
  ];
  let result = '';
  let n = num;
  for (const { value, numeral } of romanNumerals) {
    while (n >= value) {
      result += numeral;
      n -= value;
    }
  }
  return result || 'I';
}

function getOrCreatePlayerToken() {
  let token = localStorage.getItem('you_are_rhyme_actor_token');
  if (!token) {
    token = 'actor_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('you_are_rhyme_actor_token', token);
  }
  return token;
}

const getSocketUrl = () => {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return `http://${window.location.hostname}:3001`;
  }
  return undefined; // Connects to origin in production / tunnel
};

const getApiUrl = (endpoint) => {
  if (typeof window !== 'undefined' && window.location.port === '5173') {
    return `http://${window.location.hostname}:3001${endpoint}`;
  }
  return endpoint;
};

function App() {
  const [playerToken] = useState(getOrCreatePlayerToken);
  const [roomCode, setRoomCode] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const r = params.get('room');
      if (r) return r.toUpperCase().trim();
    }
    return '';
  });

  const [role, setRole] = useState(null); // 'HAMLET' | 'QUEEN' | 'SPECTATOR' | null
  const [inStage, setInStage] = useState(false); // Controls whether to enter 3-column stage or stay in Playbill
  const [levelConfig, setLevelConfig] = useState(null);
  const [scriptState, setScriptState] = useState(null);
  const [status, setStatus] = useState('IDLE'); // 'IDLE' | 'RECORDING' | 'EVALUATING' | 'SIMULATING'

  const [inputJoinCode, setInputJoinCode] = useState('');
  const [copyFeedback, setCopyFeedback] = useState('');
  const [lobbyError, setLobbyError] = useState('');

  const [dslCommands, setDslCommands] = useState([]);
  const [compilationBreakdown, setCompilationBreakdown] = useState(null);
  const [transcript, setTranscript] = useState("");
  const [stageDirection, setStageDirection] = useState("[The chamber is quiet. Enter the Prince and the Queen.]");
  const [resolutionModal, setResolutionModal] = useState(null);

  const mediaRecorderRef = useRef(null);
  const audioChunks = useRef([]);
  const recordingStartTime = useRef(0);
  const socketRef = useRef(null);

  const [autoPlayCPU, setAutoPlayCPU] = useState(false);

  const handleHamletWin = useCallback(() => {
    setStageDirection("[Exit POLONIUS, slain behind the arras.]");
    setResolutionModal({
      title: "The Climax Attained",
      subtitle: "'How now, a rat? Dead for a ducat, dead.' Polonius is slain behind the arras.",
      winner: "PRINCE HAMLET"
    });
    setDslCommands([]);
    setStatus('IDLE');
  }, []);

  // Update URL search query whenever roomCode changes
  const updateUrlRoom = (code) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location);
      if (code) {
        url.searchParams.set('room', code);
      } else {
        url.searchParams.delete('room');
      }
      window.history.replaceState(null, '', url.toString());
    }
  };

  // Socket setup & room event listeners
  useEffect(() => {
    const socket = io(getSocketUrl(), {
      query: roomCode ? { room: roomCode } : {}
    });
    socketRef.current = socket;

    // Room state updates
    const handleStateUpdate = (data) => {
      setScriptState(data);
      if (data.level) {
        setLevelConfig(data.level);
      }

      // Check if this token holds Hamlet or Queen
      if (data.players) {
        if (data.players.HAMLET && data.players.HAMLET.token === playerToken) {
          setRole('HAMLET');
        } else if (data.players.QUEEN && data.players.QUEEN.token === playerToken) {
          setRole('QUEEN');
        }
      }
    };

    socket.on('room-state-update', handleStateUpdate);
    socket.on('state-update', handleStateUpdate);

    // Turn results
    socket.on('turn-result', (data) => {
      setTranscript(data.text);
      setDslCommands(data.commands || []);

      if (data.breakdown) {
        setCompilationBreakdown(data.breakdown);
      } else if (data.commands && data.commands[0]?.meta?.compilationBreakdown) {
        setCompilationBreakdown(data.commands[0].meta.compilationBreakdown);
      }

      if (data.poloniusKilled) {
        setTimeout(handleHamletWin, 450);
      }

      if (data.commands && data.commands.length > 0) {
        const cmd = data.commands[0];
        const steps = cmd.parameters?.discreteSteps || 2;
        let direction = "";

        switch (cmd.action) {
          case 'Lunge':
            direction = `[HAMLET lunges with violent force, advancing ${steps} paces.]`;
            break;
          case 'Pierce':
            direction = `[HAMLET executes a charged thrust, piercing through chamber furnishings and the arras.]`;
            break;
          case 'Feint':
            direction = `[HAMLET maneuvers with rapid agility, realigning his stance.]`;
            break;
          case 'Fracture':
            direction = `[HAMLET's blade strikes the wall hangings, fracturing the barrier.]`;
            break;
          case 'Repel':
            direction = `[The QUEEN repels the rapier with vocal authority, driving it back ${steps} paces.]`;
            break;
          case 'Barricade':
            direction = `[The QUEEN overturns heavy furnishings into the corridor, erecting an oak barricade.]`;
            break;
          case 'Interpose':
            direction = `[The QUEEN steps forward with urgency, shielding the path to the arras.]`;
            break;
          case 'Disarm':
            direction = `[The QUEEN deflects the thrust, dislodging the prince's weapon.]`;
            break;
          default:
            direction = `[${cmd.actor} delivers their verse with dramatic authority.]`;
        }
        setStageDirection(direction);
      }

      setStatus('SIMULATING');
    });

    // Roles swapped event
    socket.on('roles-swapped', (data) => {
      if (data.hamletToken === playerToken) {
        setRole('HAMLET');
      } else if (data.queenToken === playerToken) {
        setRole('QUEEN');
      }
      setStageDirection("[The players have exchanged mantles. A new chamber is drawn from the archives.]");
      setResolutionModal(null);
    });

    // Room reset event (resets match state & brings players back to playbill)
    socket.on('room-reset', () => {
      setResolutionModal(null);
      setTranscript("");
      setCompilationBreakdown(null);
      setDslCommands([]);
      setStatus('IDLE');
      setStageDirection("[A new chamber arrangement is drawn from the archives of Elsinore.]");
      setInStage(false);
    });

    // Auto-join if roomCode in URL
    if (roomCode) {
      socket.emit('join-room', { roomCode, token: playerToken }, (res) => {
        if (res && res.error) {
          setLobbyError(res.error);
        } else if (res && res.role) {
          setRole(res.role);
        }
      });
    }

    return () => {
      socket.disconnect();
    };
  }, [playerToken, roomCode, handleHamletWin]);

  // CPU Opponent Logic (solo practice mode)
  useEffect(() => {
    if (autoPlayCPU && status === 'IDLE' && role && role !== 'SPECTATOR') {
      const isMyTurn = scriptState?.currentLine?.speaker === role;
      if (!isMyTurn && scriptState?.currentLine) {
        const timer = setTimeout(() => {
          const effectiveRoom = roomCode || 'DEFAULT';
          fetch(getApiUrl(`/api/room/${effectiveRoom}/cpu-turn`), { method: 'POST' })
            .catch(err => console.error("CPU Turn failed", err));
        }, 2200);
        return () => clearTimeout(timer);
      }
    }
  }, [scriptState, autoPlayCPU, status, role, roomCode]);

  // Audio recording handlers
  const startTurn = async () => {
    try {
      audioChunks.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 });
      const source = audioContext.createMediaStreamSource(stream);
      const processor = audioContext.createScriptProcessor(4096, 1, 1);

      source.connect(processor);
      processor.connect(audioContext.destination);

      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0);
        const pcmData = new Int16Array(inputData.length);
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.min(1, Math.max(-1, inputData[i])) * 0x7FFF;
        }
        audioChunks.current.push(new Uint8Array(pcmData.buffer));
      };

      mediaRecorderRef.current = {
        stop: () => {
          processor.disconnect();
          source.disconnect();
          audioContext.close();
          stream.getTracks().forEach(track => track.stop());
        }
      };
      recordingStartTime.current = Date.now();
      setStatus('RECORDING');
      setStageDirection(`[${scriptState?.currentLine?.speaker || 'Speaker'} delivers verse into the chamber...]`);
    } catch (err) {
      console.error('Error accessing microphone', err);
      alert('Microphone access failed. Ensure microphone permission is granted in your browser.');
    }
  };

  const stopTurnAndEvaluate = async () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop();
      setStatus('EVALUATING');
      setStageDirection("[The printer parses the vocal prosody and script accuracy...]");

      const totalLength = audioChunks.current.reduce((acc, chunk) => acc + chunk.length, 0);
      const combined = new Uint8Array(totalLength);
      let offset = 0;
      for (const chunk of audioChunks.current) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }

      const elapsedSec = (Date.now() - recordingStartTime.current) / 1000;
      const expectedText = scriptState?.currentLine?.text || "";
      const expectedWords = expectedText.split(/\s+/).length;
      const baselineWpm = 130;
      const actualWpm = (expectedWords / elapsedSec) * 60;
      const wpmDelta = Math.round(actualWpm - baselineWpm);

      try {
        const effectiveRoom = roomCode || 'DEFAULT';
        await fetch(getApiUrl(`/api/room/${effectiveRoom}/turn?wpmDelta=${wpmDelta}&role=${role || ''}`), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream'
          },
          body: combined
        });
      } catch (err) {
        console.error("Turn evaluation failed", err);
        setStatus('IDLE');
      }
    }
  };

  const handleTurnEnd = () => {
    setDslCommands([]);
    if (scriptState && scriptState.currentIndex >= scriptState.totalLines - 1) {
      setResolutionModal({
        title: "The Scene Concludes",
        subtitle: "The dialogue hath expired. Polonius surviveth behind the arras.",
        winner: "QUEEN GERTRUDE"
      });
    }
    setStatus('IDLE');
  };

  // Chamber actions
  const handleCreateRoom = (desiredRole = 'HAMLET') => {
    setLobbyError('');
    socketRef.current?.emit('create-room', { role: desiredRole, token: playerToken }, (res) => {
      if (res && res.success) {
        setRoomCode(res.roomCode);
        setRole(res.role);
        updateUrlRoom(res.roomCode);
      } else if (res && res.error) {
        setLobbyError(res.error);
      }
    });
  };

  const handleJoinRoom = (codeToJoin) => {
    setLobbyError('');
    const code = (codeToJoin || inputJoinCode).toUpperCase().trim();
    if (!code) return;
    socketRef.current?.emit('join-room', { roomCode: code, token: playerToken }, (res) => {
      if (res && res.success) {
        setRoomCode(code);
        if (res.role) setRole(res.role);
        updateUrlRoom(code);
      } else if (res && res.error) {
        setLobbyError(res.error);
      }
    });
  };

  const handleClaimRole = (targetRole) => {
    setLobbyError('');
    if (!roomCode) {
      // If no room yet, creating room with this role
      handleCreateRoom(targetRole);
      return;
    }
    socketRef.current?.emit('claim-role', { roomCode, role: targetRole, token: playerToken }, (res) => {
      if (res && res.success) {
        setRole(res.role);
      } else if (res && res.error) {
        setLobbyError(res.error);
      }
    });
  };

  const handleLeaveRoom = () => {
    socketRef.current?.emit('leave-room', { roomCode, token: playerToken });
    setRoomCode('');
    setRole(null);
    setInStage(false);
    updateUrlRoom('');
  };

  const handleCopyInviteLink = () => {
    if (typeof window !== 'undefined' && roomCode) {
      const link = `${window.location.origin}${window.location.pathname}?room=${roomCode}`;
      navigator.clipboard.writeText(link).then(() => {
        setCopyFeedback("Copied to parchment!");
        setTimeout(() => setCopyFeedback(""), 2800);
      });
    }
  };

  // Rematch and scene resetting
  const handleNextChamber = () => {
    setResolutionModal(null);
    setTranscript("");
    setCompilationBreakdown(null);
    setStageDirection("[A new chamber arrangement is drawn from the archives of Elsinore.]");
    const effectiveRoom = roomCode || 'DEFAULT';
    socketRef.current?.emit('reset-room', { roomCode: effectiveRoom }, () => {
      fetch(getApiUrl(`/api/room/${effectiveRoom}/reset`), { method: 'POST' }).catch(() => {});
    });
  };

  const handleSwapRoles = () => {
    setResolutionModal(null);
    setTranscript("");
    setCompilationBreakdown(null);
    const effectiveRoom = roomCode || 'DEFAULT';
    socketRef.current?.emit('swap-roles', { roomCode: effectiveRoom });
  };

  const handleReturnToPlaybill = () => {
    setResolutionModal(null);
    setTranscript("");
    setCompilationBreakdown(null);
    setDslCommands([]);
    setStatus('IDLE');
    setStageDirection("[A new chamber arrangement is drawn from the archives of Elsinore.]");
    const effectiveRoom = roomCode || 'DEFAULT';
    socketRef.current?.emit('reset-room', { roomCode: effectiveRoom }, () => {
      fetch(getApiUrl(`/api/room/${effectiveRoom}/reset`), { method: 'POST' }).catch(() => {});
    });
    setInStage(false);
  };

  // ---------------------------------------------------------------------------
  // 1. Theatrical Broadside Title Portal & Chamber Lobby
  // ---------------------------------------------------------------------------
  const hamletPlayer = scriptState?.players?.HAMLET;
  const queenPlayer = scriptState?.players?.QUEEN;
  const isHamletClaimedByMe = hamletPlayer && hamletPlayer.token === playerToken;
  const isQueenClaimedByMe = queenPlayer && queenPlayer.token === playerToken;
  const isHamletClaimedByOther = hamletPlayer && hamletPlayer.token !== playerToken && hamletPlayer.connected;
  const isQueenClaimedByOther = queenPlayer && queenPlayer.token !== playerToken && queenPlayer.connected;
  const bothActorsReady = !!(hamletPlayer?.connected && queenPlayer?.connected);

  if (!inStage) {
    return (
      <div className="quarto-app" style={{ justifyContent: 'center' }}>
        <div className="broadside-portal-container">
          <div className="broadside-ornament">&#10086; &#10086; &#10086;</div>
          <h1 className="broadside-heading-large">You Are Rhyme</h1>
          <div className="broadside-subheading">
            The Tragicall Historie of HAMLET, Prince of Denmarke &bull; Act III, Scene IV
          </div>

          <div className="broadside-treatise-box">
            <p style={{ margin: 0 }}>
              Drawing from Simon Palfrey’s theory of <em>formactions</em>, this installation translates the vocal delivery
              of Shakespeare’s verse into physical control over an early modern chamber stage.
              Acoustic amplitude, dramatic silence, and delivery tempo modulate asymmetrical mechanical forces:
              Hamlet strives to pierce the arras concealing Polonius; Gertrude acts to barricade the corridor and preserve the counselor.
            </p>
          </div>

          {/* Chamber Lobby Controls */}
          <div className="broadside-chamber-panel">
            <div className="chamber-panel-header">
              <div className="chamber-panel-title">
                {roomCode ? `Chamber: ${roomCode}` : 'Chamber Connectivity'}
              </div>
              {roomCode && (
                <div className="chamber-actions-row">
                  <span className="chamber-badge">{roomCode}</span>
                  <button className="quarto-btn-primary" onClick={handleCopyInviteLink}>
                    {copyFeedback || "Copy Invitation Link"}
                  </button>
                  <button className="quarto-btn-secondary" onClick={handleLeaveRoom}>
                    Leave Chamber
                  </button>
                </div>
              )}
            </div>

            {!roomCode ? (
              <div className="chamber-actions-row" style={{ justifyContent: 'space-between' }}>
                <button className="quarto-btn-primary" onClick={() => handleCreateRoom('HAMLET')}>
                  Create New Chamber
                </button>
                <div className="chamber-input-group">
                  <input
                    type="text"
                    maxLength={4}
                    placeholder="CODE"
                    className="chamber-code-input"
                    value={inputJoinCode}
                    onChange={(e) => setInputJoinCode(e.target.value.toUpperCase())}
                  />
                  <button className="quarto-btn-secondary" onClick={() => handleJoinRoom()}>
                    Enter Chamber
                  </button>
                </div>
              </div>
            ) : (
              <div className="chamber-roster-bar">
                <div className="roster-actors-group">
                  <div className="roster-item">
                    <span className={`roster-dot ${hamletPlayer?.connected ? 'active' : 'empty'}`} />
                    <span><strong>Prince Hamlet:</strong> {hamletPlayer?.connected ? (isHamletClaimedByMe ? 'Assigned to You' : 'Present') : 'Awaiting Actor'}</span>
                  </div>
                  <div className="roster-item">
                    <span className={`roster-dot ${queenPlayer?.connected ? 'active' : 'empty'}`} />
                    <span><strong>Queen Gertrude:</strong> {queenPlayer?.connected ? (isQueenClaimedByMe ? 'Assigned to You' : 'Present') : 'Awaiting Actor'}</span>
                  </div>
                </div>

                <div className="chamber-actions-row">
                  <label className="broadside-checkbox-row" style={{ margin: 0 }}>
                    <input
                      type="checkbox"
                      checked={autoPlayCPU}
                      onChange={(e) => setAutoPlayCPU(e.target.checked)}
                    />
                    Solo Practice (CPU Partner)
                  </label>

                  <button
                    className="quarto-btn-primary"
                    disabled={!role && !bothActorsReady}
                    onClick={() => setInStage(true)}
                  >
                    {bothActorsReady || autoPlayCPU ? "Enter Chamber Stage" : (role ? "Waiting for Opponent..." : "Select Role to Enter")}
                  </button>
                </div>
              </div>
            )}

            {lobbyError && (
              <div style={{ color: 'var(--ink-crimson)', fontFamily: 'var(--font-print)', fontSize: '0.8rem', fontWeight: 'bold' }}>
                &bull; {lobbyError}
              </div>
            )}
          </div>

          {/* Role Selection Triptych */}
          <div className="broadside-role-triptych">
            {/* Hamlet */}
            <div
              className={`broadside-role-card ${isHamletClaimedByOther ? 'card-claimed-other' : ''} ${isHamletClaimedByMe ? 'card-claimed-self' : ''}`}
              onClick={() => {
                if (!isHamletClaimedByOther) handleClaimRole('HAMLET');
              }}
            >
              <div className="typeblock-emblem emblem-hamlet">H</div>
              <div>
                <h3 className="quarto-char-title">Hamlet</h3>
                <div className="quarto-char-role">Prince of Denmarke &bull; Accuser</div>
                {isHamletClaimedByOther && <div className="role-status-badge claimed-other">Claimed by Opponent</div>}
                {isHamletClaimedByMe && <div className="role-status-badge claimed-self">Your Assigned Role</div>}
                {!hamletPlayer && <div className="role-status-badge available">Open for Claim</div>}
              </div>
              <p className="quarto-verse-quote">
                "Go, go, you question with a wicked tongue... I will speak daggers to her, but use none."
              </p>
              <button
                className="quarto-select-btn"
                disabled={isHamletClaimedByOther}
              >
                {isHamletClaimedByMe ? "Selected" : (isHamletClaimedByOther ? "Occupied" : "Portray Hamlet")}
              </button>
            </div>

            {/* Gertrude */}
            <div
              className={`broadside-role-card ${isQueenClaimedByOther ? 'card-claimed-other' : ''} ${isQueenClaimedByMe ? 'card-claimed-self' : ''}`}
              onClick={() => {
                if (!isQueenClaimedByOther) handleClaimRole('QUEEN');
              }}
            >
              <div className="typeblock-emblem emblem-gertrude">G</div>
              <div>
                <h3 className="quarto-char-title">Gertrude</h3>
                <div className="quarto-char-role">Queene of Denmarke &bull; Defender</div>
                {isQueenClaimedByOther && <div className="role-status-badge claimed-other">Claimed by Opponent</div>}
                {isQueenClaimedByMe && <div className="role-status-badge claimed-self">Your Assigned Role</div>}
                {!queenPlayer && <div className="role-status-badge available">Open for Claim</div>}
              </div>
              <p className="quarto-verse-quote">
                "What wilt thou do? Thou wilt not murder me? Help, ho! Nay, then I’ll set those to you that can speak."
              </p>
              <button
                className="quarto-select-btn"
                disabled={isQueenClaimedByOther}
              >
                {isQueenClaimedByMe ? "Selected" : (isQueenClaimedByOther ? "Occupied" : "Portray Gertrude")}
              </button>
            </div>

            {/* Spectator */}
            <div
              className={`broadside-role-card ${role === 'SPECTATOR' ? 'card-claimed-self' : ''}`}
              onClick={() => {
                setRole('SPECTATOR');
                setInStage(true);
              }}
            >
              <div className="typeblock-emblem emblem-spectator">&#9632;</div>
              <div>
                <h3 className="quarto-char-title">Audience</h3>
                <div className="quarto-char-role">Chamber Observer</div>
                <div className="role-status-badge available">Unrestricted</div>
              </div>
              <p className="quarto-verse-quote">
                "Observe the unfolding drama as spoken verse exerts mechanical control upon the physical space."
              </p>
              <button className="quarto-select-btn">Observe Duel</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // 2. Dramaturgical Three-Column Quarto Layout (Live Stage)
  // ---------------------------------------------------------------------------
  const currentLine = scriptState?.currentLine;
  const isMyTurn = currentLine?.speaker === role;
  const lineIndex = scriptState?.currentIndex || 0;
  const totalLines = scriptState?.totalLines || 18;
  const tensionPercent = Math.min(100, Math.round(((lineIndex + 1) / totalLines) * 100));
  const previousSpeaker = lineIndex > 0 ? (currentLine?.speaker === 'HAMLET' ? 'QUEEN' : 'HAMLET') : null;

  return (
    <div className="quarto-app">
      {/* 1604 Quarto Broadside Header */}
      <header className="quarto-header">
        <div className="quarto-top-row">
          <div className="quarto-title-group">
            <h1 className="quarto-main-title">You Are Rhyme</h1>
            <span className="quarto-scene-subtitle">
              Actus Tertius, Scæna Quarta: The Royal Chamber at Elsinore
            </span>
          </div>

          <div className="quarto-meta-stamps">
            <span className="stamp-tag highlight">CHAMBER: {roomCode || 'DEFAULT'}</span>
            <span className="stamp-tag">ROLE: {role || 'OBSERVER'}</span>
            <span className="stamp-tag">STAGE: {levelConfig?.id || 'ARCHIVED'}</span>
            <span className="stamp-tag">PAR: {levelConfig?.par || 18} MEASURES</span>
            {roomCode && (
              <button className="stamp-btn" onClick={handleCopyInviteLink}>
                {copyFeedback || "Copy Link"}
              </button>
            )}
            <button className="stamp-btn" onClick={handleReturnToPlaybill}>
              Playbill
            </button>
          </div>
        </div>

        {/* Tactical Mechanics Directive Banner */}
        <div className="quarto-tactics-banner">
          <div className="tactics-overview-bar">
            <span className="tactics-overview-badge">TACTICAL BRIEFING</span>
            <span className="tactics-overview-text">
              <strong>Objective:</strong> Hamlet seeks to drive his rapier through the arras to strike Polonius. Gertrude must preserve the counselor by blocking lanes, shifting furniture, and disarming the Prince until Measure XVIII concludes.
            </span>
          </div>

          <div className="tactics-roster-grid">
            {/* Hamlet's Offensive Formactions */}
            <div className={`tactics-card ${role === 'HAMLET' ? 'tactics-card-active' : ''}`}>
              <div className="tactics-card-header">
                <span className="tactics-card-title">Hamlet &bull; Attacker</span>
                <span className="tactics-role-badge">OFFENSIVE ARSENAL</span>
              </div>
              <div className="tactics-moves-list">
                <div className="tactics-move-item">
                  <div className="move-title-row">
                    <span className="move-name">LUNGE</span>
                    <span className="move-trigger">Louder / High Volume</span>
                  </div>
                  <p className="move-desc">
                    Thrusts blade 1&ndash;4 paces forward. <strong>When to use:</strong> When the lane ahead is clear to close ground rapidly.
                  </p>
                </div>
                <div className="tactics-move-item">
                  <div className="move-title-row">
                    <span className="move-name">PIERCE</span>
                    <span className="move-trigger">Dramatic Pause &gt; 1.5s</span>
                  </div>
                  <p className="move-desc">
                    Delivers a penetrating thrust through obstacles. <strong>When to use:</strong> When furniture or the arras blocks your direct line to Polonius.
                  </p>
                </div>
                <div className="tactics-move-item">
                  <div className="move-title-row">
                    <span className="move-name">FEINT</span>
                    <span className="move-trigger">Shift Cadence (Pace)</span>
                  </div>
                  <p className="move-desc">
                    Realigns vertical stance up/down and recovers blade. <strong>When to use:</strong> When Gertrude body-blocks your row or your weapon was dislodged.
                  </p>
                </div>
                <div className="tactics-move-item">
                  <div className="move-title-row">
                    <span className="move-name">FRACTURE</span>
                    <span className="move-trigger">Misquote / Corrupt Verse</span>
                  </div>
                  <p className="move-desc">
                    Unleashes textual chaos that shatters chamber props. <strong>When to use:</strong> To permanently obliterate dense obstacle barricades.
                  </p>
                </div>
              </div>
            </div>

            {/* Gertrude's Defensive Formactions */}
            <div className={`tactics-card ${role === 'QUEEN' ? 'tactics-card-active' : ''}`}>
              <div className="tactics-card-header">
                <span className="tactics-card-title">Gertrude &bull; Defender</span>
                <span className="tactics-role-badge">DEFENSIVE COUNTERS</span>
              </div>
              <div className="tactics-moves-list">
                <div className="tactics-move-item">
                  <div className="move-title-row">
                    <span className="move-name">REPEL</span>
                    <span className="move-trigger">Louder / High Volume</span>
                  </div>
                  <p className="move-desc">
                    Blunts kinetic momentum, pushing Hamlet back 1&ndash;2 paces. <strong>When to use:</strong> When Hamlet closes in dangerously close to the arras alcove.
                  </p>
                </div>
                <div className="tactics-move-item">
                  <div className="move-title-row">
                    <span className="move-name">BARRICADE</span>
                    <span className="move-trigger">Dramatic Pause &gt; 1.5s</span>
                  </div>
                  <p className="move-desc">
                    Overturns heavy furniture directly in Hamlet's path. <strong>When to use:</strong> When Hamlet has an open lane and needs an obstacle in his way.
                  </p>
                </div>
                <div className="tactics-move-item">
                  <div className="move-title-row">
                    <span className="move-name">INTERPOSE</span>
                    <span className="move-trigger">Shift Cadence (Pace)</span>
                  </div>
                  <p className="move-desc">
                    Steps Gertrude's body directly between Hamlet and Polonius. <strong>When to use:</strong> When no furniture is nearby and you must shield the target.
                  </p>
                </div>
                <div className="tactics-move-item">
                  <div className="move-title-row">
                    <span className="move-name">DISARM</span>
                    <span className="move-trigger">Misquote / Corrupt Verse</span>
                  </div>
                  <p className="move-desc">
                    Dislodges the Prince's weapon from his grip. <strong>When to use:</strong> When Hamlet is lined up for a lethal thrust, buying precious measures.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Main Three-Column Composing Layout */}
      <div className="quarto-stage-layout">
        
        {/* Left Column: Actor's Cue-Roll & Delivery */}
        <aside className="cue-roll-column">
          <div className="active-cue-block">
            <div className="cue-speaker-label">
              Actor's Cue &bull; {currentLine?.speaker || 'The Scene'}
            </div>

            {currentLine ? (
              <blockquote className="cue-verse-line">
                "{currentLine.text}"
              </blockquote>
            ) : (
              <p className="cue-verse-line">The exchange hath reached its final cadence.</p>
            )}

            {previousSpeaker && (
              <div className="preceding-context">
                <strong>Preceding Cue:</strong> Line {lineIndex} delivered.
              </div>
            )}
          </div>

          {/* Delivery Controls */}
          {role !== 'SPECTATOR' && (
            <div className="typesetter-box">
              <label className="broadside-checkbox-row">
                <input
                  type="checkbox"
                  checked={autoPlayCPU}
                  onChange={(e) => setAutoPlayCPU(e.target.checked)}
                />
                Automate Opponent Delivery
              </label>

              {status === 'IDLE' && isMyTurn && (
                <button className="stamped-action-btn" onClick={startTurn}>
                  Strike Verse Line (Your Cue)
                </button>
              )}

              {status === 'IDLE' && !isMyTurn && (
                <button className="stamped-action-btn" disabled>
                  Awaiting {currentLine?.speaker === 'HAMLET' ? 'Prince Hamlet' : 'Queen Gertrude'}...
                </button>
              )}

              {status === 'RECORDING' && isMyTurn && (
                <button className="stamped-action-btn delivering" onClick={stopTurnAndEvaluate}>
                  Conclude Verse Delivery
                </button>
              )}

              {status === 'EVALUATING' && (
                <button className="stamped-action-btn" disabled>
                  Parsing Speech Mechanics...
                </button>
              )}

              {status === 'SIMULATING' && (
                <button className="stamped-action-btn" disabled>
                  Stage in Motion...
                </button>
              )}
            </div>
          )}

          {/* Compilation Quantification & Decision Engine Readout */}
          <div className="typesetter-box compilation-engine-box">
            <div className="box-woodcut-heading">
              <span>Compilation Readout</span>
              <span className="quarto-compiler-badge">
                {compilationBreakdown ? `[ ${compilationBreakdown.winner.toUpperCase()} PREVAILED ]` : 'AWAITING CUE'}
              </span>
            </div>

            {compilationBreakdown ? (
              <div className="compilation-content">
                <div className="compilation-speaker-row">
                  <span className="quarto-field-tag">SPEAKER:</span>
                  <span className="quarto-field-val">{compilationBreakdown.actor}</span>
                  <span className="quarto-dot">&bull;</span>
                  <span className="quarto-field-tag">VICTOR:</span>
                  <strong className="quarto-victor-name">{compilationBreakdown.winner}</strong>
                </div>

                {/* Candidate Formactions Percentage & Drive Meters */}
                <div className="compilation-drives-table">
                  <div className="drives-header-row">
                    <span>Candidate Formaction</span>
                    <span>Share &bull; Result</span>
                  </div>

                  {compilationBreakdown.drives.map((d) => (
                    <div
                      key={d.action}
                      className={`drive-entry-row ${d.isWinner ? 'winner-entry' : ''}`}
                    >
                      <div className="drive-row-primary">
                        <div className="col-action">
                          <span className="drive-name">{d.action}</span>
                          <span className="drive-raw">{d.rawMetric}</span>
                        </div>

                        <div className="drive-metrics-badge-group">
                          <span className="drive-pct-num">{d.percentage}%</span>
                          <div className="col-verdict">
                            {d.isWinner ? (
                              <span className="verdict-tag winner">[★] WON</span>
                            ) : d.normScore >= d.threshold ? (
                              <span className="verdict-tag passed">[ ] MET</span>
                            ) : (
                              <span className="verdict-tag low">[-] LOW</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="col-meter">
                        <div className="drive-bar-track">
                          <div
                            className={`drive-bar-fill ${d.isWinner ? 'fill-winner' : ''}`}
                            style={{ width: `${Math.min(100, Math.max(6, d.percentage))}%` }}
                          />
                          <div
                            className="drive-threshold-tick"
                            style={{ left: `${Math.round(d.threshold * 100)}%` }}
                            title={`Activation Threshold: ${Math.round(d.threshold * 100)}%`}
                          />
                        </div>
                        <div className="drive-meter-sub">
                          <span>drive: {d.normScore.toFixed(2)}</span>
                          <span>threshold: {d.threshold.toFixed(2)}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Human-Readable "Why It Won" Rationale */}
                <div className="compilation-rationale-box">
                  <div className="rationale-title">RATIONALE FOR SELECTION:</div>
                  <p className="rationale-prose">
                    {compilationBreakdown.rationale}
                  </p>
                </div>
              </div>
            ) : (
              <div className="compilation-empty-state">
                <p className="empty-instructions">
                  Deliver verse to quantify and compile acoustic drives into physical formactions.
                </p>
                <div className="candidate-tags-row">
                  <span className="cand-tag">{role === 'QUEEN' ? 'Barricade (40%)' : 'Lunge (45%)'}</span>
                  <span className="cand-tag">{role === 'QUEEN' ? 'Repel (25%)' : 'Pierce (25%)'}</span>
                  <span className="cand-tag">{role === 'QUEEN' ? 'Interpose (20%)' : 'Feint (20%)'}</span>
                  <span className="cand-tag">{role === 'QUEEN' ? 'Disarm (15%)' : 'Fracture (10%)'}</span>
                </div>
              </div>
            )}
          </div>

          {/* Formaction Physical Mechanics Table */}
          <div className="typesetter-box">
            <div className="box-woodcut-heading">
              <span>Speech Mechanics</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ink-crimson)' }}>ACOUSTIC MAPPING</span>
            </div>
            <table className="mechanics-print-table">
              <tbody>
                {(role === 'HAMLET' || role === 'SPECTATOR') && (
                  <>
                    <tr>
                      <td className="action-slug">LUNGE</td>
                      <td className="channel-note">
                        <span className="channel-trigger">Amplitude (RMS)</span>
                        <span className="channel-desc">Linear Thrust 1-4 Paces</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="action-slug">PIERCE</td>
                      <td className="channel-note">
                        <span className="channel-trigger">&gt;1.5s Silence</span>
                        <span className="channel-desc">Pierces Furniture &amp; Arras</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="action-slug">FEINT</td>
                      <td className="channel-note">
                        <span className="channel-trigger">Cadence (&plusmn;WPM)</span>
                        <span className="channel-desc">Realigns Stance / Recovers Blade</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="action-slug">FRACTURE</td>
                      <td className="channel-note">
                        <span className="channel-trigger">Verse Corruption</span>
                        <span className="channel-desc">Destroys Obstacles &amp; Arras</span>
                      </td>
                    </tr>
                  </>
                )}
                {(role === 'QUEEN' || role === 'SPECTATOR') && (
                  <>
                    {role === 'SPECTATOR' && (
                      <tr>
                        <td colSpan="2" style={{ borderTop: '2px solid var(--ink-black)', padding: '2px 0' }} />
                      </tr>
                    )}
                    <tr>
                      <td className="action-slug">REPEL</td>
                      <td className="channel-note">
                        <span className="channel-trigger">Amplitude (RMS)</span>
                        <span className="channel-desc">Pushes Rapier Back 1-2 Paces</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="action-slug">BARRICADE</td>
                      <td className="channel-note">
                        <span className="channel-trigger">&gt;1.5s Silence</span>
                        <span className="channel-desc">Overturns Furniture in Path</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="action-slug">INTERPOSE</td>
                      <td className="channel-note">
                        <span className="channel-trigger">Cadence (&plusmn;WPM)</span>
                        <span className="channel-desc">Shields Corridor Directly</span>
                      </td>
                    </tr>
                    <tr>
                      <td className="action-slug">DISARM</td>
                      <td className="channel-note">
                        <span className="channel-trigger">Verse Corruption</span>
                        <span className="channel-desc">Dislodges Prince's Weapon</span>
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </aside>

        {/* Center Column: The Composing Stick Stage */}
        <main className="stage-center-column">
          <GameEngine
            config={levelConfig}
            commands={dslCommands}
            simulationPhase={status === 'SIMULATING'}
            onTurnEnd={handleTurnEnd}
            onHamletWin={handleHamletWin}
          />

          {/* In-Situ Stage Direction Marginalia Ticker */}
          <div className="marginalia-ticker-box">
            <div className="marginalia-header-row">
              <span>Stage Direction Marginalia</span>
              <span>MEASURE {lineIndex + 1}</span>
            </div>
            <p className="marginalia-verse-text">
              {stageDirection}
            </p>
          </div>

          {/* Stamped Telemetry Marginalia Bar */}
          <div className="telemetry-marginalia-bar">
            <span>
              PROMPT_HEARD: <strong>{transcript ? `"${transcript}"` : (status === 'RECORDING' ? 'Listening...' : 'Standing by')}</strong>
            </span>
            <span>
              STATUS: <strong>{status}</strong>
            </span>
          </div>
        </main>

        {/* Right Column: The Dramatic Ledger */}
        <aside className="dramatic-ledger-column">
          {/* Measure Progression & Climax Curve */}
          <div className="typesetter-box">
            <div className="box-woodcut-heading">
              <span>Dramatic Measure</span>
              <span style={{ color: 'var(--ink-crimson)' }}>ACT III</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontFamily: 'var(--font-print)', fontSize: '0.75rem', fontWeight: 'bold' }}>MEASURE</span>
              <span className="progress-number-stamp">
                {toRoman(lineIndex + 1)} / {toRoman(totalLines)}
              </span>
            </div>

            <div className="hatch-tension-track">
              <div className="hatch-tension-fill" style={{ width: `${tensionPercent}%` }} />
            </div>

            <p className="tension-quarto-note">
              {lineIndex < 6 && "The argument ignites. Hamlet reproaches the Queen's conscience."}
              {lineIndex >= 6 && lineIndex < 11 && "Tension mounts toward crisis. The counselor stirs behind the arras."}
              {lineIndex >= 11 && "The deed is struck. The blood hath been spilt in Denmark."}
            </p>
          </div>

          {/* MAP-Elites Locus */}
          <div className="typesetter-box">
            <div className="box-woodcut-heading">
              <span>Chamber Architecture</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ink-crimson)' }}>MAP-ELITES</span>
            </div>
            <table className="mechanics-print-table">
              <tbody>
                <tr>
                  <td className="action-slug">CLAUSTROPHOBIA</td>
                  <td className="channel-note">
                    <span className="channel-trigger">
                      {levelConfig?.claustrophobia ? `${Math.round(levelConfig.claustrophobia * 100)}% Dense` : 'Moderate'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="action-slug">TACTICAL RESISTANCE</td>
                  <td className="channel-note">
                    <span className="channel-trigger">
                      {levelConfig?.tacticalFriction ? `${Math.round(levelConfig.tacticalFriction * 100)}% Friction` : 'Calculated'}
                    </span>
                  </td>
                </tr>
                <tr>
                  <td className="action-slug">NICHE LOCUS</td>
                  <td className="channel-note">
                    <span className="channel-trigger">{levelConfig?.mapCell || 'Archival Elite'}</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Stagecraft Board Legend */}
          <div className="typesetter-box">
            <div className="box-woodcut-heading">
              <span>Stagecraft Legend</span>
              <span style={{ fontSize: '0.7rem', color: 'var(--ink-crimson)' }}>BOARD PIECES</span>
            </div>

            <div className="legend-entries-list">
              <div className="legend-entry-row">
                <div className="legend-token-box legend-token-hamlet">H</div>
                <div className="legend-text-col">
                  <span className="legend-item-title">Prince Hamlet (Attacker)</span>
                  <p className="legend-item-desc">
                    The vengeful Prince. Commands the rapier forward; aims to pierce through the arras and strike Polonius before Measure XVIII.
                  </p>
                </div>
              </div>

              <div className="legend-entry-row">
                <div className="legend-token-box legend-token-gertrude">G</div>
                <div className="legend-text-col">
                  <span className="legend-item-title">Queen Gertrude (Defender)</span>
                  <p className="legend-item-desc">
                    The Queen Mother. Body-blocks lanes, shifts heavy furniture into corridors, and disarms Hamlet to preserve the counselor.
                  </p>
                </div>
              </div>

              <div className="legend-entry-row">
                <div className="legend-token-box legend-token-polonius">P</div>
                <div className="legend-text-col">
                  <span className="legend-item-title">Lord Polonius (Target)</span>
                  <p className="legend-item-desc">
                    Lord Chamberlain concealed behind the arras. If Hamlet's rapier penetrates his tile, Hamlet wins.
                  </p>
                </div>
              </div>

              <div className="legend-entry-row">
                <div className="legend-token-box legend-token-rapier">&mdash;&gt;</div>
                <div className="legend-text-col">
                  <span className="legend-item-title">The Dueling Rapier</span>
                  <p className="legend-item-desc">
                    Hamlet's physical weapon. Moves with Hamlet; knocked back by Repel, dislodged by Disarm, or realigned by Feint.
                  </p>
                </div>
              </div>

              <div className="legend-entry-row">
                <div className="legend-token-box legend-token-arras">|||</div>
                <div className="legend-text-col">
                  <span className="legend-item-title">The Arras (Tapestry)</span>
                  <p className="legend-item-desc">
                    Heavy wall hangings shielding Polonius's alcove. Blocks ordinary lunges; pierced by Pierce (&gt;1.5s pause) or Fracture.
                  </p>
                </div>
              </div>

              <div className="legend-entry-row">
                <div className="legend-token-box legend-token-furniture">&#9632;</div>
                <div className="legend-text-col">
                  <span className="legend-item-title">Heavy Furniture</span>
                  <p className="legend-item-desc">
                    Chamber obstacles (tables, trunks). Obstruct linear lunges; relocated by Gertrude's Barricade or shattered by Fracture.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </aside>

      </div>

      {/* Quarto Leaf Scene Conclusion Overlay with Options */}
      {resolutionModal && (
        <div className="quarto-leaf-overlay">
          <div className="quarto-leaf-card">
            <div className="broadside-ornament">&#10086; &#10086; &#10086;</div>
            <h2 className="leaf-resolution-title">{resolutionModal.title}</h2>
            <p className="leaf-resolution-subtitle">{resolutionModal.subtitle}</p>
            <div style={{ fontFamily: 'var(--font-print)', fontSize: '0.8rem', fontWeight: 'bold', letterSpacing: '0.08em' }}>
              ENCOUNTER CONCLUDED &bull; VICTOR: {resolutionModal.winner}
            </div>

            <div className="modal-actions-grid">
              <button className="leaf-resolution-btn" onClick={handleNextChamber}>
                Print Next Encounter (Keep Roles)
              </button>
              <button className="leaf-resolution-btn secondary" onClick={handleSwapRoles}>
                Swap Roles (Hamlet &harr; Gertrude)
              </button>
              <button className="leaf-resolution-btn secondary" onClick={handleReturnToPlaybill}>
                Return to Chamber Playbill
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
