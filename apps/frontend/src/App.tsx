import { useState, useEffect, useCallback } from 'react'

const API = 'http://localhost:4000/api'

interface User {
  userId: string
  username: string
}

interface TS6Channel {
  cid: number
  pid: number
  channel_name: string
  total_clients?: number
}

interface TS6Client {
  clid: number
  cid: number
  client_nickname: string
  client_is_talking?: boolean
  client_input_muted?: boolean
  client_output_muted?: boolean
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'))
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [channels, setChannels] = useState<TS6Channel[]>([])
  const [clients, setClients] = useState<TS6Client[]>([])
  const [selectedChannel, setSelectedChannel] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [connected, setConnected] = useState(false)

  const handleLogin = useCallback(async () => {
    setLoginError('')
    setLoading(true)
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const data = await res.json()
      if (data.code === 'SUCCESS') {
        localStorage.setItem('token', data.data.token)
        setToken(data.data.token)
        setUser(data.data.user)
      } else {
        setLoginError(data.message || 'Credenciais invalidas')
      }
    } catch {
      setLoginError('Erro ao conectar ao servidor')
    } finally {
      setLoading(false)
    }
  }, [username, password])

  const handleLogout = useCallback(async () => {
    try {
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
    } catch {}
    localStorage.removeItem('token')
    setToken(null)
    setUser(null)
    setChannels([])
    setClients([])
    setConnected(false)
  }, [token])

  useEffect(() => {
    if (!token) return
    fetch(`${API}/auth/me`, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (data.code === 'SUCCESS') {
          setUser({ userId: data.data.userId, username: data.data.username })
          setConnected(true)
        } else {
          localStorage.removeItem('token')
          setToken(null)
        }
      })
      .catch(() => {
        localStorage.removeItem('token')
        setToken(null)
      })
  }, [token])

  useEffect(() => {
    if (!token || !connected) return
    const load = () => {
      fetch(`${API}/channels`, { headers: { 'Authorization': `Bearer ${token}` } })
        .then(r => r.json())
        .then(data => {
          if (data.code === 'SUCCESS') {
            setChannels(data.data.channels || [])
            setClients(data.data.clients || [])
          }
        })
        .catch(() => {})
    }
    load()
    const interval = setInterval(load, 2000)
    return () => clearInterval(interval)
  }, [token, connected])

  if (!token || !user) {
    return (
      <div style={styles.loginContainer}>
        <div style={styles.loginBox}>
          <div style={styles.logo}>🎙️</div>
          <h1 style={styles.title}>TeamSpeak 6 Web Client</h1>
          <p style={styles.subtitle}>Faça login para entrar no servidor</p>
          {loginError && <div style={styles.error}>{loginError}</div>}
          <input
            style={styles.input}
            type="text"
            placeholder="Nome de usuário"
            value={username}
            onChange={e => setUsername(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          <input
            style={styles.input}
            type="password"
            placeholder="Senha"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
          />
          <button
            style={{ ...styles.button, opacity: loading ? 0.6 : 1 }}
            onClick={handleLogin}
            disabled={loading}
          >
            {loading ? 'Entrando...' : 'Entrar'}
          </button>
          <p style={styles.hint}>Use qualquer nome + senha "eiros" para entrar</p>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.mainContainer}>
      <div style={styles.header}>
        <div style={styles.headerLeft}>
          <span style={styles.headerLogo}>🎙️</span>
          <span style={styles.headerTitle}>TeamSpeak 6</span>
        </div>
        <div style={styles.headerRight}>
          <span style={styles.headerUser}>👤 {user.username}</span>
          <button style={styles.logoutBtn} onClick={handleLogout}>Sair</button>
        </div>
      </div>

      <div style={styles.content}>
        <div style={styles.sidebar}>
          <h2 style={styles.sidebarTitle}>📂 Canais ({channels.length})</h2>
          {channels.map(ch => {
            const channelClients = clients.filter(c => c.cid === ch.cid)
            const isSelected = selectedChannel === ch.cid
            return (
              <div
                key={ch.cid}
                style={{
                  ...styles.channelItem,
                  background: isSelected ? '#3b82f6' : 'transparent',
                }}
                onClick={() => setSelectedChannel(ch.cid)}
              >
                <div style={styles.channelName}>
                  {ch.pid === 0 ? '📁' : '  └'} {ch.channel_name}
                </div>
                {channelClients.length > 0 && (
                  <span style={styles.channelCount}>{channelClients.length}</span>
                )}
              </div>
            )
          })}
        </div>

        <div style={styles.main}>
          {selectedChannel ? (
            <>
              <h2 style={styles.mainTitle}>
                📢 Canal: {channels.find(c => c.cid === selectedChannel)?.channel_name || '???'}
              </h2>
              {clients.filter(c => c.cid === selectedChannel).map(cl => (
                <div key={cl.clid} style={styles.userCard}>
                  <span style={{
                    ...styles.userStatus,
                    background: cl.client_is_talking ? '#22c55e' : '#6b7280',
                  }} />
                  <span style={styles.userName}>{cl.client_nickname}</span>
                  {cl.client_input_muted && <span style={styles.badge}>🔇 Mudo</span>}
                  {cl.client_output_muted && <span style={styles.badge}>🔕 Surdo</span>}
                  {cl.client_is_talking && <span style={styles.talkingBadge}>🗣️ Falando</span>}
                </div>
              ))}
              {clients.filter(c => c.cid === selectedChannel).length === 0 && (
                <p style={styles.empty}>Nenhum cliente neste canal</p>
              )}
            </>
          ) : (
            <div style={styles.placeholder}>
              <div style={styles.placeholderIcon}>👆</div>
              <p style={styles.placeholderText}>Selecione um canal para ver os usuários</p>
            </div>
          )}
        </div>
      </div>

      <div style={styles.statusBar}>
        <span>🟢 Conectado ao TS6</span>
        <span>Canais: {channels.length}</span>
        <span>Clientes: {clients.length}</span>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  loginContainer: {
    minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif',
  },
  loginBox: {
    background: '#1e293b', borderRadius: 16, padding: 40, width: 380,
    boxShadow: '0 20px 60px rgba(0,0,0,0.5)', textAlign: 'center',
  },
  logo: { fontSize: 48, marginBottom: 8 },
  title: { color: '#e2e8f0', fontSize: 24, margin: '8px 0' },
  subtitle: { color: '#94a3b8', fontSize: 14, marginBottom: 24 },
  error: { background: '#7f1d1d', color: '#fca5a5', padding: 10, borderRadius: 8, marginBottom: 16, fontSize: 13 },
  input: {
    width: '100%', padding: 12, borderRadius: 8, border: '1px solid #334155',
    background: '#0f172a', color: '#e2e8f0', fontSize: 14, marginBottom: 12, boxSizing: 'border-box',
  },
  button: {
    width: '100%', padding: 12, borderRadius: 8, border: 'none',
    background: '#3b82f6', color: 'white', fontSize: 16, fontWeight: 600,
    cursor: 'pointer', marginBottom: 12,
  },
  hint: { color: '#64748b', fontSize: 12 },
  mainContainer: { minHeight: '100vh', display: 'flex', flexDirection: 'column', background: '#0f172a', fontFamily: 'system-ui, -apple-system, sans-serif' },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 20px', background: '#1e293b', borderBottom: '1px solid #334155' },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 10 },
  headerLogo: { fontSize: 24 },
  headerTitle: { color: '#e2e8f0', fontSize: 18, fontWeight: 700 },
  headerRight: { display: 'flex', alignItems: 'center', gap: 12 },
  headerUser: { color: '#94a3b8', fontSize: 14 },
  logoutBtn: { background: '#dc2626', color: 'white', border: 'none', borderRadius: 6, padding: '6px 14px', cursor: 'pointer', fontSize: 13 },
  content: { display: 'flex', flex: 1, overflow: 'hidden' },
  sidebar: { width: 260, background: '#1e293b', borderRight: '1px solid #334155', overflowY: 'auto', padding: 16 },
  sidebarTitle: { color: '#e2e8f0', fontSize: 14, margin: '0 0 12px 0', fontWeight: 600 },
  channelItem: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: 8, cursor: 'pointer', marginBottom: 4, transition: 'background 0.15s' },
  channelName: { color: '#e2e8f0', fontSize: 14 },
  channelCount: { background: '#334155', color: '#94a3b8', fontSize: 12, padding: '2px 8px', borderRadius: 10 },
  main: { flex: 1, padding: 24, overflowY: 'auto' },
  mainTitle: { color: '#e2e8f0', fontSize: 18, margin: '0 0 20px 0' },
  userCard: { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: '#1e293b', borderRadius: 10, marginBottom: 8, border: '1px solid #334155' },
  userStatus: { width: 10, height: 10, borderRadius: '50%' },
  userName: { color: '#e2e8f0', fontSize: 15, flex: 1 },
  badge: { background: '#7f1d1d', color: '#fca5a5', padding: '2px 8px', borderRadius: 6, fontSize: 12 },
  talkingBadge: { background: '#14532d', color: '#86efac', padding: '2px 8px', borderRadius: 6, fontSize: 12 },
  empty: { color: '#64748b', fontSize: 14, fontStyle: 'italic' },
  placeholder: { display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#64748b' },
  placeholderIcon: { fontSize: 64, marginBottom: 16 },
  placeholderText: { fontSize: 16 },
  statusBar: { display: 'flex', gap: 20, padding: '8px 20px', background: '#1e293b', borderTop: '1px solid #334155', color: '#94a3b8', fontSize: 12 },
}

export default App
