import { useAuth } from './hooks/useAuth';
import { useServerData } from './hooks/useServerData';
import { Login } from './components/Login';
import { ServerStatus } from './components/ServerStatus';
import { PlayerList } from './components/PlayerList';
import { SessionTimer } from './components/SessionTimer';
import { Terminal } from './components/Terminal';

export function App() {
  const auth = useAuth();
  const { status, players, info, loading, error, serverState, startupStep, startServer, stopServer } = useServerData(auth.authenticated);
  if (!auth.authenticated) {
    return <Login passwordSet={auth.passwordSet} onSetup={auth.setup} onLogin={auth.login} loading={auth.loading} />;
  }
  const playUrl = '/play/?' + new URLSearchParams([
    ['ip', `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/play/ws`],
    ['version', '1.21.4'], ['username', 'Player'],
    ['setting', 'frameLimit:60'],
    ['setting', 'rendererWorldPerformance:"low-energy"'],
    ['setting', 'packetsRecordingAutoStart:false'],
    ['setting', 'displayRecordButton:false'],
  ]).toString();
  return (
    <main style={{ minHeight: '100vh', background: '#102018', color: '#edf5ed', fontFamily: 'system-ui, sans-serif', padding: '24px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <h1>Your Minecraft world</h1>
        <p>Paper 1.21.4 · private browser play · saved to R2 every 15 minutes.</p>
        <p>Opening this page does not start your world. It saves and stops after five minutes without players.</p>
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', margin: '24px 0' }}>
          {serverState === 'stopped' && <button onClick={startServer} disabled={loading}>Start world</button>}
          {serverState === 'running' && status?.online && <a href={playUrl} style={{ color: '#b9e5a2', fontSize: '24px' }}>Play in this tab</a>}
          {serverState === 'running' && <button onClick={stopServer} disabled={loading}>Save and stop</button>}
          <button onClick={auth.logout}>Log out</button>
        </div>
        {error && <p role="alert" style={{ color: '#ffb5a9' }}>{error}</p>}
        <ServerStatus status={status} info={info} serverState={serverState} startupStep={startupStep} />
        <PlayerList players={players} />
        <SessionTimer serverState={serverState} />
        <Terminal serverState={serverState} />
      </div>
    </main>
  );
}
