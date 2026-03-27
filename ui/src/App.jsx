import { useState, useEffect, useRef, useCallback } from 'react'
import {
  Shield, Sword, BarChart3, FileText, Zap,
  Play, Square, RefreshCw, Cpu, Wifi, WifiOff,
  AlertTriangle, CheckCircle, Lock, Unlock
} from 'lucide-react'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend
} from 'recharts'

const API = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') ? 'http://localhost:7860' : window.location.origin
const api = (path, opts = {}) => fetch(`${API}${path}`, opts).then(r => r.json())

function useInterval(fn, ms) {
  const saved = useRef(fn)
  useEffect(() => { saved.current = fn }, [fn])
  useEffect(() => { const id = setInterval(() => saved.current(), ms); return () => clearInterval(id) }, [ms])
}

// ── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ page, setPage }) {
  const items = [
    { id: 'match', icon: <Zap size={16} />, label: 'Live Match' },
    { id: 'red', icon: <Sword size={16} />, label: 'Red Team Lab' },
    { id: 'blue', icon: <Shield size={16} />, label: 'Blue Team Lab' },
    { id: 'stats', icon: <BarChart3 size={16} />, label: 'Statistics' },
    { id: 'report', icon: <FileText size={16} />, label: 'Report' },
  ]
  return (
    <div className="sidebar">
      <div className="sidebar-logo">Rv<span>s</span>B <span style={{ fontSize: '.65rem', color: 'var(--text-dim)', fontWeight: 400 }}>v3</span></div>
      {items.map(it => (
        <div key={it.id} className={`nav-item${page === it.id ? ' active' : ''}`} onClick={() => setPage(it.id)}>
          {it.icon}{it.label}
        </div>
      ))}
    </div>
  )
}

