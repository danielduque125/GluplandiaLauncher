import { useEffect, useState } from 'react';
import './App.css';
const api = window.gluplandia;
export default function App() {
  const [data, setData] = useState(null), [profile, setProfile] = useState(null), [name, setName] = useState('');
  const [busy, setBusy] = useState(false), [running, setRunning] = useState(false), [error, setError] = useState('');
  const [event, setEvent] = useState({message:'Preparando tu próxima aventura.'}), [logs, setLogs] = useState([]);
  const [content, setContent] = useState({news:[]}), [status, setStatus] = useState(null), [updateReady, setUpdateReady] = useState(false);
  const [memoryGB, setMemoryGB] = useState(4), [optionalIds, setOptionalIds] = useState([]), [tab,setTab] = useState('aventura');
  useEffect(() => {
    if (!api) { setError('Abre esta interfaz desde la aplicación Electron.'); return; }
    let active=true;
    const unsubscribe=api.onEvent(e=>{
      if(e.phase==='game-exit')setRunning(false);
      if(e.phase==='game-started')setRunning(true);
      if(e.phase==='update-ready')setUpdateReady(true);
      if(e.phase==='game-log')setLogs(prev=>[...prev,e.message].slice(-80));
      else if(e.phase!=='idle')setEvent(e);
    });
    api.initial().then(d=>{if(!active)return;setData(d);setProfile(d.profile);setName(d.profile?.name||'');setMemoryGB(d.settings.memoryGB);setOptionalIds(d.settings.optionalIds);if(d.packError)setError(d.packError);}).catch(e=>setError(e.message));
    api.content().then(c=>{if(active)setContent(c);}).catch(()=>{});
    const poll=()=>api.status().then(s=>{if(active)setStatus(s);}).catch(()=>{if(active)setStatus({online:false});});
    poll();const timer=setInterval(poll,60000);
    return ()=>{active=false;unsubscribe();clearInterval(timer);};
  },[]);
  async function action(fn) {setBusy(true);setError('');try{return await fn();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function save() { await api.preferences({memoryGB,optionalIds}); }
  const disabled=busy||running;
  return <div className="shell">
    <aside className="sidebar">
      <img className="brand" src="./branding/logo.png" alt="Gluplandia Dungeons"/>
      <div className="edition">JAVA EDITION · WINDOWS</div>
      <nav aria-label="Secciones"><button className={tab==='aventura'?'selected':''} onClick={()=>setTab('aventura')}>◈ Aventura</button><button className={tab==='equipo'?'selected':''} onClick={()=>setTab('equipo')}>◇ Mi equipo</button><button className={tab==='registro'?'selected':''} onClick={()=>setTab('registro')}>≡ Registro</button></nav>
      <div className="server-card"><span className={`dot ${status?.online?'online':''}`}/><strong>{status===null?'Consultando servidor':status.online?'El portal está abierto':'Estado no disponible'}</strong><p>{data?.server||'play.gluplandia.com'}</p>{status?.online&&<small>{status.players} / {status.maxPlayers} aventureros</small>}</div>
      <button className="site-button" onClick={()=>action(()=>api.website())}>Visitar Gluplandia ↗</button>
      <small className="credits">Gluplandia Dungeons · 1.0.0<br/>Basado en OpenLauncher · GPL-2.0</small>
    </aside>
    <main>
      <header><span>BIENVENIDO A GLUPLANDIA</span><span className="version-pill">Minecraft 26.2 · Fabric {data?.pack?.fabricVersion||'administrado'}</span></header>
      {tab==='aventura'&&<>
        <section className="hero" style={content.bannerUrl?{backgroundImage:`linear-gradient(90deg,rgba(9,13,20,.92),rgba(9,13,20,.15)),url("${content.bannerUrl}")`}:undefined}>
          <div className="embers" aria-hidden="true"/>
          <div className="hero-copy"><span className="eyebrow">TU GRUPO. TU HISTORIA.</span><h1>La oscuridad<br/>guarda <em>secretos.</em></h1><p>Reúne a tus compañeros y cruza el umbral de Gluplandia. Tu próxima aventura comienza aquí.</p><div className="pack-label">◈ Modpack {data?.pack?.version||'pendiente de configurar'}</div></div>
        </section>
        <section className="launch-panel">
          <div className="account"><h2>{profile?`Hola, ${profile.name}`:'Elige tu forma de acceso'}</h2>{profile?<><p>{profile.mode==='microsoft'?'Cuenta Microsoft conectada':'Perfil local por nombre de usuario'}</p><button className="text-button" disabled={disabled} onClick={()=>action(async()=>{await api.logout();setProfile(null);})}>Cambiar cuenta</button></>:<><button
  className="microsoft"
  disabled
  title="Disponible próximamente"
  aria-label="Entrar con Microsoft, próximamente"
>
  ▦ Entrar con Microsoft · Próximamente
</button><form onSubmit={e=>{e.preventDefault();action(async()=>{setProfile(await api.offline(name));setEvent({message:'Perfil local guardado.'});});}}><label htmlFor="name">Acceso local</label><div className="name-row"><input id="name" value={name} onChange={e=>setName(e.target.value)} placeholder="Nombre de jugador" maxLength={16} pattern="[A-Za-z0-9_]{3,16}" required disabled={disabled}/><button disabled={disabled||!data}>Usar nombre</button></div></form></>}
          <small>El acceso local requiere un servidor compatible. No autentica una cuenta Microsoft ni permite entrar en servidores con online-mode=true.</small></div>
          <div className="launch-actions"><button className="play" disabled={disabled||!profile} onClick={()=>action(async()=>{await save();await api.play();setRunning(true);})}>{running?'EN LA AVENTURA':busy?'PREPARANDO…':'JUGAR A GLUPLANDIA'}<span>↗</span></button><p>El juego y el modpack se verifican antes de entrar.</p><button className="text-button" disabled={disabled} onClick={()=>action(async()=>{await save();const r=await api.repair();setEvent({message:`Instalación verificada. ${r.files} archivos del modpack.`});})}>↻ Reparar instalación</button></div>
        </section>
        <section className="news"><h2>Desde el otro lado del portal</h2><div className="news-grid">{content.news.map((n,i)=><article key={i}><span>GLUPLANDIA · NOVEDADES</span><h3>{n.title}</h3><p>{n.body}</p></article>)}</div></section>
      </>}
      {tab==='equipo'&&<section className="settings"><span className="eyebrow">PREPARA LA EXPEDICIÓN</span><h1>Mi equipo</h1><p>Una sola instancia administrada para Gluplandia.</p><label htmlFor="memory">Memoria asignada en GB</label><input id="memory" type="number" min="2" max="16" value={memoryGB} disabled={disabled} onChange={e=>setMemoryGB(Number(e.target.value))}/><h2>Contenido opcional</h2>{data?.pack?.files.filter(f=>!f.required).map(f=><label className="check" key={f.id}><input type="checkbox" checked={optionalIds.includes(f.id)} disabled={disabled} onChange={e=>setOptionalIds(e.target.checked?[...optionalIds,f.id]:optionalIds.filter(id=>id!==f.id))}/>{f.name}</label>)}{!data?.pack?.files.some(f=>!f.required)&&<p>No hay contenido opcional publicado.</p>}<button disabled={disabled} onClick={()=>action(async()=>{await save();setEvent({message:'Preferencias guardadas.'});})}>Guardar preferencias</button><h2>Archivos personales</h2><p>Los mods personales se guardan en user-mods. Sus dependencias deben ser compatibles con el pack. Una copia antigua de un mod puede impedir el arranque.</p><div className="folder-buttons"><button onClick={()=>action(()=>api.folder('root'))}>Abrir instancia</button>{data?.allowUserMods&&<button onClick={()=>action(()=>api.folder('user-mods'))}>Abrir mods personales</button>}<button onClick={()=>action(()=>api.folder('backups'))}>Ver copias de seguridad</button></div><code>{data?.root}</code><h2>Actualizaciones del launcher</h2><button disabled={busy} onClick={()=>action(async()=>{const r=await api.update();if(!r.enabled)setEvent({message:'Actualización automática disponible en la edición NSIS de distribución firmada.'});})}>Comprobar actualización</button></section>}
      {tab==='registro'&&<section className="settings"><h1>Registro del juego</h1><p>Este registro se limita a la sesión actual.</p><pre>{logs.join('\n')||'Minecraft todavía no ha generado mensajes.'}</pre></section>}
      <footer aria-live="polite"><div>{event.phase==='auth-code'&&<strong className="device-code">{event.code}</strong>}<span>{event.message||`Descargando ${event.file||''}`}</span>{event.total>0&&event.received!==undefined&&<progress value={event.received} max={event.total}/>}</div>{busy&&<button onClick={()=>api.cancel()}>Cancelar</button>}{updateReady&&<button disabled={disabled} onClick={()=>action(()=>api.restart())}>Reiniciar y actualizar</button>}</footer>
      {error&&<div className="error" role="alert">{error}</div>}
    </main>
  </div>;
}
