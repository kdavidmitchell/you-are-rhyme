import { useEffect, useState, useRef } from 'react'
import GameEngine from './GameEngine'
import './App.css'

const STAGE_DIRECTIONS = {
  'Suspend': 'Pause heavily mid-sentence.',
  'Invert': 'Speak quickly in a sudden rush.',
  'Swap': 'Speak of trading places and reversed perspectives.',
  'Fracture': 'Speak with sudden anger.',
  'Duplicate': 'Repeat your words and double your meaning.',
  'Magnetize': 'Speak of desire and pulling things together.',
  'Repel': 'Speak of disgust and casting things away.',
  'AlterMass': 'Speak of immense burdens and heavy weight.'
};

function App() {
  const [levelConfig, setLevelConfig] = useState(null)
  const [turn, setTurn] = useState(1)
  const [status, setStatus] = useState('IDLE')
  
  const [dslCommands, setDslCommands] = useState([])
  const [transcript, setTranscript] = useState("")
  const [commandToast, setCommandToast] = useState(null)

  const mediaRecorderRef = useRef(null)
  const audioChunks = useRef([])
  const recordingStartTime = useRef(0)

  useEffect(() => {
    fetch('http://localhost:3001/api/level')
      .then(res => res.json())
      .then(data => setLevelConfig(data))
      .catch(err => console.error("Failed to load level:", err));
  }, [])

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

    try {
      const res = await fetch(`http://localhost:3001/api/turn?pauseDuration=0.5&wpmDelta=${100/turnDuration}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream'
        },
        body: combined
      });
      
      const data = await res.json();
      setTranscript(data.text);
      setDslCommands(data.commands);
      
      if (data.commands && data.commands.length > 0) {
        setCommandToast(data.commands[0]);
        setTimeout(() => setCommandToast(null), 2500);
      }
      
      setStatus('SIMULATING');
      
    } catch (err) {
      console.error("Turn evaluation failed", err);
      setStatus('IDLE');
    }
  }

  const handleTurnEnd = () => {
    const maxTurns = levelConfig?.par || 1;
    setTurn(t => t + 1);
    setDslCommands([]);
    
    if (turn >= maxTurns) {
      alert(`[ SYSTEM MSG ]: SCENE SURVIVED. LOADING NEXT UNIVERSE...`);
      setTurn(1);
      fetch('http://localhost:3001/api/level').then(r=>r.json()).then(d=>setLevelConfig(d));
    }
    setStatus('IDLE');
  }

  const handleTragedy = () => {
    alert("[ SYSTEM MSG ]: TRAGEDY DETECTED. UNIVERSE RESETTING...");
    setTurn(1);
    setStatus('IDLE');
    fetch('http://localhost:3001/api/level').then(r=>r.json()).then(d=>setLevelConfig(d));
  }

  const getGravityDesc = () => {
    if (!levelConfig) return 'ANALYZING...';
    const gx = levelConfig.gravityX || 0;
    const gy = levelConfig.gravityY !== undefined ? levelConfig.gravityY : 1;
    const magnitude = Math.sqrt(gx*gx + gy*gy).toFixed(2);
    
    let direction = "";
    const angle = Math.atan2(gy, gx) * (180 / Math.PI);
    
    if (angle > -22.5 && angle <= 22.5) direction = "EAST";
    else if (angle > 22.5 && angle <= 67.5) direction = "SOUTH-EAST";
    else if (angle > 67.5 && angle <= 112.5) direction = "SOUTH";
    else if (angle > 112.5 && angle <= 157.5) direction = "SOUTH-WEST";
    else if (angle > 157.5 || angle <= -157.5) direction = "WEST";
    else if (angle > -157.5 && angle <= -112.5) direction = "NORTH-WEST";
    else if (angle > -112.5 && angle <= -67.5) direction = "NORTH";
    else if (angle > -67.5 && angle <= -22.5) direction = "NORTH-EAST";

    return `G-FORCE: ${magnitude} | VECTOR: ${direction} (${angle.toFixed(0)}°)`;
  }

  return (
    <div className="App">
      <header className="app-header">
        <h1>you are rhyme</h1>
        <p className="project-desc">
          In 2014, Simon Palfrey wrote "Shakespeare's Possible Worlds", where he talks about formactions, derived from Leibniz's monads...
        </p>
      </header>

      <div className="main-layout">
        {/* Left Column */}
        <aside className="side-panel left-panel">
          <h2>Stage Direction</h2>
          <p className="instruction">
            Improvise your monologue. You must embody the following direction to avert the tragedy:
          </p>
          <div className="director-note">
            {levelConfig ? STAGE_DIRECTIONS[levelConfig.solution] || 'Waiting for cue...' : 'Loading Universe...'}
          </div>
          
          <div className="controls">
            {status === 'IDLE' && (
              <button className="action-btn" onClick={startTurn}>Start Turn (Speak)</button>
            )}
            {status === 'RECORDING' && (
              <button className="action-btn recording" onClick={stopTurnAndEvaluate}>Stop & Execute</button>
            )}
            {status === 'EVALUATING' && (
              <button className="action-btn disabled" disabled>Evaluating...</button>
            )}
            {status === 'SIMULATING' && (
              <button className="action-btn disabled" disabled>Simulating...</button>
            )}
          </div>
        </aside>

        {/* Center Column */}
        <main className="game-panel">
          <div className="game-wrapper">
            <GameEngine 
              config={levelConfig} 
              commands={dslCommands} 
              simulationPhase={status === 'SIMULATING'} 
              onTurnEnd={handleTurnEnd} 
              onTragedy={handleTragedy}
            />
            
            {commandToast && (
              <div className="command-toast animate-toast">
                ⚡ Action Executed: {commandToast.action}
              </div>
            )}
            
            <div className="transcript-feedback">
              <strong>Heard:</strong> {transcript || (status === 'RECORDING' ? 'Listening...' : '')}
            </div>
          </div>
        </main>

        {/* Right Column */}
        <aside className="side-panel right-panel">
          <h2>Status</h2>
          <div className="status-widget">
            <div className="status-item">
              <strong>Turn</strong>
              <span>{turn} of {levelConfig?.par || 1}</span>
            </div>
            <div className="status-item">
              <strong>Environment Scan</strong>
              <span className="gravity-text">{getGravityDesc()}</span>
            </div>
          </div>

          <div className="legend-panel">
            <h2>ASCII Legend</h2>
            <ul className="legend-list">
              <li><span className="legend-icon" style={{color: '#b8860b'}}>W</span> The Crown</li>
              <li><span className="legend-icon" style={{color: '#dc2626'}}>V</span> The Dagger</li>
              <li><span className="legend-icon" style={{color: '#78350f'}}>---</span> Obstacle</li>
              <li><span className="legend-icon" style={{color: '#0ea5e9'}}>===</span> Glass</li>
              <li><span className="legend-icon" style={{color: '#ea580c'}}>[]</span> Debris</li>
              <li><span className="legend-icon" style={{color: '#0d9488'}}>(@)</span> Lodestone</li>
              <li><span className="legend-icon" style={{color: '#000000'}}>###</span> Boundary</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  )
}

export default App