// ── Model selector ────────────────────────────────────────────────────────────
function ModelSelector({ value, onChange, label }) {
  const [models, setModels] = useState([])
  const [ollamaOk, setOllamaOk] = useState(false)

  useEffect(() => {
    api('/api/models').then(d => {
      setModels(d.models || [])
      setOllamaOk(d.ollama_running)
    }).catch(() => { })
  }, [])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
      <label style={{ fontSize: '.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>
        {label} &nbsp;
        {ollamaOk
          ? <span style={{ color: 'var(--green)' }}><Wifi size={11} style={{ verticalAlign: 'middle' }} /> Ollama</span>
          : <span style={{ color: 'var(--text-dim)' }}><WifiOff size={11} style={{ verticalAlign: 'middle' }} /> No Ollama</span>}
      </label>
      <select value={value} onChange={e => onChange(e.target.value)}
        style={{
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 6,
          color: 'var(--white)', padding: '.4rem .6rem', fontSize: '.82rem', fontFamily: 'inherit', cursor: 'pointer'
        }}>
        {models.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
      </select>
    </div>
  )
}

// ── Network Map ───────────────────────────────────────────────────────────────
const SVC_ICONS = { ssh: '🔐', http: '🌐', ftp: '📂', smb: '🗂', rdp: '🖥' }

function NetworkMap({ netState, matchActive }) {
  const CX = 200, CY = 200, R = 130

  if (!netState) return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      height: 400, color: 'var(--text-dim)', fontSize: '.85rem', flexDirection: 'column', gap: '.5rem'
    }}>
      <Cpu size={32} style={{ opacity: .3 }} />
      <span>Start a match to see the live network map</span>
    </div>
  )

  const { nodes = [], alerts = 0, foothold = false, flag_captured = false, attacker_at } = netState

  return (
    <div style={{ position: 'relative' }}>
      {/* Stats bar */}
      <div style={{ display: 'flex', gap: '1rem', marginBottom: '.75rem', flexWrap: 'wrap' }}>
        <div className="phase-badge phase-attack">
          <AlertTriangle size={11} /> Alerts: {alerts}
        </div>
        <div className={`phase-badge ${foothold ? 'phase-attack' : 'phase-idle'}`}>
          {foothold ? <Unlock size={11} /> : <Lock size={11} />}
          {foothold ? 'Foothold Gained' : 'No Foothold'}
        </div>
        <div className={`phase-badge ${flag_captured ? 'phase-attack' : 'phase-idle'}`}>
          {flag_captured ? '🚩 Flag Captured!' : '🏁 Flag Safe'}
        </div>
        <div className="phase-badge phase-idle" style={{ marginLeft: 'auto' }}>
          Step {netState.step}
        </div>
      </div>

      <svg width="100%" viewBox="0 0 400 400" style={{ maxHeight: 360 }}>
        {/* Center — protected server */}
        <circle cx={CX} cy={CY} r={28}
          fill={foothold ? 'rgba(255,71,87,.25)' : 'rgba(30,144,255,.15)'}
          stroke={foothold ? 'var(--red)' : 'var(--blue)'} strokeWidth={2} />
        <text x={CX} y={CY + 5} textAnchor="middle" fill="white" fontSize={11} fontWeight={700}>TARGET</text>

        {/* Lines from center to nodes */}
        {nodes.map(n => {
          const rad = (n.angle - 90) * Math.PI / 180
          const nx = CX + R * Math.cos(rad)
          const ny = CY + R * Math.sin(rad)
          const col = n.status === 'patched' ? '#2ed573'
            : n.status === 'open' ? '#ff4757'
              : '#21262d'
          return (
            <line key={n.id} x1={CX} y1={CY} x2={nx} y2={ny}
              stroke={col} strokeWidth={n.id === attacker_at ? 2 : 1}
              strokeDasharray={n.status === 'hidden' ? '4 4' : 'none'}
              opacity={n.status === 'hidden' ? 0.3 : 0.7} />
          )
        })}

        {/* Service nodes */}
        {nodes.map(n => {
          const rad = (n.angle - 90) * Math.PI / 180
          const nx = CX + R * Math.cos(rad)
          const ny = CY + R * Math.sin(rad)
          const isActive = n.id === attacker_at
          const fill = n.status === 'patched' ? 'rgba(46,213,115,.2)'
            : n.status === 'open' ? 'rgba(255,71,87,.2)'
              : 'rgba(33,38,46,.8)'
          const stroke = n.status === 'patched' ? '#2ed573'
            : n.status === 'open' ? '#ff4757'
              : '#30363d'

          return (
            <g key={n.id}>
              {isActive && <circle cx={nx} cy={ny} r={26} fill="none" stroke="#ff4757" strokeWidth={1.5} opacity={.5}>
                <animate attributeName="r" from={22} to={32} dur="0.8s" repeatCount="indefinite" />
                <animate attributeName="opacity" from={.7} to={0} dur="0.8s" repeatCount="indefinite" />
              </circle>}
              <circle cx={nx} cy={ny} r={22} fill={fill} stroke={stroke} strokeWidth={2} />
              <text x={nx} y={ny - 3} textAnchor="middle" fontSize={13}>{SVC_ICONS[n.id] || '⚙'}</text>
              <text x={nx} y={ny + 13} textAnchor="middle" fill="white" fontSize={9} fontWeight={600}>{n.label}</text>
              {n.status === 'patched' && (
                <text x={nx + 14} y={ny - 14} fontSize={10}>🛡</text>
              )}
            </g>
          )
        })}

        {/* Alert flash overlay */}
        {alerts > 0 && (
          <circle cx={CX} cy={CY} r={28} fill="none" stroke="#ff4757" strokeWidth={3} opacity={0.6}>
            <animate attributeName="stroke-opacity" from={0.8} to={0} dur="1s" repeatCount="indefinite" />
          </circle>
        )}
      </svg>

      {/* Legend */}
      <div style={{ display: 'flex', gap: '1rem', marginTop: '.5rem', fontSize: '.75rem', color: 'var(--text-dim)' }}>
        <span><span style={{ color: '#ff4757' }}>●</span> Open / Under Attack</span>
        <span><span style={{ color: '#2ed573' }}>●</span> Patched / Defended</span>
        <span><span style={{ color: '#30363d' }}>●</span> Not yet discovered</span>
        <span style={{ marginLeft: 'auto' }}><span style={{ color: 'var(--red)' }}>⚡</span> Active attack node</span>
      </div>
    </div>
  )
}

