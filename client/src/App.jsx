import { useEffect, useState, useRef } from 'react'
import { io } from 'socket.io-client'
import GameEngine from './GameEngine'
import './App.css'

function App() {
  const [role, setRole] = useState(null) // null (selection), 'HAMLET', 'QUEEN', 'SPECTATOR'
  const [levelConfig, setLevelConfig] = useState(null)
  const [scriptState, setScriptState] = useState(null)
  const [status, setStatus] = useState('IDLE')
  
  const [dslCommands, setDslCommands] = useState([])
  const [transcript, setTranscript] = useState("")
  const [commandToast, setCommandToast] = useState(null)

  const mediaRecorderRef = useRef(null)
  const audioChunks = useRef([])
  const recordingStartTime = useRef(0)
  const socketRef = useRef(null)

  const [autoPlayCPU, setAutoPlayCPU] = useState(false)

  useEffect(() => {
    socketRef.current = io('http://localhost:3001');

    socketRef.current.on('state-update', (data) => {
      setScriptState(data);
      setLevelConfig(prev => (prev?.id === data.level.id ? prev : data.level));
    });

    socketRef.current.on('turn-result', (data) => {
      setTranscript(data.text);
      setDslCommands(data.commands);
      
      if (data.commands && data.commands.length > 0) {
        setCommandToast(data.commands[0]);
        setTimeout(() => setCommandToast(null), 2500);
      }
      
      setStatus('SIMULATING');
    });

    return () => {
      socketRef.current.disconnect();
    }
  }, [])

  // CPU Opponent Logic
  useEffect(() => {
    if (autoPlayCPU && status === 'IDLE' && role && role !== 'SPECTATOR') {
      const isMyTurn = scriptState?.currentLine?.speaker === role;
      if (!isMyTurn && scriptState?.currentLine) {
        // Wait 2.5 seconds before the CPU "speaks" its line
        const timer = setTimeout(() => {
          fetch('http://localhost:3001/api/cpu-turn', { method: 'POST' })
            .catch(err => console.error("CPU Turn failed", err));
        }, 2500);
        return () => clearTimeout(timer);
      }
    }
  }, [scriptState, autoPlayCPU, status, role]);

  const startTurn = async () => {
    try {
      audioChunks.current = [];
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      
      const audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 16000 })
      const source = audioContext.createMediaStreamSource(stream)
      const processor = audioContext.createScriptProcessor(4096, 1, 1)
      
      source.connect(processor)
      processor.connect(audioContext.destination)
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        const pcmData = new Int16Array(inputData.length)
        for (let i = 0; i < inputData.length; i++) {
          pcmData[i] = Math.min(1, Math.max(-1, inputData[i])) * 0x7FFF
        }
        audioChunks.current.push(new Uint8Array(pcmData.buffer))
      }
      
      mediaRecorderRef.current = {
        stop: () => {
          processor.disconnect()
          source.disconnect()
          audioContext.close()
          stream.getTracks().forEach(track => track.stop())
        }
      }
      recordingStartTime.current = Date.now();
      setStatus('RECORDING')
    } catch (err) {
      console.error('Error accessing microphone', err)
    }
  }

  const stopTurnAndEvaluate = async () => {
    if (mediaRecorderRef.current) {
      mediaRecorderRef.current.stop()
    }
    setStatus('EVALUATING')
    
    const turnDuration = (Date.now() - recordingStartTime.current) / 1000;
    
    const totalLength = audioChunks.current.reduce((acc, val) => acc + val.length, 0);
    const combined = new Uint8Array(totalLength);
    let offset = 0;
    for (let chunk of audioChunks.current) {
      combined.set(chunk, offset);
      offset += chunk.length;
    }

    const estimatedWpmDelta = 100 / turnDuration;

    try {
      // Send audio to server, which will broadcast the turn-result via websocket
      await fetch(`http://localhost:3001/api/turn?wpmDelta=${estimatedWpmDelta}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: combined
      });
      // Do not set status here, rely on 'turn-result' socket event so all clients sync
    } catch (err) {
      console.error("Turn evaluation failed", err);
      setStatus('IDLE');
    }
  }

  const handleTurnEnd = () => {
    // Rely on socket for state sync. Just clear local visual state.
    setDslCommands([]);
    
    if (scriptState && scriptState.currentIndex >= scriptState.totalLines - 1) {
      // Only the active player triggers the reset to avoid race conditions
      if (role === 'QUEEN' || role === 'HAMLET') {
        alert(`[ SYSTEM MSG ]: SCENE SURVIVED. GERTRUDE WINS. LOADING NEXT UNIVERSE...`);
        fetch('http://localhost:3001/api/reset', { method: 'POST' });
      }
    }
    setStatus('IDLE');
  }

  const handleHamletWin = () => {
    if (role === 'QUEEN' || role === 'HAMLET') {
      alert("[ SYSTEM MSG ]: POLONIUS SLAIN. HAMLET WINS. UNIVERSE RESETTING...");
      fetch('http://localhost:3001/api/reset', { method: 'POST' });
    }
    setDslCommands([]);
    setStatus('IDLE');
  }

  // --- Role Selection Screen ---
  if (!role) {
    return (
      <div className="App selection-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '20px' }}>
        <header className="app-header">
          <h1>you are rhyme</h1>
        </header>
        <p>Select your role for this performance:</p>
        <button className="action-btn" onClick={() => setRole('HAMLET')} style={{ width: '200px', backgroundColor: '#2563eb', color: 'white', border: 'none' }}>Join as Hamlet</button>
        <button className="action-btn" onClick={() => setRole('QUEEN')} style={{ width: '200px', backgroundColor: '#9333ea', color: 'white', border: 'none' }}>Join as Gertrude</button>
        <button className="action-btn" onClick={() => setRole('SPECTATOR')} style={{ width: '200px', backgroundColor: '#4b5563', color: 'white', border: 'none' }}>Spectator Mode</button>
      </div>
    );
  }

  const isMyTurn = scriptState?.currentLine?.speaker === role;

  return (
    <div className="App">
      <header className="app-header">
        <h1>you are rhyme</h1>
        <div className="project-desc" style={{ marginTop: '20px' }}>
          <strong>Hamlet Act 3, Scene 4. A Voice-Activated Theatrical Duel.</strong>
          <p style={{ marginTop: '10px', fontSize: '14px', lineHeight: '1.4' }}>
            Portray your character through vocal performance to influence the physical stage. 
            Speak with volume, pause for dramatic effect, and faithfully deliver your lines. 
            Deviations and acoustic intensity will trigger asymmetrical physical forces. 
            Hamlet must pierce the Arras to slay Polonius; Gertrude must solidify her defenses to save him.
          </p>
        </div>
      </header>

      <div className="main-layout">
        {/* Left Column (Teleprompter) */}
        <aside className="side-panel left-panel">
          <h2>The Script</h2>
          <div className="teleprompter">
            {scriptState && scriptState.currentLine ? (
              <div className="script-line active-line">
                <span className="speaker-tag">{scriptState.currentLine.speaker}:</span>
                <p className="script-text">"{scriptState.currentLine.text}"</p>
              </div>
            ) : (
              <p>Scene Complete.</p>
            )}
          </div>
          
          <div className="controls">
            {role !== 'SPECTATOR' && (
              <>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '14px', cursor: 'pointer' }}>
                    <input 
                      type="checkbox" 
                      checked={autoPlayCPU} 
                      onChange={(e) => setAutoPlayCPU(e.target.checked)} 
                    />
                    Enable CPU Opponent
                  </label>
                </div>
                {status === 'IDLE' && isMyTurn && (
                  <button className="action-btn" onClick={startTurn}>Speak Line (Your Turn)</button>
                )}
                {status === 'IDLE' && !isMyTurn && (
                  <button className="action-btn disabled" disabled>Waiting for {scriptState?.currentLine?.speaker}...</button>
                )}
                {status === 'RECORDING' && isMyTurn && (
                  <button className="action-btn recording" onClick={stopTurnAndEvaluate}>Stop & Execute</button>
                )}
                {status === 'EVALUATING' && (
                  <button className="action-btn disabled" disabled>Evaluating...</button>
                )}
                {status === 'SIMULATING' && (
                  <button className="action-btn disabled" disabled>Simulating...</button>
                )}
              </>
            )}
            {role === 'SPECTATOR' && (
              <p>You are observing the duel.</p>
            )}
          </div>

          <div className="transcript-feedback">
            <strong>Heard:</strong> {transcript || (status === 'RECORDING' ? 'Listening...' : '')}
          </div>
        </aside>

        {/* Center Column (Stage) */}
        <main className="game-panel">
          <div className="game-wrapper">
            <GameEngine 
              config={levelConfig} 
              commands={dslCommands} 
              simulationPhase={status === 'SIMULATING'} 
              onTurnEnd={handleTurnEnd} 
              onHamletWin={handleHamletWin}
            />
            {commandToast && (
              <div className="command-toast animate-toast">
                ⚡ Action Executed: {commandToast.action}
              </div>
            )}
          </div>
        </main>

        {/* Right Column (Status) */}
        <aside className="side-panel right-panel">
          <h2>Status</h2>
          <div className="status-widget">
            <div className="status-item">
              <strong>Line</strong>
              <span>{(scriptState?.currentIndex || 0) + 1} of {scriptState?.totalLines || 18}</span>
            </div>
            <div className="status-item">
              <strong>Current Turn</strong>
              <span style={{color: scriptState?.currentLine?.speaker === 'HAMLET' ? '#2563eb' : '#9333ea', fontWeight: 'bold'}}>
                {scriptState?.currentLine?.speaker || 'None'}
              </span>
            </div>
          </div>

          <div className="legend-panel">
            <h2>Cast & Props</h2>
            <ul className="legend-list">
              <li><span className="legend-icon" style={{color: '#2563eb'}}>H</span> Hamlet</li>
              <li><span className="legend-icon" style={{color: '#9333ea'}}>G</span> Gertrude</li>
              <li><span className="legend-icon" style={{color: '#16a34a'}}>P</span> Polonius</li>
              <li><span className="legend-icon" style={{color: '#4b5563'}}>|||</span> The Arras</li>
              <li><span className="legend-icon" style={{color: '#dc2626'}}>=={'>'}</span> Rapier</li>
              <li><span className="legend-icon" style={{color: '#b45309'}}>[]</span> Furniture</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