// ── LIVE MATCH PAGE ───────────────────────────────────────────────────────────
function MatchPage() {
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const [netState, setNetState] = useState(null)
  const [redScores, setRedScores] = useState({})
  const [blueScores, setBlueScores] = useState({})
  const [phase, setPhase] = useState('idle')
  const [redModel, setRedModel] = useState('dolphin-llama3:latest')
  const [blueModel, setBlueModel] = useState('dolphin-llama3:latest')
  const [maxSteps, setMaxSteps] = useState(40)
  const esRef = useRef(null)
  const logsRef = useRef()

  useEffect(() => {
    if (logsRef.current) logsRef.current.scrollTop = logsRef.current.scrollHeight
  }, [logs])

  const startMatch = async () => {
    setLogs([]); setRedScores({}); setBlueScores({}); setNetState(null)
    await api('/api/match/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ env_url: 'http://localhost:7860', red_model: redModel, blue_model: blueModel, max_steps: maxSteps }),
    })
    setRunning(true); setPhase('competing')

    if (esRef.current) esRef.current.close()
    const es = new EventSource(`${API}/api/match/stream`)
    esRef.current = es

    es.onmessage = e => {
      const evt = JSON.parse(e.data)
      switch (evt.type) {
        case 'red_action':
          setLogs(l => [...l, { text: evt.data.log, cls: 'log-red' }])
          if (evt.data.reasoning) setLogs(l => [...l, { text: `   💭 ${evt.data.reasoning}`, cls: 'log-dim' }])
          setPhase('red_attack'); break
        case 'blue_action':
          setLogs(l => [...l, { text: evt.data.log, cls: 'log-blue' }])
          if (evt.data.reasoning) setLogs(l => [...l, { text: `   🛡 ${evt.data.reasoning}`, cls: 'log-dim' }])
          setPhase('blue_defense'); break
        case 'network_state':
          setNetState(evt.data); break
        case 'match_end':
          setRedScores(evt.data.red_scores)
          setBlueScores(evt.data.blue_scores)
          setPhase('report'); setRunning(false); es.close(); break
        case 'error':
          setLogs(l => [...l, { text: `ERROR: ${evt.data.message}`, cls: 'log-red' }])
          setRunning(false); es.close(); break
      }
    }
    es.onerror = () => { setRunning(false); es.close() }
  }

  const stopMatch = async () => {
    await api('/api/match/stop', { method: 'POST' })
    setRunning(false); setPhase('idle')
    if (esRef.current) esRef.current.close()
  }

  const phaseMap = { competing: 'phase-idle', red_attack: 'phase-attack', blue_defense: 'phase-defend', report: 'phase-report', idle: 'phase-idle' }
  const phaseLabel = { competing: 'Match Running', red_attack: 'Red Attacking', blue_defense: 'Blue Defending', report: 'Complete', idle: 'Idle' }

  return (
    <div>
      <div className="page-title" style={{ marginBottom: '1.25rem' }}>
        <Zap size={22} /> Live Match
        <span className={`phase-badge ${phaseMap[phase]}`} style={{ marginLeft: '.75rem' }}>
          <span className={`dot ${running ? (phase === 'red_attack' ? 'dot-red' : 'dot-blue') : 'dot-dim'}`} />
          {phaseLabel[phase] || phase}
        </span>
      </div>

      {/* Controls */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <ModelSelector value={redModel} onChange={setRedModel} label="Red Team Model" />
          <ModelSelector value={blueModel} onChange={setBlueModel} label="Blue Team Model" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            <label style={{ fontSize: '.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Max Steps</label>
            <input className="input" type="number" min={10} max={100} value={maxSteps}
              onChange={e => setMaxSteps(+e.target.value)} style={{ width: 70 }} />
          </div>
          <div style={{ display: 'flex', gap: '.5rem', marginTop: 'auto' }}>
            <button className="btn btn-red" onClick={startMatch} disabled={running}>
              <Play size={14} /> Start Match
            </button>
            {running && <button className="btn btn-ghost" onClick={stopMatch}>
              <Square size={14} /> Stop
            </button>}
          </div>
        </div>
      </div>

      {/* Network map + log */}
      <div className="grid-2" style={{ marginBottom: '1rem' }}>
        <div className="card">
          <div className="card-title">Live Network Map</div>
          <NetworkMap netState={netState} matchActive={running} />
        </div>
        <div className="card">
          <div className="card-title">Action Log</div>
          <div className="terminal" ref={logsRef} style={{ maxHeight: 360 }}>
            {logs.length === 0 && <span className="log-dim">Waiting for match to start…</span>}
            {logs.map((l, i) => <div key={i} className={l.cls || ''}>{l.text}</div>)}
          </div>
        </div>
      </div>

      {/* Scoreboard */}
      {Object.keys(redScores).length > 0 && (
        <div className="card">
          <div className="card-title">Final Scoreboard</div>
          <table className="score-table">
            <thead><tr><th>Task</th><th>Red Team (Attack)</th><th>Blue Team (Defence)</th><th>Winner</th></tr></thead>
            <tbody>
              {['stealth_recon', 'precision_exploit', 'flag_capture'].map(t => {
                const r = (redScores[t] ?? 0).toFixed(3)
                const b = (blueScores[t] ?? 0).toFixed(3)
                const w = r > b ? 'Red' : b > r ? 'Blue' : 'Draw'
                return (
                  <tr key={t}>
                    <td>{t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}</td>
                    <td className="tag-red">{r}</td>
                    <td className="tag-blue">{b}</td>
                    <td className={w === 'Red' ? 'tag-red' : w === 'Blue' ? 'tag-blue' : 'tag-green'}>{w}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── TRAINING LAB ─────────────────────────────────────────────────────────────
function TrainingLab({ role }) {
  const [episodes, setEpisodes] = useState(10)
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState([])
  const [stats, setStats] = useState(null)
  const [model, setModel] = useState('dolphin-llama3:latest')
  const [latestEvent, setLatestEvent] = useState(null)
  const color = role === 'red' ? 'var(--red)' : 'var(--blue)'
  const BtnCls = role === 'red' ? 'btn-red' : 'btn-blue'
  const esRef = useRef(null)

  const loadStats = async () => {
    const s = await api(`/api/stats/${role}`)
    setStats(s.stats)
    const hist = (s.reward_history || []).map((v, i) => ({ ep: i + 1, reward: +v.toFixed(3) }))
    setResults(hist)
  }

  useEffect(() => { loadStats() }, [role])

  const train = async () => {
    setLoading(true)
    setLatestEvent(null)

    await api(`/api/train/${role}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ episodes: Number(episodes), model }),
    })

    if (esRef.current) esRef.current.close()
    const es = new EventSource(`${API}/api/train/stream`)
    esRef.current = es

    es.onmessage = e => {
      const evt = JSON.parse(e.data)
      if (evt.type === 'episode_done') {
        const d = evt.data
        setLatestEvent(d)
        setResults(prev => {
          const arr = [...prev]
          const last = arr[arr.length - 1]
          if (last && last.ep === d.episode) return arr
          return [...arr, { ep: d.episode, reward: +d.avg_reward.toFixed(3) }]
        })
      } else if (evt.type === 'train_end' || evt.type === 'error') {
        setLoading(false)
        es.close()
        loadStats()
      }
    }
    es.onerror = () => { setLoading(false); es.close() }
  }

  const stopTraining = async () => {
    await api('/api/train/stop', { method: 'POST' })
    if (esRef.current) esRef.current.close()
    setLoading(false)
  }

  const Icon = role === 'red' ? Sword : Shield
  const title = role === 'red' ? 'Red Team Training Lab' : 'Blue Team Training Lab'

  return (
    <div>
      <div className="page-title" style={{ marginBottom: '1.25rem' }}>
        <Icon size={22} /> {title}
      </div>

      <div className="grid-3" style={{ marginBottom: '1rem' }}>
        {stats && <>
          <div className="stat-badge">
            <div className="stat-label">Episodes Trained</div>
            <div className="stat-value" style={{ color }}>{stats.episodes}</div>
          </div>
          <div className="stat-badge">
            <div className="stat-label">Avg Reward (last 20)</div>
            <div className="stat-value" style={{ color }}>{stats.avg_reward_last20}</div>
          </div>
          <div className="stat-badge">
            <div className="stat-label">Exploration</div>
            <div className="stat-value" style={{ color }}>{(stats.exploration_rate * 100).toFixed(1)}%</div>
          </div>
        </>}
      </div>

      <div className="card" style={{ marginBottom: '1rem' }}>
        <div className="card-title">Training Session</div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <ModelSelector value={model} onChange={setModel} label="LLM Model" />
          <div style={{ display: 'flex', flexDirection: 'column', gap: '.3rem' }}>
            <label style={{ fontSize: '.75rem', color: 'var(--text-dim)', fontWeight: 600 }}>Episodes</label>
            <input className="input" type="number" min={1} max={500} value={episodes}
              onChange={e => setEpisodes(e.target.value)} />
          </div>
          <button className={`btn ${BtnCls}`} onClick={train} disabled={loading} style={{ marginTop: 'auto' }}>
            {loading ? <><RefreshCw size={14} className="spin" /> Training…</> : <><Play size={14} /> Train</>}
          </button>
          {loading && (
            <button className="btn btn-ghost" onClick={stopTraining} style={{ marginTop: 'auto' }}>
              <Square size={14} /> Stop
            </button>
          )}
        </div>

        {loading && latestEvent && (
          <div style={{ padding: '1rem', background: 'var(--bg)', borderRadius: 8, marginTop: '1rem', border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '.75rem' }}>
              <div style={{ fontSize: '.85rem', fontWeight: 600, color: 'var(--white)' }}>
                Training Episode {latestEvent.episode} / {latestEvent.total_episodes}
              </div>
              <div className="phase-badge phase-attack" style={{ background: 'transparent', border: 'none', padding: 0 }}>
                {latestEvent.steps} Steps
              </div>
            </div>
            <div style={{ height: 4, background: 'var(--surface)', borderRadius: 2, marginBottom: '1rem', overflow: 'hidden' }}>
              <div style={{ height: '100%', background: color, width: `${(latestEvent.episode / latestEvent.total_episodes) * 100}%`, transition: 'width 0.3s' }} />
            </div>

            <div className="grid-3" style={{ gap: '.5rem', marginBottom: '.75rem' }}>
              {Object.entries(latestEvent.scores || {}).map(([task, score]) => (
                <div key={task} style={{ fontSize: '.75rem', padding: '.4rem .6rem', background: 'var(--surface)', borderRadius: 4, border: '1px solid var(--border)' }}>
                  <div style={{ color: 'var(--text-dim)', marginBottom: 2 }}>{task.replace('_', ' ')}</div>
                  <div style={{ color: 'var(--white)', fontWeight: 600 }}>{(score * 10).toFixed(1)} / 10</div>
                </div>
              ))}
            </div>

            {latestEvent.strategy && (
              <div style={{ fontSize: '.75rem', color: 'var(--text-dim)', lineHeight: 1.5, padding: '.75rem', background: 'var(--surface)', borderRadius: 6, borderLeft: `3px solid ${color}` }}>
                <strong style={{ color: 'var(--text)' }}>LLM Debrief:</strong> {latestEvent.strategy}
              </div>
            )}
          </div>
        )}

        {!loading && (
          <div style={{ fontSize: '.8rem', color: 'var(--text-dim)', lineHeight: 1.7, marginTop: '1rem' }}>
            <strong style={{ color: 'var(--white)' }}>No dataset required.</strong> The agent learns purely through
            experience against the simulation — each episode is one training run.<br />
            To bootstrap with real attack techniques, see the MITRE ATT&amp;CK dataset:{' '}
            <a href="https://github.com/mitre-attack/attack-stix-data" target="_blank"
              style={{ color: color, textDecoration: 'none' }}>
              github.com/mitre-attack/attack-stix-data
            </a>
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="card">
          <div className="card-title">Reward over Episodes</div>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={results}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="ep" stroke="var(--border)" />
              <YAxis stroke="var(--border)" />
              <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
              <Line type="monotone" dataKey="reward" stroke={color} dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

// ── STATS PAGE ────────────────────────────────────────────────────────────────
function StatsPage() {
  const [combined, setCombined] = useState([])
  const load = async () => {
    const [r, b] = await Promise.all([api('/api/stats/red'), api('/api/stats/blue')])
    const rh = r.reward_history || [], bh = b.reward_history || []
    const len = Math.max(rh.length, bh.length)
    setCombined(Array.from({ length: len }, (_, i) => ({
      ep: i + 1,
      red: rh[i] != null ? +rh[i].toFixed(3) : null,
      blue: bh[i] != null ? +bh[i].toFixed(3) : null,
    })))
  }
  useEffect(() => { load() }, [])
  useInterval(load, 15000)
  return (
    <div>
      <div className="page-title" style={{ marginBottom: '1.25rem' }}>
        <BarChart3 size={22} /> Statistics
        <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={load}><RefreshCw size={14} /></button>
      </div>
      <div className="card">
        <div className="card-title">Combined Reward History</div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={combined}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="ep" stroke="var(--border)" />
            <YAxis stroke="var(--border)" />
            <Tooltip contentStyle={{ background: 'var(--card)', border: '1px solid var(--border)', borderRadius: 8, color: 'var(--text)' }} />
            <Legend />
            <Line type="monotone" dataKey="red" stroke="var(--red)" dot={false} strokeWidth={2} name="Red Team" />
            <Line type="monotone" dataKey="blue" stroke="var(--blue)" dot={false} strokeWidth={2} name="Blue Team" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}

// ── REPORT PAGE ───────────────────────────────────────────────────────────────
function ReportPage() {
  const [url, setUrl] = useState(null)
  const load = () => setUrl(`${API}/api/report/latest?t=${Date.now()}`)
  useEffect(() => { load() }, [])
  return (
    <div>
      <div className="page-title" style={{ marginBottom: '1.25rem' }}>
        <FileText size={22} /> Security Assessment Report
        <button className="btn btn-ghost" style={{ marginLeft: 'auto' }} onClick={load}><RefreshCw size={14} /> Reload</button>
      </div>
      {url
        ? <iframe className="report-frame" src={url} title="Security Report" />
        : <div className="card" style={{ color: 'var(--text-dim)' }}>No report yet. Complete a match first.</div>}
    </div>
  )
}

// ── ROOT ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [page, setPage] = useState('match')
  return (
    <div className="app">
      <Sidebar page={page} setPage={setPage} />
      <div className="main">
        {page === 'match' && <MatchPage />}
        {page === 'red' && <TrainingLab role="red" />}
        {page === 'blue' && <TrainingLab role="blue" />}
        {page === 'stats' && <StatsPage />}
        {page === 'report' && <ReportPage />}
      </div>
    </div>
  )
}
