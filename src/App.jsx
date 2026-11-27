import { useState, useCallback, useEffect, Fragment } from "react";
import { loadTable, saveTable, subscribeTable } from "./supabase.js";

// ─── iOS zoom fix ─────────────────────────────────────────────────────────────
if (typeof document !== "undefined") {
  let m = document.querySelector('meta[name="viewport"]');
  if (!m) { m = document.createElement("meta"); m.name = "viewport"; document.head.appendChild(m); }
  m.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const genId = (pedidos=[]) => {
  const nums = pedidos.map(p=>parseInt(p.id||0)).filter(n=>!isNaN(n));
  return nums.length>0 ? String(Math.max(...nums)+1) : "1001";
};
const todayStr  = () => new Date().toISOString().split("T")[0];
const DIAS      = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MESES     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const dayOf     = d => DIAS[new Date(d+"T12:00:00").getDay()];
const monthOf   = d => MESES[new Date(d+"T12:00:00").getMonth()];
const weekOf    = d => { const dt=new Date(d+"T12:00:00"),jan4=new Date(dt.getFullYear(),0,4),s=new Date(jan4); s.setDate(jan4.getDate()-(jan4.getDay()||7)+1); return Math.floor((dt-s)/(7*86400000))+1; };
const fmt       = n => Number(n||0).toLocaleString("es-MX",{style:"currency",currency:"MXN"});
const fmtDate   = d => { if(!d) return ""; const [y,mo,dy]=d.split("-"); return `${dy}/${mo}/${y.slice(2)}`; };
const daysDiff  = d => { if(!d) return 0; const diff=new Date()-new Date(d+"T12:00:00"); return Math.max(0,Math.floor(diff/86400000)); };

// Normaliza nombres de clientes para agrupar variantes
const normCliente = c => {
  if(!c) return c;
  const s = c.trim();
  if(/^la hortaliza$/i.test(s) || /^hortaliza$/i.test(s)) return "Hortaliza";
  if(/^panader[ií]a$/i.test(s) || /^tortas temoaya$/i.test(s)) return "TORTAS TEMOAYA";
  return s;
};

// ─── Guardado confiable ─────────────────────────────────────────
// Sin esto, si falla la señal el cambio se pierde en silencio: la pantalla lo
// muestra guardado y al recargar ya no está. Aquí cada guardado se reintenta,
// se respalda en el teléfono y se avisa arriba cuántos van sin confirmar.
const RESP = t => `saji_pend_${t}`;
const edo = new Map();      // tabla -> {ultimo, seq, okSeq, enVuelo, error}
const oyentes = new Set();
const estadoGuardado = () => {
  let pend = 0, error = "";
  edo.forEach(st => { if (st.okSeq < st.seq) { pend++; if (st.error) error = st.error; } });
  return { pend, error };
};
const avisar = () => { const e = estadoGuardado(); oyentes.forEach(f => f(e)); };

const bombear = async tabla => {
  const st = edo.get(tabla);
  if (!st || st.enVuelo || st.okSeq >= st.seq) return;
  st.enVuelo = true;
  const seq = st.seq, data = st.ultimo;
  let ok = false, err = "";
  try {
    const r = await saveTable(tabla, data);
    ok = !(r && r.ok === false);
    if (!ok) err = r.error || "No se pudo guardar";
  } catch (e) { err = String(e?.message || e); }
  st.enVuelo = false;
  if (ok) {
    st.okSeq = Math.max(st.okSeq, seq); st.error = "";
    if (st.okSeq >= st.seq) { try { localStorage.removeItem(RESP(tabla)); } catch {} }
  } else {
    st.error = err;
  }
  avisar();
  if (ok && st.okSeq < st.seq) bombear(tabla);   // llegó algo nuevo mientras guardaba
};

const encolar = (tabla, data) => {
  const st = edo.get(tabla) || { seq: 0, okSeq: 0, enVuelo: false, error: "" };
  st.seq++; st.ultimo = data; edo.set(tabla, st);
  try { localStorage.setItem(RESP(tabla), JSON.stringify({ data, ts: Date.now() })); } catch {}
  avisar();
  bombear(tabla);
};

// Reintento automático: al recuperar señal y cada 8 segundos
if (typeof window !== "undefined" && !window.__sajiReintento) {
  window.__sajiReintento = true;
  const reintentar = () => edo.forEach((st, t) => { if (st.okSeq < st.seq) bombear(t); });
  window.addEventListener("online", reintentar);
  setInterval(reintentar, 8000);
  window.addEventListener("beforeunload", e => {
    if (estadoGuardado().pend > 0) { e.preventDefault(); e.returnValue = ""; }
  });
}

const useEstadoGuardado = () => {
  const [e, setE] = useState({ pend: 0, error: "" });
  useEffect(() => { oyentes.add(setE); setE(estadoGuardado()); return () => { oyentes.delete(setE); }; }, []);
  return e;
};

// ─── useSupabase — reemplaza usePersist con sync en tiempo real ───────────────
const useSupabase = (tabla, init) => {
  const [val, setVal] = useState(init);
  const [loaded, setLoaded] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    loadTable(tabla).then(data => {
      // Lo que el servidor manda no debe pisar cambios locales sin confirmar
      const st = edo.get(tabla);
      if (st && st.okSeq < st.seq) { setLoaded(true); return bombear(tabla); }
      if (data) setVal(data);
      setLoaded(true);
    });
  }, [tabla]);

  // Escuchar cambios en tiempo real (cuando tu socio modifica algo)
  useEffect(() => {
    const sub = subscribeTable(tabla, (newData) => {
      const st = edo.get(tabla);
      if (st && st.okSeq < st.seq) return;   // tengo cambios míos sin guardar
      setVal(newData);
    });
    return () => sub.unsubscribe();
  }, [tabla]);

  // Guardar en Supabase cada vez que cambia el valor
  const set = useCallback(v => {
    setVal(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      encolar(tabla, next);
      return next;
    });
  }, [tabla]);

  return [val, set, loaded];
};

// usePersist queda como fallback local (usado solo en ImportModal internamente)
const usePersist = (key, init) => {
  const [val, setS] = useState(() => { try { const s=localStorage.getItem(key); return s?JSON.parse(s):init; } catch { return init; }});
  const set = useCallback(v => setS(prev => { const n=typeof v==="function"?v(prev):v; try{localStorage.setItem(key,JSON.stringify(n));}catch{} return n; }),[key]);
  return [val, set];
};

const exportCSV = (rows, cols, fn) => {
  const h = cols.map(c=>c.l).join(",");
  const b = rows.map(r=>cols.map(c=>`"${String(r[c.k]||"").replace(/"/g,"'")}"`).join(",")).join("\n");
  const a = document.createElement("a"); a.href=URL.createObjectURL(new Blob(["\uFEFF"+h+"\n"+b],{type:"text/csv;charset=utf-8;"})); a.download=fn; a.click();
};

// ─── Theme — PREMIUM LIGHT ────────────────────────────────────────────────────
const C = {
  bg:"#f4f6f3", card:"#ffffff", border:"#e7ebe5",
  green:"#16a34a", greenL:"#f0fdf4", greenM:"#bbf7d0",
  text:"#14201a", muted:"#6b7a71", mutedL:"#9aa89f",
  red:"#dc2626", redL:"#fef2f2",
  amber:"#d97706", amberL:"#fffbeb",
  blue:"#2563eb", blueL:"#eff6ff",
  purple:"#7c3aed", purpleL:"#f5f3ff",
  teal:"#0891b2", tealL:"#ecfeff",
  indigo:"#15803d", indigoL:"#e8f6ed",
  shadow:"0 1px 2px rgba(20,32,26,.04), 0 1px 3px rgba(20,32,26,.04)",
  shadowMd:"0 6px 18px rgba(20,32,26,.07)",
  shadowLg:"0 16px 40px rgba(20,32,26,.12)",
};

// ─── Style helpers ────────────────────────────────────────────────────────────
const card  = { background:C.card, border:`1px solid ${C.border}`, borderRadius:18, padding:"22px", marginBottom:16, boxShadow:C.shadow };
const h2s   = { margin:"0 0 18px", fontSize:20, fontWeight:700, color:C.text, letterSpacing:"-0.4px" };
const g2    = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 };
const g3    = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 };
const lbl   = { display:"block", marginBottom:5, fontSize:11, color:C.muted, fontWeight:600, textTransform:"uppercase", letterSpacing:"0.5px" };
const inp   = { width:"100%", background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"10px 13px", color:C.text, fontSize:14, boxSizing:"border-box", outline:"none", WebkitAppearance:"none", transition:"border-color .15s", fontFamily:"inherit" };
const sel   = { width:"100%", background:"#fff", border:`1.5px solid ${C.border}`, borderRadius:12, padding:"10px 13px", color:C.text, fontSize:14, boxSizing:"border-box", outline:"none", WebkitAppearance:"none", cursor:"pointer", fontFamily:"inherit", transition:"border-color .15s" };
const btn   = (bg=C.indigo) => ({ background:bg, color:"#fff", border:"none", borderRadius:12, padding:"10px 18px", cursor:"pointer", fontWeight:600, fontSize:13, whiteSpace:"nowrap", transition:"all .18s", fontFamily:"inherit", boxShadow:"0 1px 2px rgba(20,32,26,.12)" });
const btnO  = (c) => ({ background:"transparent", color:c||C.muted, border:`1.5px solid ${c||C.border}`, borderRadius:12, padding:"10px 18px", cursor:"pointer", fontWeight:600, fontSize:13, fontFamily:"inherit", transition:"all .18s" });
const modal = { position:"fixed", inset:0, background:"rgba(20,32,26,.35)", backdropFilter:"blur(6px)", animation:"sajiFade .18s ease", zIndex:200, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:16, overflowY:"auto" };
const mbox  = { background:C.card, border:`1px solid ${C.border}`, borderRadius:24, padding:28, width:"100%", maxWidth:700, marginTop:20, marginBottom:20, boxShadow:C.shadowLg };
const th    = { textAlign:"left", padding:"10px 14px", color:C.mutedL, fontWeight:600, fontSize:11, textTransform:"uppercase", letterSpacing:"0.6px", borderBottom:`1px solid ${C.border}`, background:"transparent", whiteSpace:"nowrap" };
const td    = { padding:"10px 14px", borderBottom:`1px solid #f0f2ee`, verticalAlign:"middle", fontSize:13, color:C.text };
const badge = (c, bg) => ({ background:bg||(c+"15"), color:c, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:600, display:"inline-flex", alignItems:"center", gap:4, whiteSpace:"nowrap" });
const totRow= { background:C.greenL, borderRadius:12, padding:"12px 16px", display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12, border:`1px solid ${C.greenM}` };
const nb    = a => ({ background:a?C.indigo:"#fff", color:a?"#fff":C.muted, border:a?"none":`1px solid ${C.border}`, borderRadius:999, padding:"6px 14px", cursor:"pointer", fontWeight:a?600:500, fontSize:12, transition:"all .15s", whiteSpace:"nowrap", fontFamily:"inherit" });

// ─── Logo ─────────────────────────────────────────────────────────────────────
const SAJILogo = ({ s=36 }) => (
  <img src="/saji-logo.png" width={s} height={s} alt="SAJI"
    style={{objectFit:"contain",borderRadius:4,display:"block",flexShrink:0}}
    onError={e=>{
      e.target.style.display="none";
      const span=document.createElement("div");
      span.style.cssText=`width:${s}px;height:${s}px;background:linear-gradient(135deg,#2d6a4f,#52b788);border-radius:8px;display:flex;align-items:center;justify-content:center;font-weight:800;color:#fff;font-size:${s*.35}px;flex-shrink:0;`;
      span.textContent="SG";
      e.target.parentNode.insertBefore(span,e.target);
    }}/>
);


// ─── Icons (estilo Lucide, SVG inline) ────────────────────────────────────────
const ICONS = {
  home:"M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  box:"M21 8 12 3 3 8m18 0-9 5m9-5v8l-9 5m0-8L3 8m9 5v8M3 8v8l9 5",
  leaf:"M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10zM2 21c0-3 1.9-5.4 5.4-6.6",
  circle:"M12 21a8 8 0 1 0 0-16 8 8 0 0 0 0 16zM12 5V3",
  sun:"M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2m0 18v2M4.2 4.2l1.4 1.4m12.8 12.8 1.4 1.4M1 12h2m18 0h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4",
  wallet:"M20 7H5a2 2 0 0 1 0-4h13v4zm0 0v13H5a2 2 0 0 1-2-2V5m14 8h.01",
  truck:"M1 3h15v13H1zM16 8h4l3 3v5h-7zM5.5 21a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zm13 0a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z",
  layers:"m12 2 10 5-10 5L2 7zM2 17l10 5 10-5M2 12l10 5 10-5",
  book:"M4 19.5A2.5 2.5 0 0 1 6.5 17H20V2H6.5A2.5 2.5 0 0 0 4 4.5zM20 17v5H6.5A2.5 2.5 0 0 1 4 19.5",
  list:"M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  down:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  up:"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  out:"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9",
};
const Icon = ({ n, s=16, c="currentColor" }) => (
  <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" style={{flexShrink:0}}><path d={ICONS[n]}/></svg>
);

const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box}
body{margin:0;background:#f4f6f3;color:#14201a;font-family:'Inter','Segoe UI',system-ui,sans-serif;font-size:14px;-webkit-font-smoothing:antialiased;-webkit-text-size-adjust:100%}
@keyframes sajiFade{from{opacity:0}to{opacity:1}}
@keyframes sajiUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
@keyframes sajiSlide{from{opacity:0;transform:translateX(24px)}to{opacity:1;transform:none}}

/* Estructura */
.saji-app{display:grid;grid-template-columns:230px 1fr;min-height:100vh}
.saji-aside{background:#fff;border-right:1px solid #e7ebe5;padding:16px 12px;position:sticky;top:0;height:100vh;display:flex;flex-direction:column}
.saji-brand{display:flex;gap:10px;align-items:center;padding:4px 8px 16px;cursor:pointer}
.saji-nav{flex:1;overflow-y:auto;scrollbar-width:none}
.saji-nav::-webkit-scrollbar{display:none}
.saji-group{margin:14px 12px 6px;font-size:10px;letter-spacing:.9px;color:#9aa89f;text-transform:uppercase;font-weight:600}
.saji-link{display:flex;align-items:center;gap:10px;width:100%;padding:9px 12px;border:0;background:transparent;border-radius:11px;color:#6b7a71;font:500 13.5px inherit;font-family:inherit;cursor:pointer;margin-bottom:2px;text-align:left;transition:all .18s ease}
.saji-link:hover{background:#f1f5ef;color:#14201a}
.saji-link.on{background:#e8f6ed;color:#15803d;font-weight:600}
.saji-asidefoot{padding-top:10px;border-top:1px solid #e7ebe5}
.saji-body{min-width:0;display:flex;flex-direction:column}
.saji-top{display:flex;align-items:center;gap:10px;padding:10px 24px;background:rgba(255,255,255,.85);backdrop-filter:blur(12px);border-bottom:1px solid #e7ebe5;position:sticky;top:0;z-index:50}
.saji-brand-sm{display:none;align-items:center;gap:8px}
.saji-main{padding:24px;max-width:1240px;width:100%;animation:sajiUp .22s ease}

/* Piezas */
.saji-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px}
.saji-kpis2{grid-template-columns:repeat(2,1fr);max-width:720px}
.saji-cols{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start}
.saji-row{display:grid;grid-template-columns:70px 1.5fr 1.2fr 1.1fr 120px 16px;gap:12px;align-items:center;padding:12px 6px;border-bottom:1px solid #f0f2ee;cursor:pointer;transition:background .15s ease}
.saji-row:last-child{border-bottom:0}
.saji-row:hover{background:#f7faf6}
.saji-only-sm{display:none}
.saji-cards{display:none}
.saji-chips{display:flex;gap:6px;flex-wrap:wrap}
.saji-drawer{background:#fff;border-radius:22px;padding:26px;width:100%;max-width:620px;margin:auto;box-shadow:0 16px 40px rgba(20,32,26,.18);animation:sajiSlide .2s ease}

/* Formularios y tablas heredadas */
button{transition:transform .15s ease,box-shadow .18s ease,background .18s ease,border-color .18s ease}
button:active{transform:scale(.97)}
input:focus,select:focus,textarea:focus{border-color:#15803d!important;box-shadow:0 0 0 3px rgba(21,128,61,.12)}
table{border-collapse:separate;border-spacing:0}
tbody tr{transition:background .15s ease}
tbody tr:hover{background:#f7faf6}

/* Tablet */
@media(max-width:1000px){
  .saji-kpis{grid-template-columns:1fr 1fr}
  .saji-cols{grid-template-columns:1fr}
}
/* Celular */
@media(max-width:760px){
  .saji-app{grid-template-columns:1fr}
  .saji-aside{position:fixed;left:0;right:0;bottom:0;top:auto;height:auto;width:100%;z-index:60;flex-direction:row;padding:6px;border-right:0;border-top:1px solid #e7ebe5;box-shadow:0 -6px 20px rgba(20,32,26,.08)}
  .saji-brand,.saji-group,.saji-asidefoot{display:none}
  .saji-nav{display:flex;gap:4px;overflow-x:auto;width:100%}
  .saji-link{flex-direction:column;gap:3px;min-width:68px;padding:7px 6px;font-size:10.5px;justify-content:center;text-align:center;margin:0}
  .saji-brand-sm{display:flex}
  .saji-top{padding:8px 14px}
  .saji-main{padding:16px 14px 96px}
  .saji-hide-sm{display:none!important}
  .saji-row{grid-template-columns:62px 1fr auto 14px;gap:8px}
  .saji-only-sm{display:block}
  .saji-tabla-sm{display:none!important}
  .saji-cards{display:block}
  .saji-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;padding-bottom:2px}
  .saji-chips::-webkit-scrollbar{display:none}
  .saji-chips>button{flex:0 0 auto}
  .saji-kpis,.saji-kpis2{grid-template-columns:1fr 1fr!important;gap:8px}
  .saji-main h2{font-size:16.5px!important;line-height:1.25}
  .saji-minikpis{display:grid!important;grid-template-columns:repeat(3,1fr);gap:6px!important}
  .saji-minikpis>div{min-width:0!important;padding:7px 4px!important}
  .saji-minikpis span:first-child{font-size:8.5px!important}
  .saji-minikpis span:last-child{font-size:13px!important}
  .saji-acciones{width:100%;flex-wrap:wrap}
  .saji-acciones>button{flex:1 1 calc(50% - 4px);font-size:12px!important;padding:9px 8px!important;justify-content:center}
  .saji-filtros select{flex:1 1 calc(50% - 4px)!important;min-width:0}
  .saji-filtros input{flex:1 1 100%!important}
  .saji-drawer{border-radius:20px;padding:20px;margin-top:10px}
}
`;

const pEmoji = n => ({"Aguacate":"🥑","Cebolla":"🧅","Mango":"🥭","Limón":"🍋","Tomate":"🍅","Chile":"🌶️"}[n]||"📦");

// ─── Gastos catálogo ──────────────────────────────────────────────────────────
const TIPOS_GASTO = {
  "Alquiler Inmuebles":    ["Renta Casa","Cámara frío"],
  "Energías":              ["Luz Casa","Luz Trifásica"],
  "Servicios Contratados": ["Internet","Agua","Cámaras","GPS Caddy","GPS Duty"],
  "Gastos de Viaje":       ["Gasolina Caddy","Gasolina Duty","Caseta","Tag"],
  "Gastos de Personal":    ["Nómina José","Nómina Irving","Nómina Jasso","Nómina Daniel","Nómina Héctor"],
  "Otros Gastos":          ["Comida","Super","Servicio Caddy","Servicio Duty","Propina","Mantenimiento Cámara","Ferretería","Refaccionaria","Caja","Otras compras"],
  "Créditos":              ["Santander"],
  "Crédito Automotriz":    ["Caddy","Super Duty"],
  "Préstamos":             ["Conan","David","Coco"],
  "Impuestos":             ["ISR","IVA"],
};
// Estas categorías NO son gasto del negocio: son pago de deuda. Se registran
// aquí porque sale dinero, pero no restan en la utilidad (salvo los intereses).
const TIPOS_DEUDA = ["Créditos","Crédito Automotriz","Préstamos"];
const esDeuda = t => TIPOS_DEUDA.includes(t);

const sinAcentos = s => String(s||"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().trim();
const CATALOGO_GASTOS = Object.entries(TIPOS_GASTO).flatMap(([tipo,xs])=>xs.map(gasto=>({gasto,tipo})));
const METODOS_PAGO = ["Efectivo","Tarjeta Jasso","Tarjeta Irving","Tarjeta SAJI","Transferencia SAJI","Transferencia Jasso"];


// ─── Clientes: pueden ser texto plano o un objeto con datos fiscales ─────────
const cliNom  = c => typeof c === "string" ? c : (c?.nombre || "");
const cliFisc = (clientes, nombre) => {
  const c = (clientes||[]).find(x => cliNom(x) === nombre);
  return (c && typeof c === "object") ? c : { nombre };
};

// Un mismo contribuyente puede tener varias sucursales: se facturan juntas
const grupoDe = (clientes, nombre) => {
  const c = (clientes||[]).find(x => cliNom(x) === nombre);
  return (c && typeof c === "object" && c.grupo && c.grupo.trim()) ? c.grupo.trim() : nombre;
};
// Datos fiscales del grupo: el primer valor no vacío entre sus miembros
const fiscalGrupo = (clientes, grupo) => {
  const miembros = (clientes||[]).filter(c => typeof c === "object" && grupoDe(clientes, cliNom(c)) === grupo);
  const out = { nombre:grupo };
  ["razonSocial","rfc","cp","regimen","usoCFDI","formaPago"].forEach(k=>{
    const v = miembros.map(m=>m[k]).find(x=>x && String(x).trim());
    if(v) out[k] = v;
  });
  return out;
};

// ─── Claves del SAT por producto (se pueden cambiar en Catálogos) ────────────
const CLAVES_SAT = {
  "aguacate":        { clave:"50401736", desc:"Aguacate Hass" },
  "cebolla":         { clave:"50405300", desc:"Cebolla Blanca" },
  "limón":           { clave:"50304100", desc:"Limones" },
  "limon":           { clave:"50304100", desc:"Limones" },
  "limón persa":     { clave:"50304100", desc:"Limones" },
  "jugo de limón":   { clave:"50202404", desc:"Jugo de limón" },
  "jugo de limon":   { clave:"50202404", desc:"Jugo de limón" },
  "jugo de naranja": { clave:"50202409", desc:"Jugo de naranja" },
};
const satDe = (productos, nombre) => {
  const p = (productos||[]).find(x => x.nombre === nombre);
  if (p?.claveSAT) return { clave:p.claveSAT, desc:p.descSAT || nombre };
  const d = CLAVES_SAT[String(nombre||"").toLowerCase().trim()];
  return d || { clave:"", desc:nombre||"" };
};

// ─── Unidad de medida por producto ───────────────────────────────────────────
// Los jugos se venden por litro; todo lo demás por kilogramo.
const PROD_LITROS = /jugo/i;
const uni  = p => PROD_LITROS.test(String(p||"")) ? "L"  : "kg";   // minúscula
const uniU = p => PROD_LITROS.test(String(p||"")) ? "L"  : "KG";   // etiqueta
const esLitro = p => PROD_LITROS.test(String(p||""));

// ─── Helpers de ventas ────────────────────────────────────────────────────────
const num      = v => { const n=parseFloat(v); return isNaN(n)?0:n; };
const esPend   = v => String(v.estatus||v.estatusPago||"").toLowerCase().trim()!=="pagado";
const diasPend = v => esPend(v) ? daysDiff(v.fecha) : 0;

// ─── Piezas de UI ─────────────────────────────────────────────────────────────
const h3s = { margin:"0 0 14px", fontSize:15, fontWeight:700, color:C.text };
const secTit = { fontSize:11, fontWeight:700, color:C.mutedL, textTransform:"uppercase",
                 letterSpacing:"0.7px", marginBottom:10, paddingBottom:6, borderBottom:`1px solid ${C.border}` };

const PageHead = ({ titulo, sub, extra }) => (
  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-end",gap:12,flexWrap:"wrap",marginBottom:18}}>
    <div>
      <h1 style={{margin:0,fontSize:24,fontWeight:800,letterSpacing:"-0.6px"}}>{titulo}</h1>
      {sub&&<div style={{color:C.muted,fontSize:13,marginTop:3}}>{sub}</div>}
    </div>
    {extra&&<div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{extra}</div>}
  </div>
);

const Kpi = ({ label, value, sub, hi, color }) => (
  <div style={{
    background: hi?C.indigo:C.card, border: hi?"none":`1px solid ${C.border}`,
    borderRadius:18, padding:"16px 18px", boxShadow:C.shadow,
  }}>
    <div style={{fontSize:12,color:hi?"#d6f2e0":C.muted,fontWeight:500}}>{label}</div>
    <div style={{fontSize:24,fontWeight:800,letterSpacing:"-0.6px",marginTop:4,color:hi?"#fff":(color||C.text)}}>{value}</div>
    {sub&&<div style={{fontSize:11,color:hi?"#bfe5cc":C.mutedL,marginTop:2}}>{sub}</div>}
  </div>
);

const Linea = ({ l, v, tot }) => (
  <div style={{display:"flex",justifyContent:"space-between",padding:"10px 0",borderBottom:tot?"none":"1px dashed "+C.border,
    fontWeight:tot?800:500, color:tot?C.indigo:C.text, fontSize:tot?16:14}}>
    <span style={{color:tot?C.indigo:C.muted,fontWeight:tot?800:500}}>{l}</span><span>{v}</span>
  </div>
);

// ─── Filter Bar ───────────────────────────────────────────────────────────────
function FilterBar({ filter, setFilter, count, nombre }) {
  return (
    <div style={{background:C.card,borderRadius:10,padding:"10px 14px",marginBottom:12,border:`1px solid ${C.border}`,boxShadow:C.shadow}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:C.muted,fontSize:12,fontWeight:700}}>📅 Ver por:</span>
        {[{k:"todo",l:"Todo"},{k:"hoy",l:"Hoy"},{k:"semana",l:"Semana"},{k:"mes",l:"Mes"},{k:"fecha",l:"📆 Fecha"}].map(f=>(
          <button key={f.k} style={nb(filter.tipo===f.k)} onClick={()=>setFilter({tipo:f.k,valor:""})}>{f.l}</button>
        ))}
        {count!=null&&<span style={{color:C.muted,fontSize:12,marginLeft:"auto"}}>{count} {nombre||"registro"}{count!==1?"s":""}</span>}
      </div>
      {filter.tipo==="semana"&&(
        <div style={{marginTop:8}}>
          <input type="number" style={{...inp,width:200,padding:"7px 10px",fontSize:14}}
            placeholder={`Semana # (actual: ${weekOf(todayStr())})`} min="1" max="53"
            value={filter.valor} onChange={e=>setFilter(f=>({...f,valor:e.target.value}))}/>
        </div>
      )}
      {filter.tipo==="mes"&&(
        <div style={{marginTop:8}}>
          <select style={{...sel,width:200,padding:"7px 10px",fontSize:14}} value={filter.valor} onChange={e=>setFilter(f=>({...f,valor:e.target.value}))}>
            <option value="">— Seleccionar mes —</option>
            {MESES.map((m,i)=><option key={m} value={String(i+1)}>{m}</option>)}
          </select>
        </div>
      )}
      {filter.tipo==="fecha"&&(
        <div style={{marginTop:8}}>
          <input type="date" style={{...inp,width:200,padding:"7px 10px",fontSize:14}}
            value={filter.valor} onChange={e=>setFilter(f=>({...f,valor:e.target.value}))}/>
        </div>
      )}
    </div>
  );
}

function applyFilter(rows, filter, dateKey="fecha") {
  if(filter.tipo==="todo") return rows;
  const t = todayStr();
  if(filter.tipo==="hoy") return rows.filter(r=>r[dateKey]===t);
  if(filter.tipo==="fecha") return filter.valor ? rows.filter(r=>r[dateKey]===filter.valor) : rows;
  if(filter.tipo==="semana") {
    const w = filter.valor ? parseInt(filter.valor) : weekOf(t);
    return rows.filter(r=>{
      // Recalcular siempre desde la fecha para evitar datos stale
      const sem = r[dateKey] ? weekOf(r[dateKey]) : (r.semana ? parseInt(r.semana) : null);
      return sem===w;
    });
  }
  if(filter.tipo==="mes") {
    const mo = filter.valor ? parseInt(filter.valor) : (new Date().getMonth()+1);
    return rows.filter(r=>r[dateKey]&&new Date(r[dateKey]+"T12:00:00").getMonth()+1===mo);
  }
  if(filter.tipo==="rango") {
    const desde=filter.desde||"", hasta=filter.hasta||"";
    return rows.filter(r=>{
      if(!r[dateKey]) return false;
      if(desde && r[dateKey] < desde) return false;
      if(hasta && r[dateKey] > hasta) return false;
      return true;
    });
  }
  return rows;
}

// ════════════════════════════════════════════════════════════════════════════════
// INICIO
// ════════════════════════════════════════════════════════════════════════════════
function Dashboard({ pedidos, ventas, gastos, fruta, compras, onVerVenta }) {
  // Arranca en la semana corriente, igual que Ventas
  const [f, setF] = useState({tipo:"semana",valor:"",desde:"",hasta:""});
  const [cliSel, setCliSel] = useState("");   // cliente abierto en ¿Quién me debe?

  const vF  = applyFilter(ventas, f);
  const gF  = applyFilter(gastos.filter(g=>!esReembolso(g)), f);
  const frF = applyFilter(fruta,  f);
  const pendPedidos = pedidos.filter(p=>p.estatus==="pendiente").length;

  const totalVentas = vF.reduce((s,v)=>s+num(v.total),0);
  const totalKg     = vF.filter(v=>!esLitro(v.producto)).reduce((s,v)=>s+num(v.kg),0);
  const totalLt     = vF.filter(v=> esLitro(v.producto)).reduce((s,v)=>s+num(v.kg),0);
  const nf1         = n => n.toLocaleString("es-MX",{maximumFractionDigits:1});
  const esImp       = g => ["isr","iva"].includes(String(g.gasto||"").toLowerCase().trim());
  const pagoDeuda   = g => esDeuda(g.tipoGasto);
  const totalDeuda  = gF.filter(pagoDeuda).reduce((s,g)=>s+num(g.monto),0);
  const gastosOp    = gF.filter(g=>!esImp(g) && !pagoDeuda(g)).reduce((s,g)=>s+num(g.monto),0);
  const totalISR    = gF.filter(g=>String(g.gasto||"").toLowerCase().trim()==="isr").reduce((s,g)=>s+num(g.monto),0);
  const totalIVA    = gF.filter(g=>String(g.gasto||"").toLowerCase().trim()==="iva").reduce((s,g)=>s+num(g.monto),0);
  const totalGastos = gF.filter(g=>!pagoDeuda(g)).reduce((s,g)=>s+num(g.monto),0);
  // Costo de ventas = lo que costó la mercancía que SALIÓ, no lo que se compró
  const costoFrutaV = vF.reduce((s,v)=>s+num(v.kg)*costoPromedio(compras,v.producto,v.fecha),0);
  // Envases, etiquetas y demás empaque: también es costo de ventas. No se puede
  // repartir por producto todavía, así que entra completo el del período.
  const costoInsumos= frF.filter(esInsumo).reduce((s,c)=>s+costoMercancia(c),0);
  const costoVentas = costoFrutaV + costoInsumos;
  const sinCosteo   = [...new Set(vF.filter(v=>!costoPromedio(compras,v.producto,v.fecha)).map(v=>v.producto))];
  const comprasPer  = frF.reduce((s,x)=>s+num(x.total),0);   // desembolso del período
  const costoFruta  = costoVentas;
  const totalFruta  = costoFruta;
  const uBruta      = totalVentas - costoFruta;
  const uOperat     = uBruta - gastosOp;
  const utilidad    = uOperat - totalISR - totalIVA;   // utilidad neta
  const pct         = v => totalVentas ? `${(v/totalVentas*100).toFixed(1)}%` : "0%";
  const filas = [
    { concepto:"Ventas totales",          monto:totalVentas, c:C.green, bold:true  },
    { concepto:"(–) Costo de ventas (fruta)", monto:costoFrutaV, c:C.muted, bold:false },
    ...(costoInsumos>0 ? [{ concepto:"(–) Insumos y empaque", monto:costoInsumos, c:C.muted, bold:false }] : []),
    { concepto:"= Utilidad bruta",        monto:uBruta,      c:uBruta>=0?C.amber:C.red,  bold:true  },
    { concepto:"(–) Gastos operativos",   monto:gastosOp,    c:C.muted, bold:false },
    { concepto:"= Utilidad operativa",    monto:uOperat,     c:uOperat>=0?C.teal:C.red,  bold:true  },
    { concepto:"(–) ISR",                 monto:totalISR,    c:C.muted, bold:false },
    { concepto:"(–) IVA",                 monto:totalIVA,    c:C.muted, bold:false },
    { concepto:"= Utilidad neta",         monto:utilidad,    c:utilidad>=0?C.green:C.red, bold:true },
    ...(totalDeuda>0 ? [{ concepto:"Pagos de deuda (no es gasto)", monto:totalDeuda, c:C.purple, bold:false }] : []),
  ];

  // Por cobrar: siempre acumulado (no depende del período)
  const pend = ventas.filter(v=>esPend(v));
  const porCobrar = pend.reduce((s,v)=>s+num(v.total),0);
  const deuda = {};
  pend.forEach(v=>{
    const c = normCliente(v.cliente)||"—";
    if(!deuda[c]) deuda[c]={cli:c,monto:0,n:0,dias:0,peds:new Set()};
    deuda[c].monto += num(v.total); deuda[c].peds.add(String(v.pedido||"").trim());
    deuda[c].n = deuda[c].peds.size;
    deuda[c].dias = Math.max(deuda[c].dias, diasPend(v));
  });
  const listaDeuda = Object.values(deuda).sort((a,b)=>b.monto-a.monto);

  // Ventas por producto en el período
  const porProd = {};
  vF.forEach(v=>{ const p=v.producto||"—"; porProd[p]=(porProd[p]||0)+num(v.total); });
  const prods = Object.entries(porProd).sort((a,b)=>b[1]-a[1]);
  const maxProd = prods.length ? prods[0][1] : 1;

  return (
    <div>
      <PageHead titulo="Inicio" sub="Resumen general del negocio"/>
      <FilterBar filter={f} setFilter={setF} count={vF.length}/>

      <div className="saji-kpis" style={{marginBottom:16}}>
        <Kpi hi label="Ventas" value={fmt(totalVentas)} sub={totalLt>0?`${nf1(totalKg)} kg · ${nf1(totalLt)} L`:`${nf1(totalKg)} kg`}/>
        <Kpi label="Por cobrar" value={fmt(porCobrar)} color={porCobrar>0?C.red:C.green}/>
        <Kpi label="Gastos" value={fmt(totalGastos)} sub={`Comprado ${fmt(comprasPer)}`}/>
      </div>

      <div className="saji-cols">
        <div style={card}>
          <h3 style={h3s}>Estado de Resultados</h3>
          {sinCosteo.length>0&&(
            <div style={{background:C.amberL,border:`1px solid ${C.amber}44`,borderRadius:10,padding:"9px 12px",fontSize:12,color:C.amber,marginBottom:12}}>
              Sin costo registrado: {sinCosteo.join(", ")}. Captura sus compras en Proveedor para que el margen sea real.
            </div>
          )}
          <table style={{width:"100%",borderCollapse:"separate",borderSpacing:0,fontSize:13.5}}>
            <thead><tr>
              <th style={{...th,textAlign:"left"}}>Concepto</th>
              <th style={{...th,textAlign:"right"}}>Monto</th>
              <th style={{...th,textAlign:"right",width:78}}>% ventas</th>
            </tr></thead>
            <tbody>
              {filas.map((r,i)=>(
                <tr key={i} style={{background:r.bold?"#fafbfa":"transparent"}}>
                  <td style={{...td,fontWeight:r.bold?700:500,color:r.bold?r.c:C.text,paddingLeft:r.bold?14:24}}>{r.concepto}</td>
                  <td style={{...td,textAlign:"right",fontWeight:r.bold?700:500,color:r.bold?r.c:C.text}}>{fmt(r.monto)}</td>
                  <td style={{...td,textAlign:"right",color:C.muted,fontSize:12}}>{pct(r.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {prods.length>0&&(
            <div style={{marginTop:18}}>
              <h3 style={{...h3s,marginBottom:10}}>Ventas por producto</h3>
              {prods.map(([p,v])=>(
                <div key={p} style={{marginBottom:9}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:13,marginBottom:4}}>
                    <span style={{fontWeight:600}}>{p}</span><span style={{color:C.muted}}>{fmt(v)}</span>
                  </div>
                  <div style={{height:6,background:"#eef2ec",borderRadius:99}}>
                    <div style={{height:"100%",width:`${Math.max(3,v/maxProd*100)}%`,background:C.indigo,borderRadius:99,transition:"width .3s"}}/>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <div style={{...card,marginBottom:14}}>
            <h3 style={h3s}>¿Quién me debe?</h3>
            {listaDeuda.length===0
              ? <p style={{color:C.green,fontSize:13,textAlign:"center",padding:"18px 0",fontWeight:600,margin:0}}>Todo al corriente</p>
              : <>
                  {listaDeuda.map(d=>(
                    <div key={d.cli} onClick={()=>setCliSel(cliSel===d.cli?"":d.cli)}
                      style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 8px",
                        borderBottom:"1px solid #f0f2ee",cursor:"pointer",borderRadius:8,
                        background:cliSel===d.cli?C.indigoL:"transparent"}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:14}}>{d.cli}</div>
                        <div style={{fontSize:11,color:C.muted}}>{d.n} venta{d.n>1?"s":""} · {d.dias} día{d.dias===1?"":"s"}</div>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:8}}>
                        <strong style={{color:C.red,fontSize:15}}>{fmt(d.monto)}</strong>
                        <span style={{color:C.mutedL,fontSize:13}}>{cliSel===d.cli?"▾":"›"}</span>
                      </div>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:12,padding:"10px 14px",background:C.redL,borderRadius:12}}>
                    <strong style={{color:C.red,fontSize:12,letterSpacing:".4px"}}>TOTAL</strong>
                    <strong style={{color:C.red,fontSize:16}}>{fmt(porCobrar)}</strong>
                  </div>
                </>}
          </div>
          {cliSel&&(()=>{
            // Ventas sin pagar del cliente elegido, agrupadas por remisión
            const rem = {};
            pend.filter(v=>normCliente(v.cliente)===cliSel).forEach(v=>{
              const k = String(v.pedido||"").trim() || "(sin remisión)";
              if(!rem[k]) rem[k] = { rem:k, fecha:v.fecha, total:0, items:[], dias:0, primera:v };
              rem[k].total += num(v.total); rem[k].items.push(v);
              rem[k].dias = Math.max(rem[k].dias, diasPend(v));
              if((v.fecha||"") < (rem[k].fecha||"")) rem[k].fecha = v.fecha;
            });
            const lista = Object.values(rem).sort((a,b)=>b.dias-a.dias);
            return (
              <div style={{...card,marginBottom:14,border:`1.5px solid ${C.indigo}33`}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                  <h3 style={{...h3s,margin:0}}>Lo que debe {cliSel}</h3>
                  <button onClick={()=>setCliSel("")} style={{background:"none",border:"none",fontSize:20,color:C.muted,cursor:"pointer",lineHeight:1}}>×</button>
                </div>
                <div style={{fontSize:11,color:C.muted,marginBottom:10}}>Toca una venta para abrir su detalle</div>
                {lista.map(r=>(
                  <div key={r.rem} onClick={()=>onVerVenta&&onVerVenta(r.primera)}
                    style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,
                      padding:"10px 8px",borderBottom:"1px solid #f0f2ee",cursor:"pointer",borderRadius:8}}>
                    <div style={{minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:13.5,color:C.indigo}}>{r.rem}</div>
                      <div style={{fontSize:11,color:C.muted,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                        {fmtDate(r.fecha)} · {r.items.map(i=>i.producto).join(", ")}
                      </div>
                    </div>
                    <div style={{textAlign:"right",flexShrink:0}}>
                      <div style={{fontWeight:700,fontSize:14}}>{fmt(r.total)}</div>
                      <div style={{fontSize:11,color:r.dias>15?C.red:C.amber}}>{r.dias} día{r.dias===1?"":"s"}</div>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}

          <div style={card}>
            <h3 style={h3s}>Pendientes</h3>
            <Linea l="Pedidos por entregar" v={String(pendPedidos)}/>
            <Linea l="Ventas por cobrar" v={String(new Set(pend.map(v=>`${String(v.pedido||"").trim()}|${normCliente(v.cliente)}`)).size)}/>
          </div>
        </div>
      </div>
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════════════════
// PEDIDOS
// ════════════════════════════════════════════════════════════════════════════════
const emptyItem = () => ({ producto:"", calibre:"", cantidad:"", precio:"" });

// Si un guardado no llega al servidor hay que verlo, no enterarse al recargar
function AvisoGuardado() {
  const { pend, error } = useEstadoGuardado();
  const [red, setRed] = useState(typeof navigator==="undefined" ? true : navigator.onLine);
  useEffect(()=>{
    const on=()=>setRed(true), off=()=>setRed(false);
    window.addEventListener("online",on); window.addEventListener("offline",off);
    return ()=>{ window.removeEventListener("online",on); window.removeEventListener("offline",off); };
  },[]);
  if(pend===0 && red) return null;
  const sinRed = !red;
  return (
    <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",
      padding:"10px 18px",background:sinRed?"#fff7ed":C.amberL,
      borderBottom:`1px solid ${C.amber}55`,fontSize:13,color:"#92400e"}}>
      <strong>{sinRed ? "Sin conexión" : "Guardando…"}</strong>
      <span>
        {pend>0
          ? `${pend} cambio${pend===1?"":"s"} sin confirmar en el servidor. No cierres la app; se reintenta solo.`
          : "No hay internet. Lo que captures se guarda en el teléfono y sube al volver la señal."}
      </span>
      {error&&<span style={{color:C.muted,fontSize:11}}>({error})</span>}
    </div>
  );
}

function Pedidos({ pedidos, setPedidos, ventas, setVentas, setPagos, pagos, clientes, productos, logBit, rol }) {
  const esOperativo = rol==="operativo";
  const [show,         setShow]        = useState(false);
  const [filter,       setFilter]      = useState("pendiente");
  const [verTodos,     setVerTodos]    = useState(false);
  const [form,         setForm]        = useState({ cliente:"", fechaEntrega:"", tipoPago:"efectivo", factura:"no", items:[emptyItem()] });
  const [editId,       setEditId]      = useState(null); // pedido que se está editando
  const [ticket,       setTicket]      = useState(null); // ticket listo para imprimir
  const [completando,  setCompletando] = useState(null); // pedido en proceso de completar
  const [kgsReales,    setKgsReales]   = useState([]);   // cantidades reales por item
  const [fechaEntregaReal, setFechaEntregaReal] = useState("");
  const [remisionReal,     setRemisionReal]     = useState("");
  const [tipoPagoReal,     setTipoPagoReal]     = useState("Efectivo");

  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const setItem = (i,k,v) => setForm(f=>{
    const it=[...f.items]; it[i]={...it[i],[k]:v};
    if(k==="producto"){ const p=productos.find(x=>x.nombre===v); it[i].calibre=p?.calibres[0]||""; }
    return {...f,items:it};
  });
  const addItem = () => setForm(f=>({...f,items:[...f.items,emptyItem()]}));
  const delItem = i  => setForm(f=>({...f,items:f.items.filter((_,idx)=>idx!==i)}));
  const totalForm = form.items.reduce((s,it)=>s+(parseFloat(it.cantidad||0)*parseFloat(it.precio||0)),0);
  const getCals   = nombre => productos.find(p=>p.nombre===nombre)?.calibres||[];

  const limpiar = () => {
    setForm({ cliente:"", fechaEntrega:"", tipoPago:"efectivo", factura:"no", items:[emptyItem()] });
    setEditId(null); setShow(false);
  };
  const abrirNuevo  = () => { setEditId(null); setForm({ cliente:"", fechaEntrega:"", tipoPago:"efectivo", factura:"no", items:[emptyItem()] }); setShow(true); };
  const abrirEditar = p  => {
    setEditId(p.id);
    setForm({
      cliente: p.cliente||"", fechaEntrega: p.fechaEntrega||"",
      tipoPago: p.tipoPago||"efectivo", factura: p.factura||"no",
      items: (p.items||[]).length ? (p.items||[]).map(it=>({...it, cantidad:String(it.cantidad??""), precio:String(it.precio??"")})) : [emptyItem()],
    });
    setShow(true);
  };

  const guardar = () => {
    if(!form.cliente||!form.fechaEntrega) return alert("Completa cliente y fecha de entrega");
    if(form.items.some(it=>!it.producto||!it.cantidad||!it.precio)) return alert("Completa todos los productos");
    if(editId!==null){
      setPedidos(ps=>ps.map(p=>p.id===editId?{...p,...form,total:totalForm}:p));
      logBit("Editó pedido",`#${editId} · ${form.cliente} · ${form.items.length} producto${form.items.length===1?"":"s"} · ${fmt(totalForm)}`);
    } else {
      const np={id:genId(pedidos),fecha:todayStr(),...form,total:totalForm,estatus:"pendiente"};
      setPedidos(ps=>[np,...ps]);
      logBit("Nuevo pedido",`#${np.id} · ${form.cliente} · ${fmt(totalForm)}`);
    }
    limpiar();
  };
  const cancelar  = id => { if(!window.confirm("¿Cancelar este pedido?")) return; setPedidos(ps=>ps.map(p=>p.id===id?{...p,estatus:"cancelado"}:p)); logBit("Canceló pedido",`#${id}`); };
  const abrirCompletar = id => {
    const p=pedidos.find(x=>x.id===id); if(!p) return;
    setKgsReales((p.items||[]).map(it=>String(it.cantidad)));
    setFechaEntregaReal(p.fechaEntrega||todayStr());
    setRemisionReal("");
    setTipoPagoReal(p.tipoPago||"Efectivo");
    setCompletando(p);
  };
  const confirmarCompletar = () => {
    const p=completando; if(!p) return;
    if(!remisionReal.trim()) return alert("Debes ingresar el número de remisión para completar el pedido.");
    const fechaVenta = fechaEntregaReal || p.fechaEntrega || todayStr();
    const items = (p.items||[]).map((it,i)=>({...it, cantidad: parseFloat(kgsReales[i]||it.cantidad)||parseFloat(it.cantidad) }));
    const totalReal = items.reduce((s,it)=>s+(it.cantidad*parseFloat(it.precio)),0);
    const tipoPago  = (tipoPagoReal||p.tipoPago||"Efectivo");
    const esEfectivo = String(tipoPago).toLowerCase()==="efectivo";
    // Cada producto del pedido se convierte en un renglón de Venta
    const nuevasVentas = items.map((it,i)=>({
      id:`${Date.now()}-${i}`,
      pedido: remisionReal.trim(),            // Pedido = número de remisión
      sem: weekOf(fechaVenta), dia: dayOf(fechaVenta), mes: monthOf(fechaVenta),
      fecha: fechaVenta,                      // Fecha = fecha real de entrega
      cliente: p.cliente, producto: it.producto,
      kg: it.cantidad, precio: parseFloat(it.precio),
      total: Math.round(it.cantidad*parseFloat(it.precio)*100)/100,
      tipoPago: esEfectivo ? "Efectivo" : "Transferencia",
      estatus: "Pendiente",
      factura: esEfectivo ? "NA" : "Pedir",   // nace como "Pedir"; efectivo no aplica
      fpago: "",
      pedidoId: p.id,
    }));
    setVentas(vs=>[...nuevasVentas,...vs]);
    setPedidos(ps=>ps.map(x=>x.id===p.id?{...x,estatus:"completado",totalReal,fechaEntrega:fechaVenta}:x));
    logBit("Completó pedido",`#${p.id} · ${p.cliente} · ${fmt(totalReal)}`);
    setCompletando(null);
    setTicket({ folio:remisionReal.trim(), fecha:fechaVenta, cliente:p.cliente, items,
                total:totalReal, tipoPago:esEfectivo?"Efectivo":"Transferencia", estatus:"Pendiente" });
  };

  const lista = pedidos.filter(p=>filter==="todo" ? true : (p.estatus||"pendiente")===filter)
    .slice().sort((a,b)=>(b.fecha||b.fechaEntrega||'').localeCompare(a.fecha||a.fechaEntrega||''));
  const cuenta = e => pedidos.filter(p=>(p.estatus||"pendiente")===e).length;

  // Un pedido completado SIEMPRE debe tener su venta. Si la conexión falla a
  // medias se guarda el pedido pero no la venta, y el pedido queda invisible.
  // Las ventas viejas se importaron de Excel y no traen pedidoId, así que
  // también se busca por cliente y fecha, y solo se revisan los últimos 15 días.
  const fechaPed = p => p.fechaEntrega || p.fecha || "";
  const tieneVenta = p => (ventas||[]).some(v=>
       String(v.pedidoId||"")===String(p.id)
    || (normCliente(v.cliente)===normCliente(p.cliente) && (v.fecha||"")===fechaPed(p)));
  const desdeAviso = (()=>{ const d=new Date(); d.setDate(d.getDate()-15); return d.toISOString().slice(0,10); })();
  const pendAviso = pedidos.filter(p=>p.estatus==="completado"
    && fechaPed(p) >= desdeAviso && !tieneVenta(p));
  const sinVenta = pendAviso.filter(p=>!p.ventaOk)
    .sort((a,b)=>fechaPed(b).localeCompare(fechaPed(a)));
  const ocultos  = pendAviso.filter(p=>p.ventaOk);
  // Quitar del aviso sin borrar el pedido: su venta ya existía o no hubo entrega
  const omitir = p => {
    if(!window.confirm(`Quitar del aviso el pedido #${p.id} de ${p.cliente}?\n\nEl pedido no se borra, solo deja de aparecer aquí. Házlo si esa venta ya existe o si no hubo entrega.`)) return;
    setPedidos(ps=>ps.map(x=>x.id===p.id?{...x,ventaOk:true}:x));
    logBit("Quitó aviso de venta",`#${p.id} · ${p.cliente}`);
  };
  const restaurarAvisos = () => setPedidos(ps=>ps.map(x=>x.ventaOk?{...x,ventaOk:false}:x));
  const regenerar = p => {
    const rem = window.prompt(
      `Número de remisión del pedido #${p.id} — ${p.cliente}:`, p.remision||"");
    if(rem===null) return;
    if(!String(rem).trim()) return alert("Necesitas el número de remisión.");
    const fechaVenta = p.fechaEntrega || p.fecha || todayStr();
    const items = p.items||[];
    const esEfectivo = String(p.tipoPago||"").toLowerCase()==="efectivo";
    const nv = items.map((it,i)=>({
      id:`${Date.now()}-${i}`, pedido:String(rem).trim(),
      sem:weekOf(fechaVenta), dia:dayOf(fechaVenta), mes:monthOf(fechaVenta),
      fecha:fechaVenta, cliente:p.cliente, producto:it.producto,
      kg:parseFloat(it.cantidad)||0, precio:parseFloat(it.precio)||0,
      total:Math.round((parseFloat(it.cantidad)||0)*(parseFloat(it.precio)||0)*100)/100,
      tipoPago: esEfectivo?"Efectivo":"Transferencia", estatus:"Pendiente",
      factura: esEfectivo?"NA":"Pedir", fpago:"", pedidoId:p.id,
    }));
    setVentas(vs=>[...nv,...vs]);
    logBit("Regeneró venta",`#${p.id} · ${p.cliente} · remisión ${String(rem).trim()}`);
  };

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <h2 style={{...h2s,margin:0}}>📦 Pedidos</h2>
        <button style={btn()} onClick={abrirNuevo}>+ Nuevo Pedido</button>
      </div>

      <div className="saji-chips" style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:12}}>
        {[["pendiente","Pendientes"],["completado","Completados"],["cancelado","Cancelados"],["todo","Todos"]].map(([k,t])=>(
          <button key={k} style={nb(filter===k)} onClick={()=>setFilter(k)}>
            {t} {k==="todo" ? pedidos.length : cuenta(k)}
          </button>
        ))}
      </div>

      {(sinVenta.length>0||ocultos.length>0)&&(
        <div style={{background:C.amberL,border:`1px solid ${C.amber}66`,borderRadius:14,padding:"12px 14px",marginBottom:12}}>
          {sinVenta.length>0 ? (<>
            <div style={{fontWeight:700,fontSize:13.5,color:C.amber}}>
              {sinVenta.length} pedido{sinVenta.length===1?"":"s"} de los últimos 15 días sin venta registrada
            </div>
            <div style={{fontSize:11.5,color:C.muted,margin:"3px 0 8px"}}>
              Se guardó el pedido pero la venta no. Revísala antes de generarla, para no duplicar.
              La × lo quita del aviso sin borrar el pedido.
            </div>
          </>) : (
            <div style={{fontSize:12,color:C.muted}}>Todos los pedidos de los últimos 15 días tienen su venta.</div>
          )}
          {sinVenta.slice(0, verTodos?999:5).map(p=>(
            <div key={p.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,
              padding:"7px 0",borderTop:`1px solid ${C.amber}2b`}}>
              <div style={{fontSize:12.5,minWidth:0,lineHeight:1.35}}>
                <strong>{p.cliente}</strong>
                <div style={{color:C.muted,fontSize:11}}>
                  {fmtDate(fechaPed(p))} · {(p.items||[]).length} prod · {fmt(p.totalReal||p.total)} · #{p.id}
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:4}}>
                <button style={{...btn(C.amber),padding:"7px 12px",fontSize:12,whiteSpace:"nowrap"}}
                  onClick={()=>regenerar(p)}>Generar</button>
                <button title="Quitar del aviso" onClick={()=>omitir(p)}
                  style={{background:"none",border:"none",color:C.muted,fontSize:20,lineHeight:1,
                    padding:"2px 6px",cursor:"pointer"}}>×</button>
              </div>
            </div>
          ))}
          {sinVenta.length>5&&(
            <button style={{...btnO(C.amber),marginTop:8,width:"100%",fontSize:12,padding:"7px 10px"}}
              onClick={()=>setVerTodos(v=>!v)}>
              {verTodos ? "Ver menos" : `Ver los ${sinVenta.length}`}
            </button>
          )}
          {ocultos.length>0&&(
            <button onClick={restaurarAvisos} style={{background:"none",border:"none",color:C.muted,
              fontSize:11,padding:"8px 0 0",cursor:"pointer",textDecoration:"underline"}}>
              Mostrar {ocultos.length} que quitaste
            </button>
          )}
        </div>
      )}

      <div style={card}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",minWidth:600}}>
            <colgroup>
              <col style={{width:100}}/>{/* Cliente */}
              <col style={{width:90}}/>{/* Producto */}
              <col style={{width:60}}/>{/* Calibre */}
              <col style={{width:55}}/>{/* KG */}
              <col style={{width:65}}/>{/* $/kg */}
              <col style={{width:75}}/>{/* Subtotal */}
              <col style={{width:72}}/>{/* F.Entrega */}
              <col style={{width:40}}/>{/* Factura */}
              <col style={{width:80}}/>{/* Pago */}
              <col style={{width:60}}/>{/* #Pedido */}
              <col style={{width:90}}/>{/* Acciones */}
            </colgroup>
            <thead>
              <tr>{["Cliente","Producto","Calibre","Cant.","$/unidad","Subtotal","F.Entrega","Fact.","Pago","#Ped",""].map(h=>(
                <th key={h} style={{...th,padding:"7px 6px",fontSize:10}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {lista.length===0&&<tr><td colSpan={11} style={{...td,textAlign:"center",color:C.muted,padding:28}}>Sin pedidos pendientes</td></tr>}
              {lista.map(p=>{
                const items=p.items||[];
                return items.map((it,idx)=>(
                  <tr key={`${p.id}-${idx}`} style={{background:idx%2===0?"#fff":"#f9fcfa"}}>
                    {idx===0&&<td style={{...td,fontWeight:700,fontSize:12,padding:"7px 6px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} rowSpan={items.length}>{p.cliente}</td>}
                    <td style={{...td,fontWeight:600,fontSize:12,padding:"7px 6px"}}>{pEmoji(it.producto)} {it.producto}</td>
                    <td style={{...td,padding:"7px 6px"}}><span style={{...badge(C.blue,C.blueL),padding:"2px 6px",fontSize:10}}>{it.calibre}</span></td>
                    <td style={{...td,fontWeight:700,fontSize:12,padding:"7px 6px"}}>{it.cantidad} {uni(it.producto)}</td>
                    <td style={{...td,fontSize:12,padding:"7px 6px"}}>{fmt(it.precio)}</td>
                    <td style={{...td,padding:"7px 6px"}}><strong style={{color:C.green,fontSize:12}}>{fmt(parseFloat(it.cantidad||0)*parseFloat(it.precio||0))}</strong></td>
                    {idx===0&&<td style={{...td,fontWeight:600,fontSize:12,padding:"7px 6px"}} rowSpan={items.length}>{fmtDate(p.fechaEntrega)}</td>}
                    {idx===0&&<td style={{...td,padding:"7px 6px"}} rowSpan={items.length}><span style={{...badge(p.factura==="si"?C.green:C.muted),padding:"2px 6px",fontSize:10}}>{p.factura==="si"?"✅":"—"}</span></td>}
                    {idx===0&&<td style={{...td,fontSize:11,padding:"7px 6px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} rowSpan={items.length}>{p.tipoPago}</td>}
                    {idx===0&&<td style={{...td,color:C.muted,fontSize:10,padding:"7px 6px"}} rowSpan={items.length}>#{p.id}</td>}
                    {idx===0&&(
                      <td style={{...td,padding:"7px 6px"}} rowSpan={items.length}>
                        <div style={{display:"flex",flexDirection:"column",gap:3}}>
                          <button style={{...btn(C.green),padding:"4px 8px",fontSize:10}} onClick={()=>abrirCompletar(p.id)}>✓ Completar</button>
                          <button style={{...btnO(C.blue),padding:"4px 8px",fontSize:10}} onClick={()=>abrirEditar(p)}>✎ Editar</button>
                          <button style={{...btn(C.red),padding:"4px 8px",fontSize:10}} onClick={()=>cancelar(p.id)}>✕ Cancelar</button>
                        </div>
                      </td>
                    )}
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal confirmar KG reales */}
      <TicketModal datos={ticket} onClose={()=>setTicket(null)}/>

      {completando&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:480}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.green}}>⚖️ Confirmar cantidades reales</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setCompletando(null)}>×</button>
            </div>
            <div style={{background:C.amberL,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.amber,fontWeight:600,marginBottom:14}}>
              📦 Pedido #{completando.id} · {completando.cliente}<br/>
              <span style={{fontSize:11,fontWeight:400}}>Edita la cantidad si el cliente recibió diferente al pedido original</span>
            </div>
            <div style={{background:C.bg,borderRadius:8,padding:"10px 14px",marginBottom:14,border:`1px solid ${C.border}`}}>
              <label style={lbl}>📅 Fecha real de entrega <span style={{color:C.red}}>*</span></label>
              <input type="date" style={inp} value={fechaEntregaReal} onChange={e=>setFechaEntregaReal(e.target.value)}/>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>Esta fecha se usará en la venta y en todos los indicadores</div>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
              <div style={{background:C.bg,borderRadius:8,padding:"10px 14px",border:`1px solid ${C.border}`}}>
                <label style={lbl}>💳 Tipo de pago</label>
                <select style={sel} value={tipoPagoReal} onChange={e=>setTipoPagoReal(e.target.value)}>
                  {["Efectivo","Transferencia Frasavo","Transferencia SAJI"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{background:C.bg,borderRadius:8,padding:"10px 14px",border:`1px solid ${C.border}`}}>
                <label style={lbl}>📄 Remisión</label>
                <input style={inp} placeholder="Número de remisión" value={remisionReal} onChange={e=>setRemisionReal(e.target.value)}/>
              </div>
            </div>
            {(completando.items||[]).map((it,i)=>(
              <div key={i} style={{background:C.bg,borderRadius:9,padding:"10px 14px",marginBottom:8,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
                  <div style={{flex:"1 1 160px",fontWeight:600,fontSize:13}}>{it.producto} <span style={badge(C.blue,C.blueL)}>{it.calibre}</span></div>
                  <div style={{flex:"0 0 auto"}}>
                    <label style={{...lbl,margin:"0 0 2px"}}>{uniU(it.producto)} pedido: <strong>{it.cantidad}</strong></label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <label style={lbl}>{uniU(it.producto)} real *</label>
                      <input type="number" inputMode="decimal" style={{...inp,width:100,padding:"7px 10px"}}
                        value={kgsReales[i]||""}
                        onChange={e=>setKgsReales(k=>{const n=[...k];n[i]=e.target.value;return n;})}/>
                    </div>
                  </div>
                  <div style={{fontSize:12,color:C.green,fontWeight:700,minWidth:90}}>
                    {fmt((parseFloat(kgsReales[i]||it.cantidad)||0)*parseFloat(it.precio))}
                  </div>
                </div>
              </div>
            ))}
            <div style={{...totRow,marginTop:12}}>
              <span style={{fontWeight:600,color:C.muted}}>Total real</span>
              <span style={{fontSize:20,fontWeight:800,color:C.green}}>
                {fmt((completando.items||[]).reduce((s,it,i)=>s+(parseFloat(kgsReales[i]||it.cantidad)||0)*parseFloat(it.precio),0))}
              </span>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setCompletando(null)}>Cancelar</button>
              <button style={btn(C.green)} onClick={confirmarCompletar}>✅ Confirmar y Completar</button>
            </div>
          </div>
        </div>
      )}



      {show&&(
        <div style={modal}>
          <div style={mbox}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.green,fontSize:16}}>{editId!==null?`✎ Editar Pedido #${editId}`:"📦 Nuevo Pedido"}</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={limpiar}>×</button>
            </div>
            <div style={g2}>
              <div><label style={lbl}>Cliente *</label>
                <select style={sel} value={form.cliente} onChange={e=>sf("cliente",e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {[...new Set([...(clientes||[]).map(cliNom), form.cliente].filter(Boolean))].map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Fecha de entrega *</label>
                <input type="date" style={inp} value={form.fechaEntrega} onChange={e=>sf("fechaEntrega",e.target.value)}/>
              </div>
              <div><label style={lbl}>Requiere factura</label>
                <select style={sel} value={form.factura} onChange={e=>{
                  sf("factura",e.target.value);
                  if(e.target.value==="si") sf("tipoPago","Transferencia SAJI");
                }}>
                  <option value="no">No</option><option value="si">Sí</option>
                </select>
              </div>
              <div><label style={lbl}>Tipo de pago {form.factura==="si"&&<span style={{color:C.amber,fontSize:10}}>(auto: Transferencia)</span>}</label>
                <select style={sel} value={form.tipoPago} onChange={e=>sf("tipoPago",e.target.value)}>
                  {["Efectivo","Transferencia Frasavo","Transferencia SAJI"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
            </div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",margin:"14px 0 8px"}}>
              <span style={{fontWeight:700,fontSize:13}}>🛒 Productos</span>
              <button style={{...btn(C.blue),padding:"6px 12px",fontSize:12}} onClick={addItem}>+ Producto</button>
            </div>
            {form.items.map((it,i)=>(
              <div key={i} style={{background:C.bg,borderRadius:10,padding:12,marginBottom:8,border:`1px solid ${C.border}`}}>
                <div style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"flex-end"}}>
                  <div style={{flex:"1 1 140px"}}><label style={lbl}>Producto</label>
                    <select style={sel} value={it.producto} onChange={e=>setItem(i,"producto",e.target.value)}>
                      <option value="">— Seleccionar —</option>
                      {[...new Set([...productos.map(p=>p.nombre), it.producto].filter(Boolean))].map(n=><option key={n}>{n}</option>)}
                    </select>
                  </div>
                  <div style={{flex:"1 1 100px"}}><label style={lbl}>Calibre</label>
                    <select style={sel} value={it.calibre} onChange={e=>setItem(i,"calibre",e.target.value)} disabled={!it.producto}>
                      {[...new Set([...getCals(it.producto), it.calibre].filter(Boolean))].map(c=><option key={c}>{c}</option>)}
                      {!it.calibre&&<option value="">—</option>}
                    </select>
                  </div>
                  <div style={{flex:"1 1 80px"}}><label style={lbl}>{uniU(it.producto)}</label>
                    <input type="number" inputMode="decimal" style={inp} placeholder="0" value={it.cantidad} onChange={e=>setItem(i,"cantidad",e.target.value)}/>
                  </div>
                  <div style={{flex:"1 1 90px"}}><label style={lbl}>$/{uni(it.producto)}</label>
                    <input type="number" inputMode="decimal" style={inp} placeholder="0.00" value={it.precio} onChange={e=>setItem(i,"precio",e.target.value)}/>
                  </div>
                  <div style={{flex:"0 0 auto",minWidth:72}}>
                    <label style={lbl}>Subtotal</label>
                    <div style={{color:C.green,fontWeight:800,paddingTop:10}}>{fmt(parseFloat(it.cantidad||0)*parseFloat(it.precio||0))}</div>
                  </div>
                  {form.items.length>1&&<button style={{...btn(C.red),padding:"9px 11px",alignSelf:"flex-end"}} onClick={()=>delItem(i)}>✕</button>}
                </div>
              </div>
            ))}
            <div style={totRow}>
              <span style={{fontWeight:600,color:C.muted}}>Total del pedido</span>
              <span style={{fontSize:22,fontWeight:800,color:C.green}}>{fmt(totalForm)}</span>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={limpiar}>Cancelar</button>
              <button style={btn()} onClick={guardar}>💾 {editId!==null?"Guardar cambios":"Guardar Pedido"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════════════
// TICKET DE REMISIÓN (impresión térmica 58 / 80 mm)
// ════════════════════════════════════════════════════════════════════════════════
function TicketModal({ datos, onClose }) {
  const [ancho, setAncho] = useState(() => {
    try { return localStorage.getItem("saji_ancho_ticket") || "80"; } catch { return "80"; }
  });
  const [img, setImg] = useState("");
  const setW = w => { setAncho(w); try{ localStorage.setItem("saji_ancho_ticket",w); }catch{} };

  // Las térmicas imprimen a 8 puntos por milímetro. El área imprimible es de
  // 72 mm en papel de 80 (576 puntos) y 48 mm en papel de 58 (384 puntos).
  // Dibujamos el ticket a ese ancho exacto: así sale del tamaño correcto
  // aunque el navegador quiera imprimir en carta.
  const ANCHO_PX = ancho === "58" ? 384 : 576;

  useEffect(() => {
    if(!datos) return;
    let cancelado = false;
    const dibujar = logo => {
      const W = ANCHO_PX, esc = W/576, M = Math.round(16*esc);
      // n es el tamaño en puntos a 576 de ancho; esc lo ajusta si el papel es de 58
      const px = n => Math.max(8, Math.round(n*esc));
      const F  = n => `${px(n)}px ui-monospace, "Courier New", monospace`;
      const FB = n => `bold ${px(n)}px ui-monospace, "Courier New", monospace`;
      const alto = n => Math.round(px(n)*1.35);
      const cv = document.createElement("canvas");
      cv.width = W; cv.height = 4000;
      const x = cv.getContext("2d");
      x.fillStyle = "#fff"; x.fillRect(0,0,W,4000);
      x.fillStyle = "#000"; x.textBaseline = "top";
      let y = M;

      const linea = () => { y += Math.round(6*esc);
        x.fillStyle="#000"; for(let i=M;i<W-M;i+=Math.round(8*esc)) x.fillRect(i,y,Math.round(4*esc),Math.max(1,Math.round(2*esc)));
        y += Math.round(14*esc); };
      const centro = (t,n2,b2,cx) => { x.font=b2?FB(n2):F(n2); x.textAlign="center"; x.fillText(t,cx||W/2,y); y += alto(n2); x.textAlign="left"; };
      const izq    = (t,n2,b2) => { x.font=b2?FB(n2):F(n2); x.fillText(t,M,y); y += alto(n2); };
      const dos    = (a,c2,n2,b2) => { x.font=b2?FB(n2):F(n2); x.fillText(a,M,y); x.textAlign="right"; x.fillText(c2,W-M,y); x.textAlign="left"; y += alto(n2); };
      const cortar = (t,f,max) => { x.font=f; let s=String(t); while(x.measureText(s).width>max && s.length>3) s=s.slice(0,-1); return s===String(t)?s:s+"…"; };

      // Encabezado: logo a la izquierda, nombre centrado en todo el ancho.
      // El logo va en blanco y negro puro porque las térmicas no imprimen grises.
      const yIni = y;
      let altoLogo = 0, finLogo = M;
      if(logo){
        // Tamaño fijo en puntos (unos 19 mm): por debajo de ~150 el trazo fino
        // del logo se rompe al pasarlo a blanco y negro.
        const lw = Math.min(150, Math.round(W*0.42)), lh = Math.round(lw*logo.height/logo.width);
        const tmp = document.createElement("canvas"); tmp.width=lw; tmp.height=lh;
        const tx = tmp.getContext("2d");
        tx.fillStyle="#fff"; tx.fillRect(0,0,lw,lh);
        tx.drawImage(logo,0,0,lw,lh);
        const d = tx.getImageData(0,0,lw,lh);
        for(let i=0;i<d.data.length;i+=4){
          const g = 0.299*d.data[i] + 0.587*d.data[i+1] + 0.114*d.data[i+2];
          const v = g < 150 ? 0 : 255;                      // umbral: puro negro o puro blanco
          d.data[i]=d.data[i+1]=d.data[i+2]=v; d.data[i+3]=255;
        }
        tx.putImageData(d,0,0);
        x.drawImage(tmp, M, yIni);
        altoLogo = lh; finLogo = M + lw;
      }
      // El texto se centra verticalmente contra el logo
      const altoTexto = alto(30) + alto(17);
      y = yIni + Math.max(0, Math.round((altoLogo-altoTexto)/2));
      // El texto se centra en el espacio que queda a la derecha del logo,
      // así nunca se encima aunque el papel sea angosto.
      const cx = altoLogo ? (finLogo + Math.round(10*esc) + (W-M)) / 2 : W/2;
      centro("SAJI GROUP", 30, true, cx);
      centro("Nota de remisión", 17, false, cx);
      y = yIni + Math.max(altoLogo, altoTexto);
      linea();

      izq(`REMISIÓN: ${datos.folio||"—"}`, 20, true);
      izq(`FECHA: ${fmtDate(datos.fecha)}`, 19);
      x.font = F(19);
      izq(`CLIENTE: ${cortar(datos.cliente, F(19), W-2*M-x.measureText("CLIENTE: ").width)}`, 19);
      linea();

      const nfM = n => num(n).toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2});
      const nfC = n => num(n).toLocaleString("es-MX",{maximumFractionDigits:2});
      (datos.items||[]).forEach(it=>{
        izq(cortar(`${it.producto}${it.calibre?` (${it.calibre})`:""}`, FB(20), W-2*M), 20, true);
        dos(`${nfC(it.cantidad)} ${uni(it.producto)} x $${nfM(it.precio)}`,
            `$${nfM(num(it.cantidad)*num(it.precio))}`, 19);
        y += Math.round(5*esc);
      });
      linea();

      dos("TOTAL", `$${nfM(datos.total)}`, 26, true);
      y += Math.round(6*esc);
      izq(`Pago: ${datos.tipoPago||""}`, 19);
      if(datos.estatus) izq(`Estatus: ${datos.estatus}`, 19);
      linea();

      y += Math.round(40*esc);
      centro("_____________________________", 18);
      centro("Recibí conforme · Nombre y firma", 15);
      y += Math.round(16*esc);
      centro("Este documento no es", 15);
      centro("un comprobante fiscal", 15);
      y += Math.round(6*esc);
      centro("¡Gracias por su compra!", 16);
      y += M;

      // Recortamos el alto sobrante
      const fin = document.createElement("canvas");
      fin.width = W; fin.height = Math.ceil(y);
      const fx = fin.getContext("2d");
      fx.fillStyle="#fff"; fx.fillRect(0,0,W,fin.height);
      fx.drawImage(cv,0,0);
      if(!cancelado) setImg(fin.toDataURL("image/png"));
    };

    const logo = new Image();
    logo.onload  = () => dibujar(logo);
    logo.onerror = () => dibujar(null);
    logo.src = "/saji-logo.png";
    return () => { cancelado = true; };
  }, [datos, ANCHO_PX]);

  if(!datos) return null;

  const mmAncho = ancho === "58" ? 48 : 72;

  const descargar = () => {
    const a = document.createElement("a");
    a.href = img; a.download = `remision-${datos.folio||"ticket"}.png`; a.click();
  };
  const compartir = async () => {
    try{
      const blob = await (await fetch(img)).blob();
      const file = new File([blob], `remision-${datos.folio||"ticket"}.png`, { type:"image/png" });
      if(navigator.canShare && navigator.canShare({ files:[file] })){
        await navigator.share({ files:[file], title:`Remisión ${datos.folio}` });
        return;
      }
    }catch{}
    descargar();
  };

  return (
    <div style={modal} onClick={onClose}>
      <style>{`@page { size: ${ancho}mm auto; margin: 0; }
        @media print {
          html, body { background:#fff!important; margin:0!important; padding:0!important; width:${ancho}mm!important; }
          body * { visibility: hidden !important; }
          #saji-ticket, #saji-ticket * { visibility: visible !important; }
          #saji-ticket { position:absolute!important; left:0; top:0; margin:0!important; padding:0!important;
                         width:${mmAncho}mm!important; box-shadow:none!important; border:none!important; }
          #saji-ticket img { width:${mmAncho}mm!important; height:auto!important; image-rendering:pixelated; }
          .no-print { display:none !important; }
        }`}</style>
      <div style={{...mbox,maxWidth:420,padding:20}} onClick={e=>e.stopPropagation()}>
        <div className="no-print" style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
          <h3 style={{margin:0,fontSize:16}}>Ticket de remisión</h3>
          <button onClick={onClose} style={{background:"none",border:"none",fontSize:26,color:C.muted,cursor:"pointer",lineHeight:1}}>×</button>
        </div>

        <div className="no-print" style={{display:"flex",gap:6,marginBottom:12,alignItems:"center"}}>
          <span style={{fontSize:12,color:C.muted}}>Papel:</span>
          <button style={nb(ancho==="58")} onClick={()=>setW("58")}>58 mm</button>
          <button style={nb(ancho==="80")} onClick={()=>setW("80")}>80 mm</button>
        </div>

        <div id="saji-ticket" style={{textAlign:"center"}}>
          {img
            ? <img src={img} alt="Ticket" style={{width:ancho==="58"?200:260,maxWidth:"100%",border:`1px dashed ${C.border}`,borderRadius:6}}/>
            : <div style={{padding:"40px 0",color:C.muted,fontSize:13}}>Generando ticket…</div>}
        </div>

        <div className="no-print" style={{display:"flex",gap:8,marginTop:16,flexWrap:"wrap"}}>
          <button style={{...btn(C.indigo),flex:1}} disabled={!img} onClick={()=>window.print()}>Imprimir</button>
          <button style={{...btnO(C.green),flex:1}} disabled={!img} onClick={compartir}>Compartir</button>
          <button style={btnO(C.muted)} disabled={!img} onClick={descargar}>Guardar</button>
        </div>
        <div className="no-print" style={{fontSize:11,color:C.muted,marginTop:8,lineHeight:1.5}}>
          El ticket se genera como imagen de {ANCHO_PX} puntos de ancho, la medida exacta del papel de {ancho} mm.
          Si al imprimir sale en hoja carta, usa <strong>Compartir</strong> y mándalo a la app de tu impresora.
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// FACTURACIÓN — arma el mensaje para el contador
// ════════════════════════════════════════════════════════════════════════════════
function Facturacion({ ventas, setVentas, clientes, productos, logBit }) {
  const [cli,   setCli]   = useState("");
  const [sel,   setSel]   = useState({});     // { remision: true }
  const [verPedidas, setVerPedidas] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [aviso,   setAviso]   = useState("");

  const porFacturar = v =>
    String(v.tipoPago||"").toLowerCase() !== "efectivo" &&
    ["", "pedir", ...(verPedidas?["pedida"]:[])].includes(String(v.factura||"").toLowerCase().trim());

  const candidatas = ventas.filter(porFacturar);
  const grupoV = v => grupoDe(clientes, normCliente(v.cliente));
  const clientesCon = [...new Set(candidatas.map(grupoV))].sort();

  // Remisiones del grupo elegido (puede incluir varias sucursales)
  const delCliente = candidatas.filter(v=>grupoV(v)===cli);
  const sucursales = [...new Set(delCliente.map(v=>normCliente(v.cliente)))];
  const remisiones = Object.values(delCliente.reduce((acc,v)=>{
    const k = String(v.pedido||"").trim() || "(sin remisión)";
    if(!acc[k]) acc[k] = { rem:k, fecha:v.fecha, items:[], total:0, suc:normCliente(v.cliente) };
    acc[k].items.push(v); acc[k].total += num(v.total);
    if((v.fecha||"") < (acc[k].fecha||"")) acc[k].fecha = v.fecha;
    return acc;
  },{})).sort((a,b)=>(a.fecha||"").localeCompare(b.fecha||""));

  const elegidas = remisiones.filter(r=>sel[r.rem]);
  const lineas = Object.values(elegidas.flatMap(r=>r.items).reduce((acc,v)=>{
    // Un renglón por combinación de producto y precio
    const k = `${v.producto}__${num(v.precio)}`;
    if(!acc[k]) acc[k] = { producto:v.producto, precio:num(v.precio), kg:0, total:0 };
    acc[k].kg += num(v.kg); acc[k].total += num(v.total);
    return acc;
  },{})).sort((a,b)=> a.producto.localeCompare(b.producto) || a.precio-b.precio);

  const totalMsg = lineas.reduce((s,l)=>s+l.total,0);
  const f = fiscalGrupo(clientes, cli);
  const nf  = n => n.toLocaleString("es-MX",{maximumFractionDigits:2});                         // cantidades
  const nfM = n => n.toLocaleString("es-MX",{minimumFractionDigits:2,maximumFractionDigits:2}); // dinero
  const sinClave = lineas.filter(l=>!satDe(productos,l.producto).clave).map(l=>l.producto);

  const mensaje = () => {
    if(!cli || !lineas.length) return "";
    const L = [];
    L.push("Buenas tardes, me ayudan con esta factura por favor");
    L.push("");
    const alias = [...new Set(elegidas.map(r=>r.suc))].join(", ");
    L.push(`Cliente: ${f.razonSocial || cli}${f.razonSocial ? ` (${alias||cli})` : ""}`);
    if(f.rfc)       L.push(`RFC: ${f.rfc}`);
    if(f.cp)        L.push(`CP: ${f.cp}`);
    if(f.regimen)   L.push(`Régimen: ${f.regimen}`);
    if(f.usoCFDI)   L.push(`Uso: ${f.usoCFDI}`);
    if(f.formaPago) L.push(`Forma de pago: ${f.formaPago}`);
    L.push("");
    lineas.forEach((l,i)=>{
      const sat = satDe(productos,l.producto);
      L.push(`Producto ${i+1}: ${sat.clave ? sat.clave+" " : ""}${sat.desc}`);
      L.push(`${nf(l.kg)} ${uni(l.producto)} x $${nfM(l.precio)} = $${nfM(l.total)}`);
      L.push("");
    });
    L.push(`Total = $${nfM(totalMsg)}`);
    L.push("");
    L.push(`${elegidas.length>1?"En observaciones poner: Remisiones":"Remisión:"} ${elegidas.map(r=>r.rem).join(", ")}`);
    return L.join("\n");
  };
  const texto = mensaje();

  const copiar = async () => {
    try { await navigator.clipboard.writeText(texto); }
    catch { const t=document.createElement("textarea"); t.value=texto; document.body.appendChild(t); t.select(); document.execCommand("copy"); t.remove(); }
    setCopiado(true); setTimeout(()=>setCopiado(false),2200);
  };
  const porWhats = () => window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`,"_blank");

  const marcarPedidas = () => {
    const rems = new Set(elegidas.map(r=>r.rem));
    if(!rems.size) return;
    const n = delCliente.filter(v=>rems.has(String(v.pedido||"").trim())).length;
    if(!window.confirm(`¿Ya pediste esta factura?\n\n${rems.size} remisión(es) · ${n} renglón(es) · ${fmt(totalMsg)}\n\nPasarán de "Pedir" a "Pedida".`)) return;
    setVentas(vs=>vs.map(v=>(rems.has(String(v.pedido||"").trim()) && grupoV(v)===cli && porFacturar(v))
      ? {...v, factura:"Pedida"} : v));
    logBit("Pidió factura",`${cli} · remisiones ${[...rems].join(", ")} · ${fmt(totalMsg)}`);
    setSel({}); setAviso(`Listo: ${rems.size} remisión(es) quedaron como "Pedida".`);
    setTimeout(()=>setAviso(""),4000);
  };

  const togglePick = c => { setCli(c); setSel({}); };
  const todas  = () => setSel(Object.fromEntries(remisiones.map(r=>[r.rem,true])));
  const ningun = () => setSel({});

  return (
    <div>
      <PageHead titulo="Facturación" sub="Arma el mensaje con las remisiones que tu contador debe facturar"/>

      <div style={{...card,marginBottom:16}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
          <h3 style={{...h3s,margin:0}}>Clientes con facturas por pedir</h3>
          <label style={{fontSize:12,color:C.muted,display:"flex",alignItems:"center",gap:6,cursor:"pointer"}}>
            <input type="checkbox" checked={verPedidas} onChange={e=>{setVerPedidas(e.target.checked);setSel({});}}/>
            Incluir las ya pedidas
          </label>
        </div>
        {clientesCon.length===0
          ? <p style={{color:C.green,textAlign:"center",padding:"18px 0",margin:0,fontWeight:600}}>No hay facturas pendientes de pedir</p>
          : <div style={{display:"flex",gap:7,flexWrap:"wrap"}}>
              {clientesCon.map(c=>{
                const vs = candidatas.filter(v=>grupoV(v)===c);
                const n = vs.reduce((s,v)=>s+num(v.total),0);
                const sucs = new Set(vs.map(v=>normCliente(v.cliente))).size;
                return <button key={c} style={nb(cli===c)} onClick={()=>togglePick(c)}>{c}{sucs>1?` (${sucs} sucursales)`:""} · {fmt(n)}</button>;
              })}
            </div>}
      </div>

      {cli&&(
        <div className="saji-cols">
          <div style={card}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
              <h3 style={{...h3s,margin:0}}>Remisiones de {cli}{sucursales.length>1?` · ${sucursales.length} sucursales`:""}</h3>
              <div style={{display:"flex",gap:6}}>
                <button style={{...btnO(C.muted),padding:"5px 11px",fontSize:11}} onClick={todas}>Todas</button>
                <button style={{...btnO(C.muted),padding:"5px 11px",fontSize:11}} onClick={ningun}>Ninguna</button>
              </div>
            </div>
            {remisiones.map(r=>(
              <label key={r.rem} style={{display:"flex",gap:10,alignItems:"flex-start",padding:"10px 6px",borderBottom:"1px solid #f0f2ee",cursor:"pointer"}}>
                <input type="checkbox" style={{marginTop:3}} checked={!!sel[r.rem]} onChange={e=>setSel(s=>({...s,[r.rem]:e.target.checked}))}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                    <strong style={{fontSize:13.5}}>{r.rem}</strong>
                    <strong style={{fontSize:13.5}}>{fmt(r.total)}</strong>
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    {sucursales.length>1&&<strong style={{color:C.indigo}}>{r.suc} · </strong>}
                    {fmtDate(r.fecha)} · Sem {weekOf(r.fecha)} · {r.items.map(i=>`${i.producto} ${num(i.kg)}${uni(i.producto)}`).join(" · ")}
                  </div>
                </div>
              </label>
            ))}
          </div>

          <div style={card}>
            <h3 style={h3s}>Mensaje para el contador</h3>
            {!f.rfc&&(
              <div style={{background:C.amberL,border:`1px solid ${C.amber}44`,borderRadius:10,padding:"9px 12px",fontSize:12,color:C.amber,marginBottom:10}}>
                Este cliente no tiene datos fiscales. Captúralos en Catálogos → Clientes.
              </div>
            )}
            {sinClave.length>0&&(
              <div style={{background:C.amberL,border:`1px solid ${C.amber}44`,borderRadius:10,padding:"9px 12px",fontSize:12,color:C.amber,marginBottom:10}}>
                Sin clave SAT: {[...new Set(sinClave)].join(", ")}. Agrégala en Catálogos → Productos.
              </div>
            )}
            <textarea readOnly value={texto||"Selecciona al menos una remisión."} style={{...inp,height:330,fontFamily:"ui-monospace,Menlo,monospace",fontSize:12.5,lineHeight:1.55,resize:"vertical"}}/>
            {aviso&&<div style={{background:C.greenL,border:`1px solid ${C.greenM}`,borderRadius:10,padding:"9px 12px",fontSize:12,color:C.green,fontWeight:600,marginTop:12}}>{aviso}</div>}
            <div style={{display:"flex",gap:8,marginTop:12,flexWrap:"wrap"}}>
              <button style={btn(C.indigo)} disabled={!texto} onClick={copiar}>{copiado?"✓ Copiado":"Copiar mensaje"}</button>
              <button style={btnO(C.green)} disabled={!texto} onClick={porWhats}>WhatsApp</button>
              <button style={btn(C.amber)} disabled={!elegidas.length} onClick={marcarPedidas}>Factura pedida</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// VENTAS  (módulo único — estructura del Excel "Venta")
// ════════════════════════════════════════════════════════════════════════════════
const ventaEmpty = () => ({
  pedido:"", fecha:todayStr(), cliente:"", producto:"", kg:"", precio:"",
  tipoPago:"Transferencia", estatus:"Pendiente", factura:"Pedir", fpago:"",
});

function Ventas({ ventas, setVentas, clientes, productos, compras, logBit, abrirVenta, onAbierta }) {
  const [ticket,   setTicket]   = useState(null);
  // Arranca en la semana corriente; con "Todo" se ve el histórico completo
  const [f,       setF]       = useState({tipo:"semana",valor:"",desde:"",hasta:""});
  const [q,       setQ]       = useState("");
  const [fCli,    setFCli]    = useState("");
  const [fProd,   setFProd]   = useState("");
  const [fEst,    setFEst]    = useState("");
  const [sel_,    setSel]     = useState(null);   // venta abierta en el panel
  const [form,    setForm]    = useState(null);   // borrador del panel
  const [nueva,   setNueva]   = useState(false);
  const [gsel,    setGsel]    = useState(null);   // remisión abierta
  const [gf,      setGf]      = useState(null);   // cobro y factura de la remisión

  const sf = (k,v) => setForm(x=>{
    const n = {...x,[k]:v};
    if(k==="tipoPago"){
      if(v==="Efectivo"){ n.factura="NA"; }
      else if(!n.factura || n.factura==="NA"){ n.factura="Pedir"; }
    }
    if(k==="estatus"){
      if(v==="Pagado" && !n.fpago) n.fpago = todayStr();
      if(v==="Pendiente") n.fpago = "";
    }
    return n;
  });

  // Cuántos renglones comparten remisión y cliente con el que estás editando
  const hermanas = (soloFacturables) => {
    const rem = String(form?.pedido||"").trim();
    if(!rem || !form) return [];
    return ventas.filter(v=>String(v.pedido||"").trim()===rem
      && normCliente(v.cliente)===normCliente(form.cliente)
      && (!soloFacturables || String(v.tipoPago||"").toLowerCase()!=="efectivo"));
  };
  const avisoRemision = (que) => {
    const n = hermanas(que==="factura").length;
    if(n<2) return null;
    return <div style={{fontSize:11,color:C.indigo,marginBottom:6}}>
      Se aplicará a los {n} productos de la remisión {String(form.pedido||"").trim()}.
    </div>;
  };

  const abrir = v => { setNueva(false); setSel(v.id); setForm({...v}); };

  // Cuando se entra desde ¿Quién me debe?, se abre esa venta y se quitan los
  // filtros para que no quede escondida por el período o el estatus.
  useEffect(()=>{
    if(!abrirVenta) return;
    const actual = ventas.find(v=>v.id===abrirVenta.id) || abrirVenta;
    setF({tipo:"todo",valor:"",desde:"",hasta:""});
    setQ(String(actual.pedido||"")); setFCli(""); setFProd(""); setFEst("");
    setGsel({pedido:String(actual.pedido||"").trim(), cliente:actual.cliente});
    onAbierta && onAbierta();
  }, [abrirVenta]);
  const abrirNueva = () => { setNueva(true); setSel("nueva"); setForm(ventaEmpty()); };
  const cerrar = () => { setSel(null); setForm(null); setNueva(false); };

  const guardar = () => {
    if(!form.cliente||!form.producto||!form.kg||!form.precio) return alert(`Completa cliente, producto, ${uniU(form.producto)} y precio.`);
    const kg=num(form.kg), precio=num(form.precio);
    const reg = {
      ...form,
      id: nueva ? `v${Date.now()}` : form.id,
      pedido: String(form.pedido||"").trim(),
      cliente: form.cliente.trim(),
      kg, precio, total: Math.round(kg*precio*100)/100,
      sem: weekOf(form.fecha), dia: dayOf(form.fecha), mes: monthOf(form.fecha),
      factura: form.tipoPago==="Efectivo" ? "NA" : (form.factura||"Pedir"),
      fpago: form.estatus==="Pagado" ? (form.fpago||todayStr()) : "",
    };
    if(nueva){
      setVentas(vs=>[reg,...vs]);
      logBit("Nueva venta",`${reg.pedido} · ${reg.cliente} · ${fmt(reg.total)}`);
    } else {
      // La factura y el cobro son de la remisión completa, no de un renglón:
      // lo que cambie aquí se aplica a todos los productos del mismo pedido
      // y cliente. El tipo de pago no se replica, porque a veces una misma
      // remisión se cobra parte en efectivo y parte por transferencia.
      const orig = ventas.find(v=>v.id===reg.id) || {};
      const cambioFac  = String(orig.factura||"") !== String(reg.factura||"");
      const cambioPago = String(orig.estatus||"") !== String(reg.estatus||"")
                      || String(orig.fpago||"")   !== String(reg.fpago||"");
      const rem = String(reg.pedido||"").trim();
      const mismaRem = v => rem && String(v.pedido||"").trim()===rem
                          && normCliente(v.cliente)===normCliente(reg.cliente);
      setVentas(vs=>vs.map(v=>{
        if(v.id===reg.id) return reg;
        if(!mismaRem(v)) return v;
        let n = v;
        // La factura no toca los renglones de efectivo: esos van como NA
        if(cambioFac && String(v.tipoPago||"").toLowerCase()!=="efectivo")
          n = {...n, factura:reg.factura};
        if(cambioPago)
          n = {...n, estatus:reg.estatus, fpago:reg.fpago};
        return n;
      }));
      logBit("Editó venta",`${reg.pedido} · ${reg.cliente} · ${fmt(reg.total)}`);
    }
    cerrar();
  };

  const eliminar = () => {
    if(!window.confirm(`¿Eliminar la venta ${form.pedido||""} de ${form.cliente}?`)) return;
    setVentas(vs=>vs.filter(v=>v.id!==form.id));
    logBit("Eliminó venta",`${form.pedido} · ${form.cliente} · ${fmt(num(form.total))}`);
    cerrar();
  };

  // ── Filtros ───────────────────────────────────────────────────────────────
  const base = applyFilter(ventas, f);
  const lista = base.filter(v=>{
    if(fCli  && normCliente(v.cliente)!==fCli) return false;
    if(fProd && v.producto!==fProd) return false;
    if(fEst==="pend"  && !esPend(v)) return false;
    if(fEst==="pag"   &&  esPend(v)) return false;
    if(fEst==="fact"  && !(String(v.tipoPago||"").toLowerCase()!=="efectivo" && ["","pedir","pedida"].includes(String(v.factura||"").toLowerCase()))) return false;
    if(q){
      const t=q.toLowerCase();
      if(!`${v.pedido} ${v.cliente} ${v.producto} ${v.factura}`.toLowerCase().includes(t)) return false;
    }
    return true;
  }).slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"") || String(b.pedido||"").localeCompare(String(a.pedido||"")));

  const tot    = lista.reduce((s,v)=>s+num(v.total),0);
  const kgTot  = lista.filter(v=>!esLitro(v.producto)).reduce((s,v)=>s+num(v.kg),0);
  const ltTot  = lista.filter(v=> esLitro(v.producto)).reduce((s,v)=>s+num(v.kg),0);
  // Una venta = un pedido (número de remisión); un pedido puede traer varios productos
  const keyPed   = v => `${String(v.pedido||"").trim()}|${normCliente(v.cliente)}`;
  const nPedidos = new Set(lista.map(keyPed)).size;
  const nPedPend = new Set(lista.filter(esPend).map(keyPed)).size;
  const atrasoMax = lista.filter(esPend).reduce((m,v)=>Math.max(m,diasPend(v)),0);
  const costoLista = lista.reduce((s,v)=>s+num(v.kg)*costoPromedio(compras||[],v.producto,v.fecha),0);
  const margen     = tot - costoLista;
  const margenPct  = tot ? margen/tot*100 : 0;
  // El primer recuadro cambia de nombre según el estatus filtrado
  const tituloTot = fEst==="pend" ? "Total por cobrar"
                  : fEst==="pag"  ? "Total cobrado"
                  : fEst==="fact" ? "Total por facturar"
                  :                 "Total vendido";
  const pendT  = lista.filter(esPend).reduce((s,v)=>s+num(v.total),0);
  const facT   = lista.filter(v=>String(v.tipoPago||"").toLowerCase()!=="efectivo" && ["","pedir","pedida"].includes(String(v.factura||"").toLowerCase())).length;

  const cliList  = [...new Set(ventas.map(v=>normCliente(v.cliente)).filter(Boolean))].sort();
  const prodList = [...new Set(ventas.map(v=>v.producto).filter(Boolean))].sort();

  // ── Una venta = una remisión ──────────────────────────────────────────────
  // La lista muestra un solo renglón por venta; los productos se ven al abrirla.
  const armaGrupo = items => {
    const v0 = items[0] || {};
    const pend = items.filter(esPend);
    return {
      key: keyPed(v0),
      pedido: String(v0.pedido||"").trim(),
      cliente: v0.cliente || "",
      fecha: items.reduce((d,v)=>(v.fecha||"")>d?(v.fecha||""):d, ""),
      sem: v0.sem || weekOf(v0.fecha),
      dia: v0.dia || dayOf(v0.fecha),
      items,
      total: items.reduce((s,v)=>s+num(v.total),0),
      pend: pend.length>0,
      nPend: pend.length,
      dias: pend.reduce((d,v)=>Math.max(d,diasPend(v)),0),
      pagos: [...new Set(items.map(v=>v.tipoPago).filter(Boolean))],
      facturas: [...new Set(items.map(v=>String(v.factura||"").trim())
                   .filter(x=>x && x.toLowerCase()!=="na"))],
    };
  };
  const grupos = (()=>{
    const m = new Map();
    lista.forEach(v=>{ const k=keyPed(v); if(!m.has(k)) m.set(k,[]); m.get(k).push(v); });
    return [...m.values()].map(armaGrupo)
      .sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")
                 || String(b.pedido||"").localeCompare(String(a.pedido||"")));
  })();
  // El detalle se arma de todas las ventas, no de la lista filtrada, para que
  // al abrir una remisión se vean sus productos completos.
  const gAbierto = (()=>{
    if(!gsel) return null;
    const its = ventas.filter(v=>String(v.pedido||"").trim()===gsel.pedido
                              && normCliente(v.cliente)===normCliente(gsel.cliente))
                      .slice().sort((a,b)=>String(a.producto||"").localeCompare(String(b.producto||"")));
    return its.length ? armaGrupo(its) : null;
  })();
  const abrirGrupo = g => setGsel({pedido:g.pedido, cliente:g.cliente});

  // El cobro y la factura son de la remisión completa: se editan en el detalle
  // de la venta y se aplican a todos sus productos.
  const resumenGrupo = g => {
    const pagos = [...new Set(g.items.map(v=>String(v.tipoPago||"").trim()).filter(Boolean))];
    const facturables = g.items.filter(v=>String(v.tipoPago||"").toLowerCase()!=="efectivo");
    const facs = [...new Set(facturables.map(v=>String(v.factura||"").trim()))];
    return {
      tipoPago: pagos.length===1 ? pagos[0] : (pagos.length ? "Mixto" : "Transferencia"),
      estatus : g.items.every(v=>!esPend(v)) ? "Pagado" : "Pendiente",
      fpago   : (g.items.find(v=>v.fpago)||{}).fpago || "",
      factura : facturables.length ? (facs.length===1 ? facs[0] : "") : null,
    };
  };
  // Se recarga cuando cambia la remisión abierta o cuando se edita un producto
  const gSig = gAbierto
    ? gAbierto.items.map(v=>`${v.id}|${v.tipoPago}|${v.estatus}|${v.fpago}|${v.factura}`).join(";")
    : "";
  useEffect(()=>{ setGf(gAbierto ? resumenGrupo(gAbierto) : null); }, [gSig]);
  const sgf = (k,v) => setGf(x=>{
    const n = {...x,[k]:v};
    if(k==="tipoPago"){
      if(v==="Efectivo") n.factura = null;
      else if(n.factura==null || n.factura==="NA") n.factura = "Pedir";
    }
    if(k==="estatus"){
      if(v==="Pagado" && !n.fpago) n.fpago = todayStr();
      if(v==="Pendiente") n.fpago = "";
    }
    return n;
  });
  const gCambios = gAbierto && gf
    && JSON.stringify(gf) !== JSON.stringify(resumenGrupo(gAbierto));
  const guardarGrupo = () => {
    const modo = gf.factura==null ? "na"
               : ["pedir","pedida"].includes(String(gf.factura).toLowerCase()) ? "txt" : "num";
    if(modo==="num" && !String(gf.factura).trim())
      return alert("Escribe el número de factura o elige Pedir / Pedida.");
    const ids = new Set(gAbierto.items.map(v=>v.id));
    const est = gf.estatus;
    const fp  = est==="Pagado" ? (gf.fpago||todayStr()) : "";
    setVentas(vs=>vs.map(v=>{
      if(!ids.has(v.id)) return v;
      const n = {...v, estatus:est, fpago:fp};
      if(gf.tipoPago && gf.tipoPago!=="Mixto") n.tipoPago = gf.tipoPago;
      n.factura = String(n.tipoPago||"").toLowerCase()==="efectivo"
        ? "NA" : (gf.factura==null ? n.factura : gf.factura);
      return n;
    }));
    logBit("Cobro y factura",`${gAbierto.pedido} · ${gAbierto.cliente} · ${gAbierto.items.length} productos`);
  };
  const agregarA = g => { setNueva(true); setSel("nueva");
    setForm({...ventaEmpty(), pedido:g.pedido, cliente:g.cliente, fecha:g.fecha,
             tipoPago:g.pagos[0]||"Transferencia"}); };

  const cols = [
    {l:"Pedido",k:"pedido"},{l:"SEM",k:"sem"},{l:"DÍA",k:"dia"},{l:"MES",k:"mes"},{l:"FECHA",k:"fecha"},
    {l:"CLIENTE",k:"cliente"},{l:"Producto",k:"producto"},{l:"CANTIDAD",k:"kg"},{l:"UNIDAD",k:"_u"},{l:"$/UNIDAD",k:"precio"},{l:"Total",k:"total"},
    {l:"TIPO DE PAGO",k:"tipoPago"},{l:"ESTATUS PAGO",k:"estatus"},{l:"FACTURA",k:"factura"},{l:"DÍAS PEND.",k:"_d"},{l:"F. PAGO",k:"fpago"},
  ];

  return (
    <div>
      <PageHead titulo="Ventas" sub="Se registran al confirmar un pedido"
        extra={<>
          <button style={btnO(C.muted)} onClick={()=>document.getElementById("impVentasJSON").click()}>Importar</button>
          <button style={btnO(C.muted)} onClick={()=>exportCSV(lista.map(v=>({...v,_d:diasPend(v),_u:uni(v.producto)})),cols,`ventas-${todayStr()}.csv`)}>Exportar</button>
          <button style={btn(C.indigo)} onClick={abrirNueva}>+ Nueva venta</button>
        </>}/>
      <input id="impVentasJSON" type="file" accept=".json" style={{display:"none"}} onChange={async e=>{
        const file=e.target.files?.[0]; if(!file) return;
        try{
          const data=JSON.parse(await file.text());
          const arr=Array.isArray(data)?data:(data.ventas||Object.values(data)[0]||[]);
          const norm=arr.map((v,i)=>({
            ...v, id:String(v.id||`imp${i}`), kg:num(v.kg), precio:num(v.precio),
            total:num(v.total)||Math.round(num(v.kg)*num(v.precio)*100)/100,
            sem:v.sem||weekOf(v.fecha), dia:v.dia||dayOf(v.fecha), mes:v.mes||monthOf(v.fecha),
            factura: v.tipoPago==="Efectivo" ? "NA" : (v.factura||"Pedir"),
          }));
          if(window.confirm(`¿Importar ${norm.length} ventas?\n\nEsto REEMPLAZA todas las ventas actuales.`)){
            setVentas(norm); logBit("Importó ventas",`${norm.length} registros`);
          }
        }catch(err){ alert("No se pudo leer el archivo: "+err.message); }
        e.target.value="";
      }}/>

      <div className="saji-kpis saji-kpis2" style={{marginBottom:16}}>
        <Kpi hi label={tituloTot} value={fmt(tot)} sub={`${nPedidos} venta${nPedidos===1?"":"s"} · ${lista.length} ${lista.length===1?"renglón":"renglones"}`}/>
        {costoLista>0&&fEst!=="pend"
          ? <Kpi label="Margen" value={fmt(margen)} sub={`${margenPct.toFixed(1)}% · costo ${fmt(costoLista)}`} color={margen>0?C.green:C.red}/>
          : fEst==="pend"
          ? <Kpi label="Atraso máximo" value={`${atrasoMax} día${atrasoMax===1?"":"s"}`} sub={`${nPedPend} venta${nPedPend===1?"":"s"} sin pagar`} color={atrasoMax>15?C.red:C.amber}/>
          : <Kpi label="Por cobrar" value={fmt(pendT)} sub={`${nPedPend} venta${nPedPend===1?"":"s"}`} color={pendT>0?C.red:C.green}/>}
      </div>

      <div style={card}>
        <div className="saji-filtros" style={{display:"flex",gap:8,flexWrap:"wrap",alignItems:"center",marginBottom:12}}>
          <input style={{...inp,flex:"1 1 200px",width:"auto"}} placeholder="Buscar pedido, cliente, producto o factura…" value={q} onChange={e=>setQ(e.target.value)}/>
          <select style={{...sel,width:"auto"}} value={fCli} onChange={e=>setFCli(e.target.value)}>
            <option value="">Todos los clientes</option>{cliList.map(c=><option key={c}>{c}</option>)}
          </select>
          <select style={{...sel,width:"auto"}} value={fProd} onChange={e=>setFProd(e.target.value)}>
            <option value="">Todos los productos</option>{prodList.map(p=><option key={p}>{p}</option>)}
          </select>
          <select style={{...sel,width:"auto"}} value={fEst} onChange={e=>setFEst(e.target.value)}>
            <option value="">Todo el estatus</option>
            <option value="pend">Por cobrar</option>
            <option value="pag">Pagadas</option>
            <option value="fact">Factura pendiente</option>
          </select>
        </div>
        <FilterBar filter={f} setFilter={setF} count={grupos.length} nombre="venta"/>

        {grupos.length===0
          ? <p style={{color:C.muted,textAlign:"center",padding:"28px 0",margin:0}}>No hay ventas con estos filtros.</p>
          : grupos.map(g=>{
              const nI    = g.items.length;
              const prods = g.items.map(v=>v.producto).filter(Boolean);
              const fac   = g.facturas.length===1 ? g.facturas[0] : "";
              const facL  = fac.toLowerCase();
              return (
                <div key={g.key} className="saji-row" onClick={()=>abrirGrupo(g)}>
                  <span style={{fontWeight:700,color:C.indigo,fontSize:13}}>{g.pedido||"—"}</span>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{g.cliente}</div>
                    <div style={{fontSize:11,color:C.muted}}>{fmtDate(g.fecha)} · Sem {g.sem}</div>
                    <div className="saji-only-sm" style={{fontSize:11,color:C.muted,marginTop:2}}>
                      {nI} producto{nI===1?"":"s"}
                      <span style={{color:g.pend?C.amber:C.green,fontWeight:600}}> · {g.pend?"Pendiente":"Pagado"}</span>
                    </div>
                  </div>
                  <div className="saji-hide-sm" style={{fontSize:13,minWidth:0}}>
                    <div style={{fontWeight:600,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                      {prods.slice(0,2).join(", ")}{prods.length>2?` +${prods.length-2}`:""}
                    </div>
                    <div style={{fontSize:11,color:C.muted}}>{nI} producto{nI===1?"":"s"}</div>
                  </div>
                  <div className="saji-hide-sm">
                    <span style={badge(g.pend?C.amber:C.green)}>
                      {g.pend?(g.nPend<nI?`${g.nPend} de ${nI} pend.`:"Pendiente"):"Pagado"}
                    </span>
                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>
                      {g.pagos.join(" / ")}{(!fac||facL==="na")?"":` · ${facL==="pedir"?"Pedir factura":facL==="pedida"?"Factura pedida":fac}`}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:700,fontSize:14}}>{fmt(g.total)}</div>
                    {g.pend&&g.dias>0&&<div style={{fontSize:11,color:C.red}}>{g.dias} días</div>}
                  </div>
                  <span style={{color:C.mutedL}}>›</span>
                </div>
              );
            })}
      </div>

      {/* ── Detalle de la venta (remisión completa) ────────────────── */}
      {gAbierto&&(
        <div style={modal} onClick={()=>setGsel(null)}>
          <div className="saji-drawer" onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",gap:8,marginBottom:16}}>
              <div style={{minWidth:0}}>
                <h3 style={{margin:0,fontSize:18}}>Pedido {gAbierto.pedido||"—"}</h3>
                <div style={{fontSize:14,fontWeight:600,marginTop:4}}>{gAbierto.cliente}</div>
                <div style={{fontSize:12,color:C.muted,marginTop:2}}>{gAbierto.dia} {fmtDate(gAbierto.fecha)} · Semana {gAbierto.sem}</div>
              </div>
              <button onClick={()=>setGsel(null)} style={{background:"none",border:"none",fontSize:26,color:C.muted,cursor:"pointer",lineHeight:1}}>×</button>
            </div>

            <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:16}}>
              <span style={badge(gAbierto.pend?C.amber:C.green)}>
                {gAbierto.pend
                  ? (gAbierto.nPend<gAbierto.items.length?`${gAbierto.nPend} de ${gAbierto.items.length} por cobrar`:"Por cobrar")
                  : "Pagado"}
              </span>
              {gAbierto.pend&&gAbierto.dias>0&&<span style={badge(gAbierto.dias>15?C.red:C.amber)}>{gAbierto.dias} días</span>}
              {gAbierto.pagos.map(p=><span key={p} style={badge(C.indigo)}>{p}</span>)}
              {gAbierto.facturas.map(x=>(
                <span key={x} style={badge(C.muted)}>
                  {x.toLowerCase()==="pedir"?"Pedir factura":x.toLowerCase()==="pedida"?"Factura pedida":`Factura ${x}`}
                </span>
              ))}
            </div>

            <div style={secTit}>Productos de esta venta</div>
            {gAbierto.items.map(v=>{
              const pend = esPend(v);
              return (
                <div key={v.id} onClick={()=>abrir(v)} style={{display:"grid",gridTemplateColumns:"1fr auto 14px",
                  gap:10,alignItems:"center",padding:"11px 4px",borderBottom:`1px solid ${C.border}`,cursor:"pointer"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14}}>{v.producto}{v.calibre?` · ${v.calibre}`:""}</div>
                    <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                      {num(v.kg).toLocaleString("es-MX",{maximumFractionDigits:2})} {uni(v.producto)} × {fmt(v.precio)}
                      <span style={{color:pend?C.amber:C.green,fontWeight:600}}> · {pend?"Pendiente":"Pagado"}</span>
                    </div>
                  </div>
                  <div style={{fontWeight:700,fontSize:14}}>{fmt(v.total)}</div>
                  <span style={{color:C.mutedL}}>›</span>
                </div>
              );
            })}

            <div style={totRow}>
              <span style={{fontSize:13,color:C.muted}}>Total de la venta</span>
              <strong style={{fontSize:18}}>{fmt(gAbierto.total)}</strong>
            </div>

            {(()=>{
              const ct = gAbierto.items.reduce((s,v)=>s+num(v.kg)*costoPromedio(compras||[],v.producto,v.fecha),0);
              if(!ct) return null;
              const mg = gAbierto.total - ct, pct = gAbierto.total ? mg/gAbierto.total*100 : 0;
              return (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:10,
                  padding:"10px 14px",background:mg>=0?C.greenL:C.redL,borderRadius:12,fontSize:13}}>
                  <span style={{color:C.muted}}>Costo {fmt(ct)}</span>
                  <strong style={{color:mg>=0?C.green:C.red}}>Margen {fmt(mg)} ({pct.toFixed(1)}%)</strong>
                </div>
              );
            })()}

            {gf&&(()=>{
              const nI = gAbierto.items.length;
              const modo = gf.factura==null ? "na"
                         : ["pedir","pedida"].includes(String(gf.factura).toLowerCase())
                           ? String(gf.factura).toLowerCase() : "num";
              return (
                <>
                  <div style={{height:1,background:C.border,margin:"20px 0"}}/>
                  <div style={secTit}>Cobro y factura</div>
                  {nI>1&&<div style={{fontSize:11,color:C.indigo,margin:"0 0 10px"}}>
                    Se aplica a los {nI} productos de la remisión {gAbierto.pedido}.
                  </div>}

                  <div style={g2}>
                    <div><label style={lbl}>Tipo de pago</label>
                      <select style={sel} value={gf.tipoPago} onChange={e=>sgf("tipoPago",e.target.value)}>
                        {gf.tipoPago==="Mixto"&&<option value="Mixto">Mixto (no se cambia)</option>}
                        <option>Transferencia</option><option>Efectivo</option>
                      </select>
                    </div>
                    <div><label style={lbl}>Estatus de pago</label>
                      <select style={sel} value={gf.estatus} onChange={e=>sgf("estatus",e.target.value)}>
                        <option>Pendiente</option><option>Pagado</option>
                      </select>
                    </div>
                  </div>
                  <div style={{...g2,marginTop:12}}>
                    <div><label style={lbl}>Fecha de pago</label>
                      <input type="date" style={{...inp,opacity:gf.estatus==="Pagado"?1:.5}}
                        disabled={gf.estatus!=="Pagado"} value={gf.fpago||""}
                        onChange={e=>sgf("fpago",e.target.value)}/>
                    </div>
                    <div><label style={lbl}>Días pendientes</label>
                      <div style={{...inp,background:"#fafafa",color:gAbierto.dias>0?C.red:C.muted,fontWeight:600}}>
                        {gf.estatus==="Pagado"?0:gAbierto.dias}
                      </div>
                    </div>
                  </div>

                  <div style={{marginTop:12}}>
                    <label style={lbl}>Factura</label>
                    {modo==="na"
                      ? <div style={{...inp,background:"#fafafa",color:C.muted}}>NA — el efectivo no aplica factura</div>
                      : <>
                          <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                            {["Pedir","Pedida"].map(o=>(
                              <button key={o} style={nb(modo===o.toLowerCase())} onClick={()=>sgf("factura",o)}>{o}</button>
                            ))}
                            <button style={nb(modo==="num")} onClick={()=>sgf("factura","")}>Con número</button>
                          </div>
                          {modo==="num"&&(
                            <input style={inp} placeholder="Ej. F25" value={gf.factura||""}
                              onChange={e=>sgf("factura",e.target.value)}/>
                          )}
                        </>}
                  </div>
                </>
              );
            })()}

            <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:22,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                <button style={btnO(C.indigo)} onClick={()=>{
                  const its=gAbierto.items.map(v=>({producto:v.producto,cantidad:v.kg,precio:v.precio,calibre:v.calibre}));
                  setTicket({ folio:gAbierto.pedido||"—", fecha:gAbierto.fecha, cliente:gAbierto.cliente, items:its,
                    total:gAbierto.total, tipoPago:gAbierto.pagos.join(" / "),
                    estatus:gAbierto.pend?"Pendiente":"Pagado" });
                }}>Ticket</button>
                <button style={btnO(C.muted)} onClick={()=>agregarA(gAbierto)}>+ Producto</button>
              </div>
              <div style={{display:"flex",gap:8}}>
                <button style={btnO(C.muted)} onClick={()=>setGsel(null)}>Cerrar</button>
                <button style={{...btn(C.indigo),opacity:gCambios?1:.45,cursor:gCambios?"pointer":"default"}}
                  disabled={!gCambios} onClick={guardarGrupo}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Panel de detalle ─────────────────────────────────────────────── */}
      {form&&(
        <div style={{...modal,zIndex:210,background:gAbierto?"rgba(20,32,26,.18)":modal.background}} onClick={cerrar}>
          <div className="saji-drawer" onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div>
                <h3 style={{margin:0,fontSize:18}}>{nueva?(form.pedido?"Agregar producto":"Nueva venta"):(form.producto||"Producto")}</h3>
                {!nueva&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>Pedido {form.pedido||"—"} · {form.cliente} · {fmtDate(form.fecha)}</div>}
              </div>
              <button onClick={cerrar} style={{background:"none",border:"none",fontSize:26,color:C.muted,cursor:"pointer",lineHeight:1}}>×</button>
            </div>

            <div style={g2}>
              <div><label style={lbl}>Pedido (remisión)</label><input style={inp} value={form.pedido} onChange={e=>sf("pedido",e.target.value)}/></div>
              <div><label style={lbl}>Fecha de entrega</label><input type="date" style={inp} value={form.fecha} onChange={e=>sf("fecha",e.target.value)}/></div>
            </div>
            <div style={{...g2,marginTop:12}}>
              <div><label style={lbl}>Cliente</label>
                <input style={inp} list="cli-list" value={form.cliente} onChange={e=>sf("cliente",e.target.value)}/>
                <datalist id="cli-list">{[...new Set([...(clientes||[]).map(cliNom),...ventas.map(v=>v.cliente)])].filter(Boolean).map(c=><option key={c} value={c}/>)}</datalist>
              </div>
              <div><label style={lbl}>Producto</label>
                <input style={inp} list="prod-list" value={form.producto} onChange={e=>sf("producto",e.target.value)}/>
                <datalist id="prod-list">{[...new Set([...(productos||[]).map(p=>p.nombre),...ventas.map(v=>v.producto)])].filter(Boolean).map(p=><option key={p} value={p}/>)}</datalist>
              </div>
            </div>
            <div style={{...g3,marginTop:12}}>
              <div><label style={lbl}>{uniU(form.producto)}</label><input type="number" inputMode="decimal" style={inp} value={form.kg} onChange={e=>sf("kg",e.target.value)}/></div>
              <div><label style={lbl}>$ / {uniU(form.producto)}</label><input type="number" inputMode="decimal" style={inp} value={form.precio} onChange={e=>sf("precio",e.target.value)}/></div>
              <div><label style={lbl}>Total</label><div style={{...inp,background:C.indigoL,fontWeight:700,color:C.indigo}}>{fmt(num(form.kg)*num(form.precio))}</div></div>
            </div>
            {(()=>{
              const ck = costoPromedio(compras||[], form.producto, form.fecha);
              if(!ck) return null;
              const costo = num(form.kg)*ck, mg = num(form.kg)*num(form.precio) - costo;
              const pct = num(form.kg)*num(form.precio) ? mg/(num(form.kg)*num(form.precio))*100 : 0;
              return (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:12,padding:"10px 14px",
                  background:mg>=0?C.greenL:C.redL,borderRadius:12,fontSize:13}}>
                  <span style={{color:C.muted}}>Costo {fmt(ck)}/{uni(form.producto)} · {fmt(costo)}</span>
                  <strong style={{color:mg>=0?C.green:C.red}}>Margen {fmt(mg)} ({pct.toFixed(1)}%)</strong>
                </div>
              );
            })()}
            <div style={{display:"none"}}>
            </div>

            <div style={{height:1,background:C.border,margin:"20px 0"}}/>

            {avisoRemision("pago")}
            <div style={g2}>
              <div><label style={lbl}>Tipo de pago</label>
                <select style={sel} value={form.tipoPago} onChange={e=>sf("tipoPago",e.target.value)}>
                  <option>Transferencia</option><option>Efectivo</option>
                </select>
              </div>
              <div><label style={lbl}>Estatus de pago</label>
                <select style={sel} value={form.estatus} onChange={e=>sf("estatus",e.target.value)}>
                  <option>Pendiente</option><option>Pagado</option>
                </select>
              </div>
            </div>
            <div style={{...g2,marginTop:12}}>
              <div><label style={lbl}>Fecha de pago</label>
                <input type="date" style={{...inp,opacity:form.estatus==="Pagado"?1:.5}} disabled={form.estatus!=="Pagado"} value={form.fpago||""} onChange={e=>sf("fpago",e.target.value)}/>
              </div>
              <div><label style={lbl}>Días pendientes</label>
                <div style={{...inp,background:"#fafafa",color:diasPend(form)>0?C.red:C.muted,fontWeight:600}}>{diasPend(form)}</div>
              </div>
            </div>

            <div style={{marginTop:12}}>
              <label style={lbl}>Factura</label>
              {avisoRemision("factura")}
              {form.tipoPago==="Efectivo"
                ? <div style={{...inp,background:"#fafafa",color:C.muted}}>NA — el efectivo no aplica factura</div>
                : <>
                    <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap"}}>
                      {["Pedir","Pedida"].map(o=>(
                        <button key={o} style={nb(String(form.factura).toLowerCase()===o.toLowerCase())} onClick={()=>sf("factura",o)}>{o}</button>
                      ))}
                      <button style={nb(!["pedir","pedida"].includes(String(form.factura).toLowerCase()))} onClick={()=>sf("factura","")}>Con número</button>
                    </div>
                    {!["pedir","pedida"].includes(String(form.factura).toLowerCase())&&(
                      <input style={inp} placeholder="Ej. F25" value={form.factura||""} onChange={e=>sf("factura",e.target.value)}/>
                    )}
                  </>}
            </div>

            <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:24,flexWrap:"wrap"}}>
              <div style={{display:"flex",gap:8}}>
                {!nueva&&<button style={btnO(C.red)} onClick={eliminar}>Eliminar</button>}
              </div>
              <div style={{display:"flex",gap:8}}>
                <button style={btnO(C.muted)} onClick={cerrar}>Cancelar</button>
                <button style={btn(C.indigo)} onClick={guardar}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
      <TicketModal datos={ticket} onClose={()=>setTicket(null)}/>
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════════════════
// ─── De dónde salió el dinero ────────────────────────────────────────────────
// Un gasto es gasto lo pague quien lo pague. Pero si lo puso un socio de su
// bolsa, SAJI queda debiéndole: eso se lleva aparte, no es otro gasto.
const SOCIOS  = ["Irving","Jasso"];
const FUENTES = ["Efectivo SAJI","Banco SAJI",...SOCIOS];
// Las capturas viejas solo traían método de pago: de ahí deducimos la fuente
const fuenteDe = g => {
  if(g.pagadoPor) return g.pagadoPor;
  const m = String(g.metodoPago||"");
  if(/jasso/i.test(m))  return "Jasso";
  if(/irving/i.test(m)) return "Irving";
  if(/efectivo/i.test(m)) return "Efectivo SAJI";
  return "Banco SAJI";
};
const esSocio     = g => SOCIOS.includes(fuenteDe(g));
const esReembolso = g => g.tipo === "reembolso";

const gastoEmpty = () => ({ fecha:todayStr(), tipoGasto:"Alquiler Inmuebles", gasto:"", pagadoPor:"Efectivo SAJI", metodoPago:"Efectivo", estatusPago:"pagado", monto:"" });


// ─── Buscador predictivo de gastos ───────────────────────────────────────────
// Escribes "gaso" y salen Gasolina Caddy y Gasolina Duty, con su categoría.
// Flechas para moverse, Enter para elegir. Si no existe, lo da de alta tal cual.
function ComboGasto({ valor, onElegir, historial }) {
  const [q,     setQ]     = useState(valor||"");
  const [abrir, setAbrir] = useState(false);
  const [idx,   setIdx]   = useState(0);
  useEffect(()=>{ setQ(valor||""); },[valor]);

  // Conceptos que ya usó y no están en el catálogo
  const extra = [...new Set((historial||[]).map(g=>g.gasto).filter(Boolean))]
    .filter(g=>!CATALOGO_GASTOS.some(x=>x.gasto===g))
    .map(g=>({ gasto:g, tipo:(historial.find(x=>x.gasto===g)||{}).tipoGasto || "Otros Gastos" }));
  const todos = [...CATALOGO_GASTOS, ...extra];

  // Cuántas veces usó cada concepto, para ordenar por lo más frecuente
  const uso = {};
  (historial||[]).forEach(g=>{ uso[g.gasto]=(uso[g.gasto]||0)+1; });

  const t = sinAcentos(q);
  const res = (t ? todos.filter(o=>sinAcentos(o.gasto).includes(t) || sinAcentos(o.tipo).includes(t)) : todos)
    .sort((a,b)=>{
      if(t){ // los que empiezan con lo escrito van primero
        const ea=sinAcentos(a.gasto).startsWith(t), eb=sinAcentos(b.gasto).startsWith(t);
        if(ea!==eb) return ea?-1:1;
      }
      return (uso[b.gasto]||0)-(uso[a.gasto]||0) || a.gasto.localeCompare(b.gasto);
    }).slice(0,8);

  const nuevo = q.trim() && !todos.some(o=>sinAcentos(o.gasto)===t);
  const total = res.length + (nuevo?1:0);
  const elegir = i => {
    if(nuevo && i===res.length){ onElegir(q.trim(), null); }
    else if(res[i]){ onElegir(res[i].gasto, res[i].tipo); setQ(res[i].gasto); }
    setAbrir(false);
  };

  return (
    <div style={{position:"relative"}}>
      <input style={inp} placeholder="Escribe: gaso, nómina, luz…" value={q} autoComplete="off"
        onChange={e=>{ setQ(e.target.value); setAbrir(true); setIdx(0); }}
        onFocus={()=>{ setAbrir(true); setIdx(0); }}
        onBlur={()=>setTimeout(()=>setAbrir(false),150)}
        onKeyDown={e=>{
          if(e.key==="ArrowDown"){ e.preventDefault(); setAbrir(true); setIdx(i=>Math.min(i+1,total-1)); }
          else if(e.key==="ArrowUp"){ e.preventDefault(); setIdx(i=>Math.max(i-1,0)); }
          else if(e.key==="Enter" && abrir && total){ e.preventDefault(); elegir(idx); }
          else if(e.key==="Escape"){ setAbrir(false); }
        }}/>
      {abrir&&total>0&&(
        <div style={{position:"absolute",top:"100%",left:0,right:0,marginTop:4,zIndex:40,background:"#fff",
          border:`1px solid ${C.border}`,borderRadius:12,boxShadow:C.shadowLg,overflow:"hidden",maxHeight:290,overflowY:"auto"}}>
          {res.map((o,i)=>(
            <div key={o.gasto} onMouseDown={e=>{e.preventDefault();elegir(i);}} onMouseEnter={()=>setIdx(i)}
              style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"9px 13px",
                cursor:"pointer",background:i===idx?C.indigoL:"transparent",borderBottom:"1px solid #f3f5f1"}}>
              <span style={{fontWeight:600,fontSize:13.5}}>{o.gasto}</span>
              <span style={{fontSize:11,color:esDeuda(o.tipo)?C.purple:C.muted,whiteSpace:"nowrap"}}>
                {o.tipo}{uso[o.gasto]?` · ${uso[o.gasto]}`:""}
              </span>
            </div>
          ))}
          {nuevo&&(
            <div onMouseDown={e=>{e.preventDefault();elegir(res.length);}} onMouseEnter={()=>setIdx(res.length)}
              style={{padding:"9px 13px",cursor:"pointer",fontSize:13,background:idx===res.length?C.indigoL:"transparent",color:C.indigo,fontWeight:600}}>
              + Usar «{q.trim()}» como concepto nuevo
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Gastos({ gastos, setGastos, logBit }) {
  const [show,      setShow]      = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [form,      setForm]      = useState(gastoEmpty());
  const [filt,      setFilt]      = useState({tipo:"todo",valor:""});
  const [filtTipo,  setFiltTipo]  = useState("");
  const [showReemb, setShowReemb] = useState(false);
  const [reemb,     setReemb]     = useState({ socio:"", fecha:todayStr(), monto:"", origen:"Efectivo SAJI" });
  const sf = (k,v) => setForm(f=>{
    const n={...f,[k]:v};

    return n;
  });

  const openNew  = () => { setEditId(null); setForm(gastoEmpty()); setShow(true); };
  const openEdit = g => { setEditId(g.id); setForm({tipoGasto:g.tipoGasto||"Alquiler Inmuebles",gasto:g.gasto,fecha:g.fecha,pagadoPor:fuenteDe(g),metodoPago:g.metodoPago||"Efectivo",estatusPago:g.estatusPago||"pagado",monto:String(g.monto)}); setShow(true); };
  const guardar  = () => {
    if(!form.gasto||!form.monto) return alert("Completa descripción y monto");
    const reg = { id:editId||Date.now(), semana:weekOf(form.fecha), dia:dayOf(form.fecha), mes:monthOf(form.fecha), ...form, monto:parseFloat(form.monto) };
    if(editId) { setGastos(gs=>gs.map(g=>g.id===editId?reg:g)); logBit("Editó gasto",`${reg.gasto} · ${fmt(reg.monto)}`); }
    else { setGastos(gs=>[reg,...gs]); logBit("Nuevo gasto",`${reg.gasto} · ${fmt(reg.monto)}`); }
    setShow(false);
  };

  const cols=[
    {l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},
    {l:"Gasto",k:"gasto"},{l:"Tipo Gasto",k:"tipoGasto"},{l:"Pagado por",k:"_f"},
    {l:"Estatus",k:"estatusPago"},{l:"Total",k:"monto"}
  ];
  const listaFecha = applyFilter(gastos.filter(g=>!esReembolso(g)), filt);
  const lista = (filtTipo ? listaFecha.filter(g=>g.tipoGasto===filtTipo) : listaFecha).slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  const total     = lista.reduce((s,g)=>s+num(g.monto),0);          // todo lo que salió
  const totalDeuda= lista.filter(g=>esDeuda(g.tipoGasto)).reduce((s,g)=>s+num(g.monto),0);
  const gastoReal = total - totalDeuda;                              // lo que sí resta en la utilidad
  const porPagar = lista.filter(g=>g.estatusPago==="porpagar").reduce((s,g)=>s+g.monto,0);
  // Cuenta con cada socio: lo que puso de su bolsa menos lo ya reembolsado.
  // Es acumulado, no depende del filtro de fechas: es una deuda viva.
  const cuentaSocio = soc => {
    const puesto = gastos.filter(g=>!esReembolso(g) && fuenteDe(g)===soc).reduce((s,g)=>s+num(g.monto),0);
    const devuelto = gastos.filter(g=>esReembolso(g) && g.socio===soc).reduce((s,g)=>s+num(g.monto),0);
    return { puesto, devuelto, saldo: puesto-devuelto };
  };
  const haySocios = SOCIOS.some(s2=>cuentaSocio(s2).puesto>0);

  const guardarReembolso = () => {
    if(!reemb.socio||!reemb.monto) return alert("Elige el socio y el monto");
    const reg = { id:Date.now(), tipo:"reembolso", socio:reemb.socio, fecha:reemb.fecha,
      monto:parseFloat(reemb.monto), pagadoPor:reemb.origen, gasto:`Reembolso a ${reemb.socio}`,
      tipoGasto:"Reembolso", estatusPago:"pagado",
      semana:weekOf(reemb.fecha), dia:dayOf(reemb.fecha), mes:monthOf(reemb.fecha) };
    setGastos(gs=>[reg,...gs]);
    logBit("Reembolso a socio",`${reemb.socio} · ${fmt(reg.monto)}`);
    setShowReemb(false);
  };

  // Los 6 conceptos que más registra, para capturar de un toque
  const frecuentes = (()=>{
    const c={};
    gastos.forEach(g=>{ if(g.gasto) c[g.gasto]=(c[g.gasto]||0)+1; });
    return Object.entries(c).sort((a,b)=>b[1]-a[1]).slice(0,6)
      .map(([gasto])=>({ gasto, tipo:(gastos.find(x=>x.gasto===gasto)||{}).tipoGasto || "Otros Gastos" }));
  })();

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <div>
          <h2 style={{...h2s,margin:0}}>💸 Gastos</h2>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>
            Gasto real: <strong style={{color:C.red}}>{fmt(gastoReal)}</strong>
            {totalDeuda>0&&<span> · Pagos de deuda: <strong style={{color:C.purple}}>{fmt(totalDeuda)}</strong></span>}
            {porPagar>0&&<span> · Por pagar: <strong style={{color:C.amber}}>{fmt(porPagar)}</strong></span>}
          </div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button style={btn(C.blue)} onClick={()=>exportCSV(lista.map(g=>({...g,_f:fuenteDe(g)})),cols,`gastos-${todayStr()}.csv`)}>⬇ CSV</button>
          <button style={btnO(C.purple)} onClick={()=>{ setReemb({socio:"",fecha:todayStr(),monto:"",origen:"Efectivo SAJI"}); setShowReemb(true); }}>Reembolso a socio</button>
          <button style={btn(C.red)} onClick={openNew}>+ Nuevo Gasto</button>
        </div>
      </div>
      <FilterBar filter={filt} setFilter={setFilt} count={lista.length}/>

      {/* Lo que SAJI les debe a los socios */}
      {haySocios&&(
        <div style={{...card,marginBottom:14}}>
          <h3 style={h3s}>Cuenta con socios</h3>
          <div style={{fontSize:11,color:C.muted,marginTop:-8,marginBottom:10}}>
            Gastos que pusieron de su bolsa y todavía no se les reembolsan. No son gasto aparte, ya están contados arriba.
          </div>
          {SOCIOS.map(soc=>{
            const c2 = cuentaSocio(soc);
            if(!c2.puesto) return null;
            return (
              <div key={soc} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"10px 0",borderBottom:"1px solid #f0f2ee"}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>{soc}</div>
                  <div style={{fontSize:11,color:C.muted}}>Puso {fmt(c2.puesto)} · Reembolsado {fmt(c2.devuelto)}</div>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0}}>
                  <strong style={{color:c2.saldo>0?C.purple:C.green,fontSize:15}}>
                    {c2.saldo>0?fmt(c2.saldo):"Al día"}
                  </strong>
                  {c2.saldo>0&&(
                    <button style={{...btnO(C.purple),padding:"4px 10px",fontSize:11}}
                      onClick={()=>{ setReemb({socio:soc,fecha:todayStr(),monto:String(c2.saldo),origen:"Efectivo SAJI"}); setShowReemb(true); }}>Reembolsar</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Resumen por tipo */}
      {(()=>{
        const totalGeneral = listaFecha.reduce((s,g)=>s+(parseFloat(g.monto)||0),0);
        const porTipo = Object.keys(TIPOS_GASTO).map(tipo=>{
          const suma = listaFecha.filter(g=>g.tipoGasto===tipo).reduce((s,g)=>s+(parseFloat(g.monto)||0),0);
          return { tipo, suma };
        }).filter(x=>x.suma>0).sort((a,b)=>b.suma-a.suma);
        if(porTipo.length===0) return null;
        return (
          <div style={{...card,marginBottom:12,padding:"14px 16px"}}>
            <div style={{fontWeight:700,fontSize:13,color:C.text,marginBottom:12}}>📊 Resumen por tipo de gasto</div>
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {porTipo.map(({tipo,suma})=>{
                const pct = totalGeneral>0 ? (suma/totalGeneral*100).toFixed(1) : "0.0";
                return (
                  <div key={tipo} style={{display:"flex",alignItems:"center",gap:10,cursor:"pointer",padding:"4px 0"}} onClick={()=>setFiltTipo(filtTipo===tipo?"":tipo)}>
                    <div style={{flex:1,fontSize:13,fontWeight:filtTipo===tipo?700:400,color:filtTipo===tipo?C.indigo:C.text}}>{tipo}</div>
                    <div style={{fontSize:13,fontWeight:600,color:C.red}}>{fmt(suma)}</div>
                    <div style={{fontSize:12,color:C.muted,minWidth:42,textAlign:"right"}}>{pct}%</div>
                  </div>
                );
              })}
              <div style={{borderTop:`1px solid ${C.border}`,marginTop:4,paddingTop:8,display:"flex",justifyContent:"space-between"}}>
                <span style={{fontSize:12,fontWeight:700}}>Total</span>
                <span style={{fontSize:14,fontWeight:800,color:C.red}}>{fmt(totalGeneral)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:12,boxShadow:C.shadow,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:C.muted,fontSize:12,fontWeight:700}}>🏷️ Tipo:</span>
        <button style={nb(!filtTipo)} onClick={()=>setFiltTipo("")}>Todos</button>
        {Object.keys(TIPOS_GASTO).map(t=>(
          <button key={t} style={nb(filtTipo===t)} onClick={()=>setFiltTipo(t)}>{t}</button>
        ))}
      </div>
      <div style={card}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Sem","Día","Mes","Fecha","Descripción","Tipo Gasto","Método Pago","Total",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.length===0&&<tr><td colSpan={9} style={{...td,textAlign:"center",color:C.muted,padding:28}}>Sin gastos en este período 💸</td></tr>}
              {lista.map(g=>(
                <tr key={g.id}>
                  <td style={td}>{g.semana}</td><td style={td}>{g.dia}</td><td style={td}>{g.mes}</td>
                  <td style={td}>{fmtDate(g.fecha)}</td>
                  <td style={{...td,fontWeight:600}}>{g.gasto}</td>
                  <td style={td}><span style={badge(C.amber,C.amberL)}>{g.tipoGasto}</span></td>
                  <td style={{...td,fontSize:12}}>{g.metodoPago}</td>
                  <td style={td}><strong style={{color:C.red}}>{fmt(g.monto)}</strong></td>
                  <td style={td}>
                    <div style={{display:"flex",gap:4}}>
                      <button style={{...btn(C.blue),padding:"4px 9px",fontSize:11}} onClick={()=>openEdit(g)}>✎</button>
                      <button style={{...btn(C.red),padding:"4px 9px",fontSize:11}} onClick={()=>{ if(window.confirm(`¿Eliminar este gasto?\n\n${g.gasto} · ${fmt(g.monto)}\n\nEsta acción no se puede deshacer.`)) { setGastos(gs=>gs.filter(x=>x.id!==g.id)); logBit("Eliminó gasto",`${g.gasto} · ${fmt(g.monto)}`); } }}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {showReemb&&(
        <div style={modal} onClick={()=>setShowReemb(false)}>
          <div style={{...mbox,maxWidth:440}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,fontSize:17,color:C.purple}}>Reembolso a socio</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShowReemb(false)}>×</button>
            </div>
            <div style={{background:C.purpleL,borderRadius:10,padding:"9px 12px",fontSize:12,color:C.purple,marginBottom:14}}>
              Devolverle a un socio lo que puso de su bolsa. No cuenta como gasto, solo baja lo que SAJI le debe.
            </div>
            <div style={g2}>
              <div><label style={lbl}>Socio *</label>
                <select style={sel} value={reemb.socio} onChange={e=>setReemb(r=>({...r,socio:e.target.value}))}>
                  <option value="">— Elegir —</option>
                  {SOCIOS.map(s2=><option key={s2}>{s2}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Fecha</label>
                <input type="date" style={inp} value={reemb.fecha} onChange={e=>setReemb(r=>({...r,fecha:e.target.value}))}/>
              </div>
              <div><label style={lbl}>Monto *</label>
                <input type="number" inputMode="decimal" style={inp} placeholder="0.00" value={reemb.monto} onChange={e=>setReemb(r=>({...r,monto:e.target.value}))}/>
              </div>
              <div><label style={lbl}>¿De dónde sale?</label>
                <select style={sel} value={reemb.origen} onChange={e=>setReemb(r=>({...r,origen:e.target.value}))}>
                  <option>Efectivo SAJI</option><option>Banco SAJI</option>
                </select>
              </div>
            </div>
            {reemb.socio&&(
              <div style={{fontSize:12,color:C.muted,marginTop:10}}>
                Saldo actual de {reemb.socio}: <strong style={{color:C.purple}}>{fmt(cuentaSocio(reemb.socio).saldo)}</strong>
                {num(reemb.monto)>0&&<> · quedaría en <strong>{fmt(cuentaSocio(reemb.socio).saldo-num(reemb.monto))}</strong></>}
              </div>
            )}
            <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setShowReemb(false)}>Cancelar</button>
              <button style={btn(C.purple)} onClick={guardarReembolso}>Registrar reembolso</button>
            </div>
          </div>
        </div>
      )}

      {show&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:500}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.green}}>{editId?"✏️ Editar":"💸 Nuevo"} Gasto</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShow(false)}>×</button>
            </div>
            {/* Atajos a lo que más registras */}
            {frecuentes.length>0&&!editId&&(
              <div style={{marginBottom:14}}>
                <label style={lbl}>Rápido</label>
                <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                  {frecuentes.map(f2=>(
                    <button key={f2.gasto} style={nb(form.gasto===f2.gasto)}
                      onClick={()=>setForm(x=>({...x,gasto:f2.gasto,tipoGasto:f2.tipo}))}>{f2.gasto}</button>
                  ))}
                </div>
              </div>
            )}
            <div style={{marginBottom:14}}>
              <label style={lbl}>¿Qué gasto es? *</label>
              <ComboGasto valor={form.gasto} historial={gastos}
                onElegir={(g,t)=>setForm(x=>({...x, gasto:g, tipoGasto:t||x.tipoGasto}))}/>
              {form.gasto&&(
                <div style={{display:"flex",alignItems:"center",gap:8,marginTop:8,flexWrap:"wrap"}}>
                  <span style={{fontSize:11,color:C.muted}}>Categoría:</span>
                  <select style={{...sel,width:"auto",padding:"5px 10px",fontSize:12}} value={form.tipoGasto} onChange={e=>setForm(x=>({...x,tipoGasto:e.target.value}))}>
                    {Object.keys(TIPOS_GASTO).map(t=><option key={t}>{t}</option>)}
                  </select>
                  {esDeuda(form.tipoGasto)&&(
                    <span style={{fontSize:11,color:C.purple,fontWeight:600}}>Pago de deuda, no resta en la utilidad</span>
                  )}
                </div>
              )}
            </div>
            <div style={g2}>
              <div><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.fecha} onChange={e=>sf("fecha",e.target.value)}/></div>
              <div><label style={lbl}>Monto *</label>
                <input type="number" inputMode="decimal" style={inp} placeholder="0.00" value={form.monto} onChange={e=>sf("monto",e.target.value)}/>
              </div>
              <div><label style={lbl}>¿Quién lo pagó? *</label>
                <select style={sel} value={form.pagadoPor||fuenteDe(form)} onChange={e=>sf("pagadoPor",e.target.value)}>
                  {FUENTES.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Estatus con el proveedor</label>
                <select style={sel} value={form.estatusPago} onChange={e=>sf("estatusPago",e.target.value)}>
                  <option value="pagado">✅ Pagado</option><option value="porpagar">⏳ Por pagar</option>
                </select>
              </div>
              {SOCIOS.includes(form.pagadoPor||fuenteDe(form))&&(
                <div style={{gridColumn:"1/-1",background:C.purpleL,border:`1px solid ${C.purple}33`,borderRadius:10,padding:"9px 12px",fontSize:12,color:C.purple,fontWeight:600}}>
                  Lo puso {form.pagadoPor} de su bolsa. SAJI le queda debiendo {fmt(num(form.monto))} hasta que se le reembolse.
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setShow(false)}>Cancelar</button>
              <button style={btn(C.red)} onClick={()=>{
                const finalGasto = (form.gasto||"").trim();
                if(!finalGasto||!form.monto) return alert("Completa todos los campos");
                const reg = { id:editId||Date.now(), semana:weekOf(form.fecha), dia:dayOf(form.fecha), mes:monthOf(form.fecha), ...form, gasto:finalGasto, monto:parseFloat(form.monto), pagadoPor: form.pagadoPor||fuenteDe(form), estatusPago: form.estatusPago||"pagado" };
                if(editId) { setGastos(gs=>gs.map(g=>g.id===editId?reg:g)); logBit("Editó gasto",`${finalGasto} · ${fmt(parseFloat(form.monto))}`); }
                else { setGastos(gs=>[reg,...gs]); logBit("Nuevo gasto",`${finalGasto} · ${fmt(parseFloat(form.monto))}`); }
                setShow(false);
              }}>💾 Guardar Gasto</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════════════════
// ─── Unidades de compra ───────────────────────────────────────────────────────
// Los proveedores venden a granel (kg/L) o por bulto. Guardamos ambas cosas para
// poder convertir todo a kilos y sacar el costo real por kilo.
const UNIDADES_COMPRA = [
  { id:"kg",      label:"Kilos (granel)", kg:1  },
  { id:"litro",   label:"Litros",         kg:1  },
  { id:"caja",    label:"Caja",           kg:20 },
  { id:"arpilla", label:"Arpilla",        kg:29 },
  { id:"malla",   label:"Malla",          kg:20 },
  { id:"reja",    label:"Reja",           kg:20 },
  { id:"costal",  label:"Costal",         kg:50 },
  { id:"pieza",   label:"Pieza",          kg:1  },
];
// Una compra es fruta para revender, o insumo (envases, etiquetas, empaque).
// El insumo también es costo de ventas, pero no se vende por sí mismo: no
// puede costearse por kilo contra un producto, así que se suma aparte.
const esInsumo = c => c.clase === "Insumo";
const esGranel = u => !u || u==="kg" || u==="litro" || u==="pieza";
// Kilos reales de una compra (las compras viejas no traen unidad: son granel)
const kgCompra = c => {
  const cant = num(c.cantidad);
  return esGranel(c.unidad) ? cant : cant * (num(c.kgBulto) || 1);
};
// Costo por kilo de una compra
const costoKgCompra = c => { const k = kgCompra(c); return k ? (num(c.total) - k*num(c.deudaKg))/k : 0; };
// Unidad que se muestra en una compra: los insumos van por pieza
const uniCompra = c => c.unidad==="pieza" ? "pz" : (c.unidad==="litro" ? "L" : uni(c.producto));

// Costo promedio móvil por producto: promedio ponderado de todo lo comprado
// hasta esa fecha. Sin lotes es lo más fiel que se puede calcular.
const costoPromedio = (compras, producto, hasta) => {
  let kg=0, mx=0, kgTot=0, mxTot=0;
  (compras||[]).forEach(c=>{
    if(c.tipo || esInsumo(c) || c.producto!==producto) return;
    kgTot += kgCompra(c); mxTot += costoMercancia(c);
    if(hasta && (c.fecha||"") > hasta) return;
    kg += kgCompra(c); mx += costoMercancia(c);
  });
  if(kg) return mx/kg;
  // Venta anterior a la primera compra registrada: usamos el promedio general
  // del producto en lugar de dejar el costo en cero.
  return kgTot ? mxTot/kgTot : 0;
};

// Sobreprecio por kilo que algunos proveedores cobran para abonar a una deuda
// anterior. NO es costo del producto: se paga al proveedor pero no encarece la
// mercancía, así que va separado para que el margen no salga distorsionado.
const deudaDeCompra = c => kgCompra(c) * num(c.deudaKg);
const costoMercancia = c => num(c.total) - deudaDeCompra(c);

const itemCompra = () => ({ producto:"", calibre:"", unidad:"kg", kgBulto:"", cantidad:"", precio:"", deudaKg:"" });
// Kilos reales de un renglón del formulario
const kgItem = it => esGranel(it.unidad) ? num(it.cantidad) : num(it.cantidad)*(num(it.kgBulto)||1);

const frutaEmpty = () => ({ fecha:todayStr(), proveedor:"", items:[itemCompra()], destino:"Normal", clase:"Fruta", factura:"", fechaFactura:"", metodoPago:"Efectivo", estatusPago:"pagado" });

function Fruta({ fruta, setFruta, productos, proveedores, logBit }) {
  const [showComp, setShowComp] = useState(false);
  const [showPago, setShowPago] = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState(frutaEmpty());
  const [pagoForm, setPagoForm] = useState({ proveedor:"", fecha:todayStr(), monto:"", metodoPago:"Efectivo" });
  const [filt,        setFilt]        = useState({tipo:"todo",valor:""});
  const [filtProv,    setFiltProv]    = useState("");
  const [activeProv,  setActiveProv]  = useState(null);

  const sf = (k,v) => setForm(f=>{
    const n={...f,[k]:v};
    if(k==="producto" && v!==f.producto){ const p=productos.find(x=>x.nombre===v); n.calibre=p?.calibres[0]||""; }
    if(k==="metodoPago") n.estatusPago = v==="Efectivo" ? "pagado" : "porpagar";
    if(k==="unidad"){
      const u = UNIDADES_COMPRA.find(x=>x.id===v);
      n.kgBulto = esGranel(v) ? "" : String(n.kgBulto || u?.kg || "");
    }
    return n;
  });
  const sfp = (k,v) => setPagoForm(f=>({...f,[k]:v}));

  // Una compra puede traer varios productos. Cada renglón se guarda como su
  // propio registro (así siguen funcionando costos, saldos y reportes), pero
  // todos comparten un mismo folio para saber que entraron juntos.
  const guardarCompra = () => {
    if(!form.proveedor) return alert("Elige el proveedor");
    const items = (form.items||[]).filter(it=>it.producto||it.cantidad||it.precio);
    if(!items.length) return alert("Agrega al menos un producto");
    const malo = items.find(it=>!it.producto||!num(it.cantidad)||!num(it.precio)
      || (!esGranel(it.unidad) && !num(it.kgBulto)));
    if(malo) return alert("Cada producto necesita producto, cantidad, precio y, si viene en bultos, los kilos por bulto.");

    const comun = {
      fecha:form.fecha, proveedor:form.proveedor, clase:form.clase||"Fruta", destino:form.destino||"Normal",
      metodoPago:form.metodoPago, factura:form.factura, fechaFactura:form.fechaFactura,
      estatusPago: form.metodoPago==="Efectivo" ? "pagado" : (form.estatusPago||"porpagar"),
      semana:weekOf(form.fecha), dia:dayOf(form.fecha), mes:monthOf(form.fecha),
    };
    const folio = editId ? (form.compraId||null) : `k${Date.now()}`;
    const regs = items.map((it,i)=>{
      const kgs = kgItem(it);
      return {
        ...comun, id: editId || `${Date.now()}-${i}`, compraId: folio,
        producto:it.producto, calibre:it.calibre||"",
        unidad:it.unidad||"kg", kgBulto: esGranel(it.unidad)?1:(num(it.kgBulto)||1),
        cantidad:num(it.cantidad), precio:num(it.precio), deudaKg:num(it.deudaKg),
        // Lo que se le paga al proveedor: mercancía + abono a deuda anterior
        total: num(it.cantidad)*num(it.precio) + kgs*num(it.deudaKg),
      };
    });
    // Marcar una compra como pagada registra el pago al proveedor, para que el
    // saldo cuadre. Si se regresa a "por pagar", ese pago se elimina.
    const pagoDe = r => ({ id:`pc${r.id}`, tipo:"pago", pagoDeCompra:r.id, proveedor:r.proveedor,
      fecha:r.fecha, monto:r.total, metodoPago:r.metodoPago||"Efectivo" });

    if(editId){
      const antes = compras.find(c=>c.id===editId) || {};
      const eraPagada = antes.estatusPago==="pagado";
      const esPagada  = regs[0].estatusPago==="pagado";
      setFruta(fs=>{
        let out = fs.map(f=>f.id===editId?regs[0]:f);
        out = out.filter(f=>f.pagoDeCompra!==editId);          // quita el pago anterior
        if(esPagada) out = [pagoDe(regs[0]),...out];           // y lo vuelve a poner si sigue pagada
        return out;
      });
      setEditId(null);
      logBit("Editó compra",`${regs[0].proveedor} · ${regs[0].producto} · ${fmt(regs[0].total)}`);
      if(esPagada && !eraPagada) logBit("Pago a proveedor",`${regs[0].proveedor} · ${fmt(regs[0].total)} (compra marcada como pagada)`);
    } else {
      const pagos = comun.estatusPago==="pagado" ? regs.map(pagoDe) : [];
      setFruta(fs=>[...pagos,...regs,...fs]);
      const tot = regs.reduce((s,r)=>s+r.total,0);
      logBit("Nueva compra",`${comun.proveedor} · ${regs.length} producto${regs.length===1?"":"s"} · ${fmt(tot)}`);
      if(pagos.length) logBit("Pago a proveedor",`${comun.proveedor} · ${fmt(tot)} (compra pagada de contado)`);
    }
    setForm(frutaEmpty()); setShowComp(false);
  };

  const setItem = (i,k,v) => setForm(f=>{
    const items = f.items.map((it,j)=>{
      if(j!==i) return it;
      const n = {...it,[k]:v};
      if(k==="producto" && v!==it.producto){ const p2=productos.find(x=>x.nombre===v); n.calibre=p2?.calibres[0]||""; }
      if(k==="unidad"){ const u=UNIDADES_COMPRA.find(x=>x.id===v); n.kgBulto = esGranel(v) ? "" : String(n.kgBulto || u?.kg || ""); }
      return n;
    });
    return {...f, items};
  });
  const addItem = () => setForm(f=>({...f, items:[...f.items, itemCompra()]}));
  const delItem = i => setForm(f=>({...f, items:f.items.filter((_,j)=>j!==i)}));
  const totalForm = (form.items||[]).reduce((s,it)=>s+num(it.cantidad)*num(it.precio)+kgItem(it)*num(it.deudaKg),0);

  const abrirCompra = c => {
    setEditId(c.id);
    setForm({...c, destino:c.destino||"Normal", clase:c.clase||"Fruta",
      items:[{ producto:c.producto, calibre:c.calibre||"", unidad:c.unidad||"kg",
               kgBulto:String(c.kgBulto||""), cantidad:String(c.cantidad),
               precio:String(c.precio), deudaKg:String(c.deudaKg||"") }]});
    setShowComp(true);
  };
  const borrarCompra = c => {
    if(!window.confirm(`¿Eliminar esta compra?\n\n${c.proveedor} · ${c.producto} · ${fmtDate(c.fecha)}\n${fmt(c.total)}\n\nEsta acción no se puede deshacer.`)) return;
    setFruta(fs=>fs.filter(x=>x.id!==c.id && x.pagoDeCompra!==c.id));
    logBit("Eliminó compra fruta",`${c.proveedor} · ${c.producto} · ${fmt(c.total)}`);
  };

  const guardarPago = () => {
    if(!pagoForm.proveedor||!pagoForm.monto) return alert("Completa proveedor y monto");
    const pago = { ...pagoForm, id:Date.now(), monto:parseFloat(pagoForm.monto), tipo:"pago" };
    setFruta(fs=>[pago,...fs]);
    logBit("Pago a proveedor fruta",`${pagoForm.proveedor} · ${fmt(parseFloat(pagoForm.monto))}`);
    setPagoForm({ proveedor:"", fecha:todayStr(), monto:"", metodoPago:"Efectivo" }); setShowPago(false);
  };

  const compras = fruta.filter(f=>!f.tipo);
  const pagosF  = fruta.filter(f=>f.tipo==="pago");
  // "Gutierrez", "Gutiérrez" y "GUTIERREZ " son el mismo proveedor: comparamos
  // sin acentos, sin mayúsculas y sin espacios de sobra.
  const mismoProv = (a,b) => sinAcentos(a)===sinAcentos(b);
  const listaFechaFruta = applyFilter(compras, filt);
  const listaComp = (filtProv ? listaFechaFruta.filter(c=>mismoProv(c.proveedor,filtProv)) : listaFechaFruta).slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));

  // Proveedores con movimientos: compras o pagos. Se incluyen los que solo
  // tienen pagos para que ningún movimiento quede invisible.
  const existingProveedores = (()=>{
    const vistos = new Map();   // clave normalizada -> nombre tal como se escribió
    compras.forEach(c=>{ const k=sinAcentos(c.proveedor); if(c.proveedor&&!vistos.has(k)) vistos.set(k,c.proveedor); });
    pagosF .forEach(p=>{ const k=sinAcentos(p.proveedor); if(p.proveedor&&!vistos.has(k)) vistos.set(k,p.proveedor); });
    return [...vistos.values()];
  })();
  const saldoProveedor = prov => {
    const totalCompras = compras.filter(c=>mismoProv(c.proveedor,prov)).reduce((s,c)=>s+num(c.total),0);
    const totalPagos   = pagosF .filter(p=>mismoProv(p.proveedor,prov)).reduce((s,p)=>s+num(p.monto),0);
    return { totalCompras, totalPagos, pendiente:totalCompras-totalPagos };
  };

  const cols=[
    {l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},
    {l:"Proveedor",k:"proveedor"},{l:"Producto",k:"producto"},{l:"Calibre",k:"calibre"},
    {l:"Cantidad",k:"cantidad"},{l:"Unidad",k:"unidad"},{l:"Kg por bulto",k:"kgBulto"},{l:"Kilos",k:"_kg"},{l:"Precio",k:"precio"},{l:"Costo por kilo",k:"_ck"},{l:"Clase",k:"clase"},{l:"Tipo",k:"destino"},{l:"Deuda $/kg",k:"deudaKg"},{l:"Abono deuda",k:"_de"},{l:"Total",k:"total"},
    {l:"Factura",k:"factura"},{l:"Fecha Factura",k:"fechaFactura"}
  ];
  const getCals = nombre => productos.find(p=>p.nombre===nombre)?.calibres||[];
  // Merge catalog proveedores + any already used in compras
  const allProveedores = [...new Set([...proveedores,...existingProveedores])];

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <div>
          <h2 style={{...h2s,margin:0}}>🚚 Proveedor — Compras e Inventario</h2>
          {(()=>{
            const totalC=compras.reduce((s,c)=>s+c.total,0);
            const totalP=pagosF.reduce((s,p)=>s+p.monto,0);
            const porPagar=Math.max(0,totalC-totalP);
            return (
              <div className="saji-minikpis" style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:6}}>
                <div style={{background:C.tealL,border:`1px solid ${C.teal}33`,borderRadius:9,padding:"8px 16px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:110}}>
                  <span style={{fontSize:10,color:C.teal,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Total comprado</span>
                  <span style={{fontSize:17,fontWeight:800,color:C.teal}}>{fmt(totalC)}</span>
                </div>
                <div style={{background:C.greenL,border:`1px solid ${C.green}33`,borderRadius:9,padding:"8px 16px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:110}}>
                  <span style={{fontSize:10,color:C.green,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Total pagado</span>
                  <span style={{fontSize:17,fontWeight:800,color:C.green}}>{fmt(totalP)}</span>
                </div>
                <div style={{background:porPagar>0?C.redL:C.greenL,border:`1px solid ${porPagar>0?C.red:C.green}33`,borderRadius:9,padding:"8px 16px",display:"flex",flexDirection:"column",alignItems:"center",minWidth:110}}>
                  <span style={{fontSize:10,color:porPagar>0?C.red:C.green,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>Por pagar</span>
                  <span style={{fontSize:17,fontWeight:800,color:porPagar>0?C.red:C.green}}>{porPagar>0?fmt(porPagar):"✅ Al corriente"}</span>
                </div>
              </div>
            );
          })()}
        </div>
        <div className="saji-acciones" style={{display:"flex",gap:7}}>
          <button style={btn(C.blue)} onClick={()=>exportCSV(listaComp.map(c=>({...c,_kg:kgCompra(c),_ck:costoKgCompra(c).toFixed(2),_de:deudaDeCompra(c).toFixed(2)})),cols,`compras-${todayStr()}.csv`)}>⬇ CSV</button>
          <button style={btnO(C.muted)} onClick={()=>document.getElementById("impProvJSON").click()}>⬆ Importar</button>
          <button style={btn(C.teal)} onClick={()=>{ setPagoForm({ proveedor:"", fecha:todayStr(), monto:"", metodoPago:"Efectivo" }); setShowPago(true); }}>💳 Pago a Proveedor</button>
          <button style={btn()} onClick={()=>{ setEditId(null); setForm(frutaEmpty()); setShowComp(true); }}>+ Nueva Compra</button>
        </div>
      </div>

      <input id="impProvJSON" type="file" accept=".json" style={{display:"none"}} onChange={async e=>{
        const file=e.target.files?.[0]; if(!file) return;
        try{
          const d=JSON.parse(await file.text());
          const comp=(d.compras||[]).map((c,i)=>({
            ...c, id:c.id||`c${Date.now()}${i}`,
            cantidad:num(c.cantidad), precio:num(c.precio),
            kgBulto:esGranel(c.unidad)?1:(num(c.kgBulto)||1),
            deudaKg:num(c.deudaKg), destino:c.destino||"Normal", clase:c.clase||"Fruta",
            total:num(c.total)||num(c.cantidad)*num(c.precio),
            semana:c.semana||weekOf(c.fecha), dia:c.dia||dayOf(c.fecha), mes:c.mes||monthOf(c.fecha),
          }));
          const pag=(d.abonos||d.pagos||[]).map((p,i)=>({
            ...p, id:p.id||`p${Date.now()}${i}`, monto:num(p.monto), tipo:"pago",
            metodoPago:p.metodoPago||"Transferencia SAJI",
          }));
          if(window.confirm(`¿Importar ${comp.length} compras y ${pag.length} abonos?\n\nEsto REEMPLAZA todo lo que hay en Proveedor.`)){
            setFruta([...comp,...pag]);
            logBit("Importó proveedores",`${comp.length} compras · ${pag.length} abonos`);
          }
        }catch(err){ alert("No se pudo leer el archivo: "+err.message); }
        e.target.value="";
      }}/>

      {/* Saldo por proveedor */}
      {existingProveedores.length>0&&(
        <div style={card}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:12}}>💰 Saldo por Proveedor</div>
          <div className="saji-cards">
            {existingProveedores.map(prov=>{
              const s2=saldoProveedor(prov);
              return (
                <div key={prov} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,padding:"11px 2px",borderBottom:"1px solid #f0f2ee"}}>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:700,fontSize:14}}>{prov}</div>
                    <div style={{fontSize:11,color:C.muted}}>Compras {fmt(s2.totalCompras)} · Pagado {fmt(s2.totalPagos)}</div>
                  </div>
                  <strong style={{color:s2.pendiente>0?C.red:C.green,fontSize:15,whiteSpace:"nowrap"}}>
                    {s2.pendiente>0?fmt(s2.pendiente):"Al día"}
                  </strong>
                </div>
              );
            })}
          </div>
          <div className="saji-tabla-sm" style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>{["Proveedor","Compras","Pagado","Pendiente",""].map(h=><th key={h} style={{...th,padding:"7px 8px",fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>
                {existingProveedores.map(prov=>{
                  const s=saldoProveedor(prov);
                  const pagosProv = pagosF.filter(p=>mismoProv(p.proveedor,prov));
                  return (
                    <Fragment key={prov}>
                      <tr style={{background:C.bg}}>
                        <td style={{...td,fontWeight:700,padding:"8px 8px"}}>{prov}</td>
                        <td style={{...td,padding:"8px 8px"}}><strong style={{fontSize:12}}>{fmt(s.totalCompras)}</strong></td>
                        <td style={{...td,padding:"8px 8px"}}><span style={{color:C.green,fontWeight:700,fontSize:12}}>{fmt(s.totalPagos)}</span></td>
                        <td style={{...td,padding:"8px 8px"}}><span style={{color:s.pendiente>0?C.red:C.green,fontWeight:800,fontSize:13}}>{fmt(s.pendiente)}</span></td>
                        <td style={{...td,padding:"8px 8px"}}>
                          <button style={{...btnO(C.teal),padding:"4px 9px",fontSize:11,color:C.teal}} onClick={()=>setActiveProv(activeProv===prov?null:prov)}>
                            {activeProv===prov?"▲ Ocultar":`▼ Pagos (${pagosProv.length})`}
                          </button>
                        </td>
                      </tr>
                      {activeProv===prov&&(
                        pagosProv.length===0
                          ? <tr style={{background:"#f9fcfa"}}><td colSpan={5} style={{...td,paddingLeft:20,color:C.muted,fontSize:11}}>Sin pagos registrados</td></tr>
                          : pagosProv.map(pg=>(
                              <tr key={pg.id} style={{background:"#f0fff4"}}>
                                <td style={{...td,paddingLeft:20,color:C.muted,fontSize:11}} colSpan={1}>└ {fmtDate(pg.fecha)}</td>
                                <td style={{...td,fontSize:11}} colSpan={2}>
                                  {pg.metodoPago}
                                  {pg.pagoDeCompra&&<span style={{color:C.mutedL}}> · compra marcada pagada</span>}
                                </td>
                                <td style={{...td,color:C.green,fontWeight:600,fontSize:12}}>{fmt(pg.monto)}</td>
                                <td style={td}><button style={{...btn(C.red),padding:"3px 7px",fontSize:11}} onClick={()=>{
                                  if(!window.confirm(`¿Eliminar este pago?\n\n${pg.proveedor} · ${fmtDate(pg.fecha)} · ${fmt(pg.monto)}`)) return;
                                  setFruta(fs=>fs.filter(x=>x.id!==pg.id));
                                  logBit("Eliminó pago a proveedor",`${pg.proveedor} · ${fmt(pg.monto)}`);
                                }}>✕</button></td>
                              </tr>
                            ))
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Compras list */}
      <FilterBar filter={filt} setFilter={setFilt} count={listaComp.length}/>
      <div className="saji-chips" style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:12,boxShadow:C.shadow,gap:8,alignItems:"center"}}>
        <span style={{color:C.muted,fontSize:12,fontWeight:700,flexShrink:0}}>🚛 Proveedor:</span>
        <button style={nb(!filtProv)} onClick={()=>setFiltProv("")}>Todos</button>
        {allProveedores.map(p=>(
          <button key={p} style={nb(filtProv===p)} onClick={()=>setFiltProv(p)}>{p}</button>
        ))}
      </div>
      <div style={card}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📦 Registro de Compras</div>

        {/* En celular, una tarjeta por compra en lugar de la tabla ancha */}
        <div className="saji-cards">
          {listaComp.length===0&&<p style={{color:C.muted,textAlign:"center",padding:"22px 0",margin:0}}>Sin compras en este período</p>}
          {listaComp.map(c=>(
            <div key={c.id} onClick={()=>abrirCompra(c)} style={{padding:"12px 2px",borderBottom:"1px solid #f0f2ee",cursor:"pointer"}}>
              <div style={{display:"flex",justifyContent:"space-between",gap:8}}>
                <div style={{minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14}}>
                    {c.proveedor} · {c.producto}
                    {esInsumo(c)&&<span style={{...badge(C.teal,C.tealL),marginLeft:6}}>Insumo</span>}
                    {!esInsumo(c)&&c.destino&&c.destino!=="Normal"&&<span style={{...badge(C.purple,C.purpleL),marginLeft:6}}>{c.destino}</span>}
                  </div>
                  <div style={{fontSize:11,color:C.muted,marginTop:2}}>
                    {fmtDate(c.fecha)} · Sem {c.semana||weekOf(c.fecha)}{c.calibre?` · ${c.calibre}`:""}
                  </div>
                </div>
                <div style={{textAlign:"right",whiteSpace:"nowrap"}}>
                  <div style={{fontWeight:700,fontSize:14,color:C.teal}}>{fmt(c.total)}</div>
                  <div style={{fontSize:11,color:C.muted}}>{fmt(costoKgCompra(c))}/{uniCompra(c)}</div>
                </div>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:6,gap:8}}>
                <span style={{fontSize:12,color:C.muted}}>
                  {c.cantidad} {esGranel(c.unidad)?uni(c.producto):(UNIDADES_COMPRA.find(u=>u.id===c.unidad)?.label||c.unidad)} · {kgCompra(c).toLocaleString("es-MX",{maximumFractionDigits:1})} {uni(c.producto)}
                  {num(c.deudaKg)>0&&<span style={{color:C.purple}}> · deuda {fmt(deudaDeCompra(c))}</span>}
                </span>
                <button style={{...btnO(C.red),padding:"4px 12px",fontSize:11,flexShrink:0}}
                  onClick={e=>{ e.stopPropagation(); borrarCompra(c); }}>Eliminar</button>
              </div>
            </div>
          ))}
        </div>

        <div className="saji-tabla-sm" style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Fecha","Proveedor","Producto","Tipo","Cantidad","Kilos","Costo/kg","Total","Factura",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {listaComp.length===0&&<tr><td colSpan={10} style={{...td,textAlign:"center",color:C.muted,padding:28}}>Sin compras en este período 🛒</td></tr>}
              {listaComp.map((c,i)=>{
                // Los renglones de una misma compra se agrupan visualmente
                const mismaCompra = c.compraId && i>0 && listaComp[i-1].compraId===c.compraId;
                return (
                <tr key={c.id} onClick={()=>abrirCompra(c)} style={{cursor:"pointer"}}>
                  <td style={{...td,whiteSpace:"nowrap",borderTop:mismaCompra?"none":undefined}}>
                    {mismaCompra ? <span style={{color:C.mutedL}}>↳</span> : <>
                      {fmtDate(c.fecha)}
                      <div style={{fontSize:10.5,color:C.mutedL}}>{c.dia} · Sem {c.semana||weekOf(c.fecha)}</div>
                    </>}
                  </td>
                  <td style={{...td,fontWeight:700}}>{mismaCompra?"":c.proveedor}</td>
                  <td style={td}>
                    {pEmoji(c.producto)} {c.producto}
                    {c.calibre&&<div style={{fontSize:10.5,color:C.muted}}>{c.calibre}</div>}
                  </td>
                  <td style={td}>{esInsumo(c)?<span style={badge(C.teal,C.tealL)}>Insumo</span>:c.destino&&c.destino!=="Normal"?<span style={badge(C.purple,C.purpleL)}>{c.destino}</span>:"—"}</td>
                  <td style={{...td,whiteSpace:"nowrap"}}>
                    {esGranel(c.unidad)
                      ? `${c.cantidad} ${uniCompra(c)}`
                      : <>{c.cantidad} {UNIDADES_COMPRA.find(u=>u.id===c.unidad)?.label||c.unidad}{num(c.cantidad)===1?"":"s"}
                          <div style={{fontSize:10.5,color:C.muted}}>{fmt(c.precio)} c/u · {c.kgBulto} kg</div></>}
                  </td>
                  <td style={{...td,whiteSpace:"nowrap"}}>{kgCompra(c).toLocaleString("es-MX",{maximumFractionDigits:1})} {uniCompra(c)}</td>
                  <td style={td}><strong>{fmt(costoKgCompra(c))}</strong></td>
                  <td style={{...td,whiteSpace:"nowrap"}}>
                    <strong style={{color:C.teal}}>{fmt(c.total)}</strong>
                    {num(c.deudaKg)>0&&<div style={{fontSize:10.5,color:C.purple}}>incl. deuda {fmt(deudaDeCompra(c))}</div>}
                  </td>
                  <td style={td}>
                    {c.factura||"—"}
                    {c.fechaFactura&&<div style={{fontSize:10.5,color:C.muted}}>{fmtDate(c.fechaFactura)}</div>}
                  </td>
                  <td style={td}>
                    <button style={{...btnO(C.red),padding:"4px 10px",fontSize:11}}
                      onClick={e=>{ e.stopPropagation(); borrarCompra(c); }}>Eliminar</button>
                  </td>
                </tr>
              );})}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Compra */}
      {showComp&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:860}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <h3 style={{margin:0,color:C.green,fontSize:18}}>{editId?"Editar compra":"Nueva compra"}</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShowComp(false)}>×</button>
            </div>

            {/* 1. Datos de la compra */}
            <div style={secTit}>Datos de la compra</div>
            <div style={g3}>
              <div><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.fecha} onChange={e=>sf("fecha",e.target.value)}/></div>
              <div><label style={lbl}>Proveedor *</label>
                <select style={sel} value={form.proveedor} onChange={e=>sf("proveedor",e.target.value)}>
                  <option value="">— Seleccionar proveedor —</option>
                  {allProveedores.map(p2=><option key={p2} value={p2}>{p2}</option>)}
                </select>
              </div>
              <div><label style={lbl}>¿Qué estás comprando?</label>
                <select style={sel} value={form.clase||"Fruta"} onChange={e=>sf("clase",e.target.value)}>
                  <option value="Fruta">Fruta para vender</option>
                  <option value="Insumo">Insumo o empaque</option>
                </select>
              </div>
            </div>

            {/* 2. Productos */}
            <div style={{...secTit,marginTop:20,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
              <span>Productos {editId&&<span style={{fontWeight:400,color:C.muted,fontSize:11}}>· al editar se modifica solo este renglón</span>}</span>
              {!editId&&<button style={{...btnO(C.teal),padding:"5px 12px",fontSize:12}} onClick={addItem}>+ Agregar producto</button>}
            </div>
            {(form.items||[]).map((it,i)=>{
              const kgs = kgItem(it), merc = num(it.cantidad)*num(it.precio), deu = kgs*num(it.deudaKg);
              const unidadTxt = it.unidad==="pieza" ? "pz" : uni(it.producto);
              return (
                <div key={i} style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:14,padding:"12px 14px",marginBottom:10}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
                    <strong style={{fontSize:12,color:C.muted}}>Producto {i+1}</strong>
                    {(form.items.length>1)&&<button style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:18,fontWeight:700,lineHeight:1}} onClick={()=>delItem(i)}>×</button>}
                  </div>
                  <div style={g3}>
                    <div><label style={lbl}>Producto *</label>
                      <select style={sel} value={it.producto} onChange={e=>setItem(i,"producto",e.target.value)}>
                        <option value="">— Seleccionar —</option>
                        {[...new Set([...productos.map(p2=>p2.nombre),...compras.map(c=>c.producto),it.producto].filter(Boolean))].sort()
                          .map(n=><option key={n}>{n}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Calibre</label>
                      <select style={sel} value={it.calibre||""} onChange={e=>setItem(i,"calibre",e.target.value)} disabled={!it.producto}>
                        <option value="">—</option>
                        {[...new Set([...getCals(it.producto),...compras.filter(c=>c.producto===it.producto).map(c=>c.calibre),it.calibre].filter(Boolean))]
                          .map(c=><option key={c}>{c}</option>)}
                      </select>
                    </div>
                    <div><label style={lbl}>Unidad *</label>
                      <select style={sel} value={it.unidad||"kg"} onChange={e=>setItem(i,"unidad",e.target.value)}>
                        {UNIDADES_COMPRA.map(u=><option key={u.id} value={u.id}>{u.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div style={{...g3,marginTop:10}}>
                    <div><label style={lbl}>{it.unidad==="pieza"?"Cuántas piezas *":esGranel(it.unidad)?`Cantidad (${uni(it.producto)}) *`:"Cuántos bultos *"}</label>
                      <input type="number" inputMode="decimal" style={inp} placeholder="0" value={it.cantidad} onChange={e=>setItem(i,"cantidad",e.target.value)}/>
                    </div>
                    {!esGranel(it.unidad)
                      ? <div><label style={lbl}>Kilos por bulto *</label>
                          <input type="number" inputMode="decimal" style={inp} placeholder="20" value={it.kgBulto} onChange={e=>setItem(i,"kgBulto",e.target.value)}/>
                        </div>
                      : <div><label style={lbl}>Abono a deuda $/{unidadTxt}</label>
                          <input type="number" inputMode="decimal" style={inp} placeholder="0" value={it.deudaKg||""} onChange={e=>setItem(i,"deudaKg",e.target.value)}/>
                        </div>}
                    <div><label style={lbl}>{it.unidad==="pieza"?"Precio por pieza *":esGranel(it.unidad)?`Precio $/${uni(it.producto)} *`:"Precio por bulto *"}</label>
                      <input type="number" inputMode="decimal" style={inp} placeholder="0.00" value={it.precio} onChange={e=>setItem(i,"precio",e.target.value)}/>
                    </div>
                  </div>
                  {!esGranel(it.unidad)&&(
                    <div style={{marginTop:10,maxWidth:260}}>
                      <label style={lbl}>Abono a deuda $/{unidadTxt}</label>
                      <input type="number" inputMode="decimal" style={inp} placeholder="0" value={it.deudaKg||""} onChange={e=>setItem(i,"deudaKg",e.target.value)}/>
                    </div>
                  )}
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,marginTop:10,
                    background:C.indigoL,borderRadius:10,padding:"8px 12px",fontSize:12.5,color:C.indigo,flexWrap:"wrap"}}>
                    <span>{kgs.toLocaleString("es-MX",{maximumFractionDigits:1})} {unidadTxt} · costo <strong>{fmt(kgs?merc/kgs:0)}</strong> por {unidadTxt}{deu>0&&<> · deuda {fmt(deu)}</>}</span>
                    <strong style={{fontSize:14}}>{fmt(merc+deu)}</strong>
                  </div>
                </div>
              );
            })}

            {/* 3. Pago y factura */}
            <div style={{...secTit,marginTop:20}}>Pago y factura</div>
            <div style={g3}>
              <div><label style={lbl}>Método de pago</label>
                <select style={sel} value={form.metodoPago} onChange={e=>sf("metodoPago",e.target.value)}>
                  {METODOS_PAGO.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              {form.metodoPago==="Efectivo" ? (
                <div style={{display:"flex",alignItems:"flex-end"}}>
                  <div style={{width:"100%",background:C.greenL,borderRadius:10,padding:"10px 12px",border:`1px solid ${C.greenM}`,fontSize:12,color:C.green,fontWeight:600}}>
                    Efectivo — se marca como pagado y se registra el pago al proveedor
                  </div>
                </div>
              ) : (
                <div><label style={lbl}>Estatus del pago</label>
                  <select style={sel} value={form.estatusPago} onChange={e=>sf("estatusPago",e.target.value)}>
                    <option value="porpagar">⏳ Por pagar</option>
                    <option value="pagado">✅ Pagado</option>
                  </select>
                </div>
              )}
              <div><label style={lbl}>Tipo de compra</label>
                <select style={sel} value={form.destino||"Normal"} onChange={e=>sf("destino",e.target.value)}>
                  <option>Normal</option><option>Fishers</option>
                </select>
              </div>
              <div><label style={lbl}>Factura #</label>
                <input style={inp} placeholder="Número de factura" value={form.factura} onChange={e=>sf("factura",e.target.value)}/>
              </div>
              <div><label style={lbl}>Fecha factura</label>
                <input type="date" style={inp} value={form.fechaFactura} onChange={e=>sf("fechaFactura",e.target.value)}/>
              </div>
            </div>

            <div style={totRow}>
              <span style={{fontWeight:600,color:C.muted}}>
                Total compra{(form.items||[]).length>1&&` · ${form.items.length} productos`}
              </span>
              <span style={{fontSize:20,fontWeight:800,color:C.teal}}>{fmt(totalForm)}</span>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setShowComp(false)}>Cancelar</button>
              <button style={btn(C.teal)} onClick={guardarCompra}>Guardar compra</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pago proveedor */}
      {showPago&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:440}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.teal}}>💳 Pago a Proveedor</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShowPago(false)}>×</button>
            </div>
            <div style={g2}>
              <div><label style={lbl}>Proveedor *</label>
                <select style={sel} value={pagoForm.proveedor} onChange={e=>sfp("proveedor",e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {allProveedores.map(p=><option key={p}>{p}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Fecha de pago *</label><input type="date" style={inp} value={pagoForm.fecha} onChange={e=>sfp("fecha",e.target.value)}/></div>
              <div><label style={lbl}>Monto *</label>
                <input type="number" inputMode="decimal" style={inp} placeholder="0.00" value={pagoForm.monto} onChange={e=>sfp("monto",e.target.value)}/>
              </div>
              <div><label style={lbl}>Método de pago</label>
                <select style={sel} value={pagoForm.metodoPago} onChange={e=>sfp("metodoPago",e.target.value)}>
                  {METODOS_PAGO.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              {pagoForm.proveedor&&(
                <div style={{gridColumn:"1/-1",background:C.tealL,borderRadius:8,padding:"10px 14px",border:`1px solid ${C.teal}33`}}>
                  <div style={{fontSize:12,color:C.teal,fontWeight:700}}>Saldo actual: {pagoForm.proveedor}</div>
                  <div style={{fontSize:16,fontWeight:800,color:C.red,marginTop:4}}>{fmt(saldoProveedor(pagoForm.proveedor).pendiente)} pendiente</div>
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setShowPago(false)}>Cancelar</button>
              <button style={btn(C.teal)} onClick={guardarPago}>💾 Registrar Pago</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// CATÁLOGOS
// ════════════════════════════════════════════════════════════════════════════════
function Catalogos({ clientes, setClientes, productos, setProductos, proveedores, setProveedores }) {
  const [nCli,  setNCli]  = useState("");
  const [nProv, setNProv] = useState("");
  const [nProd, setNProd] = useState({ nombre:"", calibres:"" });
  const [editP, setEditP] = useState(null);

  const [editC, setEditC] = useState(null);   // datos fiscales en edición
  const nombres = (clientes||[]).map(cliNom);
  const addCli  = () => { const v=nCli.trim(); if(v&&!nombres.includes(v)){setClientes(c=>[...c,{nombre:v}]);setNCli("");} };
  const abrirFisc = nom => { const f=cliFisc(clientes,nom); setEditC({nombre:nom,grupo:f.grupo||"",razonSocial:f.razonSocial||"",rfc:f.rfc||"",cp:f.cp||"",regimen:f.regimen||"",usoCFDI:f.usoCFDI||"",formaPago:f.formaPago||""}); };
  const guardarFisc = () => {
    setClientes(cs=>cs.map(c=>cliNom(c)===editC.nombre?{...editC}:c));
    setEditC(null);
  };
  const addProv = () => { const v=nProv.trim(); if(v&&!proveedores.includes(v)){setProveedores(p=>[...p,v]);setNProv("");} };
  const addProd = () => {
    if(!nProd.nombre.trim()) return;
    const cals=nProd.calibres.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    setProductos(ps=>[...ps,{nombre:nProd.nombre.trim(),calibres:cals}]);
    setNProd({nombre:"",calibres:""});
  };
  const saveProd = () => {
    const cals=editP.calibresStr.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    setProductos(ps=>ps.map(p=>p.nombre===editP.orig?{...p,calibres:cals,claveSAT:(editP.claveSAT||"").trim(),descSAT:(editP.descSAT||"").trim()}:p));
    setEditP(null);
  };
  return (
    <div>
      <h2 style={h2s}>🗂️ Catálogos</h2>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16,marginBottom:16}}>
        {/* Clientes */}
        <div style={card}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>👥 Clientes</div>
          <div style={{display:"flex",gap:7,marginBottom:12}}>
            <input style={{...inp,flex:1}} placeholder="Nuevo cliente" value={nCli} onChange={e=>setNCli(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addCli()}/>
            <button style={btn()} onClick={addCli}>+ Agregar</button>
          </div>
          {clientes.length===0&&<p style={{color:C.muted,fontSize:12,textAlign:"center"}}>Sin clientes</p>}
          {(clientes||[]).map(c=>{
            const nom=cliNom(c), f=cliFisc(clientes,nom);
            return (
            <div key={nom} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8,background:C.bg,borderRadius:9,padding:"9px 13px",marginBottom:6,border:`1px solid ${C.border}`}}>
              <div style={{minWidth:0}}>
                <div>👤 {nom}</div>
                <div style={{fontSize:11,color:f.rfc?C.green:C.amber,marginTop:2}}>
                  {f.grupo && <span style={{color:C.indigo,fontWeight:600}}>Grupo {f.grupo} · </span>}
                  {f.rfc ? `${f.razonSocial||""} · ${f.rfc}` : (f.grupo ? "Datos fiscales del grupo" : "Sin datos fiscales")}
                </div>
              </div>
              <div style={{display:"flex",gap:4,flexShrink:0}}>
                <button style={{...btnO(C.blue),padding:"4px 9px",fontSize:11}} onClick={()=>abrirFisc(nom)}>Datos fiscales</button>
                <button style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:20,fontWeight:700}} onClick={()=>setClientes(cs=>cs.filter(x=>cliNom(x)!==nom))}>×</button>
              </div>
            </div>
          );})}
        </div>
        {/* Proveedores */}
        <div style={card}>
          <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>🚛 Proveedores de Fruta</div>
          <div style={{display:"flex",gap:7,marginBottom:12}}>
            <input style={{...inp,flex:1}} placeholder="Nombre del proveedor" value={nProv} onChange={e=>setNProv(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addProv()}/>
            <button style={btn(C.teal)} onClick={addProv}>+ Agregar</button>
          </div>
          {proveedores.length===0&&<p style={{color:C.muted,fontSize:12,textAlign:"center"}}>Sin proveedores — agrega tus primeros proveedores aquí</p>}
          {proveedores.map(p=>(
            <div key={p} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.bg,borderRadius:9,padding:"9px 13px",marginBottom:6,border:`1px solid ${C.border}`}}>
              <span>🚛 {p}</span>
              <button style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:20,fontWeight:700}} onClick={()=>setProveedores(ps=>ps.filter(x=>x!==p))}>×</button>
            </div>
          ))}
        </div>
      </div>
      {/* Productos */}
      <div style={card}>
        <div style={{fontWeight:800,fontSize:15,marginBottom:14}}>🛒 Productos</div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
          <input style={inp} placeholder="Nombre del producto (ej: Mango)" value={nProd.nombre} onChange={e=>setNProd(p=>({...p,nombre:e.target.value}))}/>
          <div style={{display:"flex",gap:7}}>
            <input style={{...inp,flex:1}} placeholder="Calibres separados por coma (opcional)" value={nProd.calibres} onChange={e=>setNProd(p=>({...p,calibres:e.target.value}))}/>
            <button style={btn()} onClick={addProd}>+ Agregar</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {productos.map(p=>(
            <div key={p.nombre} style={{background:C.bg,borderRadius:9,padding:"10px 13px",border:`1px solid ${C.border}`}}>
              {editP?.orig===p.nombre ? (
                <div>
                  <div style={{fontWeight:700,marginBottom:6}}>{pEmoji(p.nombre)} {p.nombre}</div>
                  <label style={lbl}>Calibres (separados por coma)</label>
                  <input style={inp} value={editP.calibresStr} onChange={e=>setEditP(ep=>({...ep,calibresStr:e.target.value}))}/>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1.3fr",gap:7,marginTop:8}}>
                    <div><label style={lbl}>Clave SAT</label>
                      <input style={inp} placeholder="50401736" value={editP.claveSAT} onChange={e=>setEditP(ep=>({...ep,claveSAT:e.target.value}))}/></div>
                    <div><label style={lbl}>Nombre en la factura</label>
                      <input style={inp} placeholder="Aguacate Hass" value={editP.descSAT} onChange={e=>setEditP(ep=>({...ep,descSAT:e.target.value}))}/></div>
                  </div>
                  <div style={{display:"flex",gap:7,marginTop:10,justifyContent:"flex-end"}}>
                    <button style={btnO()} onClick={()=>setEditP(null)}>Cancelar</button>
                    <button style={btn()} onClick={saveProd}>Guardar</button>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700}}>{pEmoji(p.nombre)} {p.nombre}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{p.calibres.join(", ")}</div>
                    <div style={{fontSize:11,color:satDe(productos,p.nombre).clave?C.green:C.amber,marginTop:2}}>
                      {satDe(productos,p.nombre).clave ? `SAT ${satDe(productos,p.nombre).clave} · ${satDe(productos,p.nombre).desc}` : "Sin clave SAT"}
                    </div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button style={{...btn(C.blue),padding:"5px 10px",fontSize:11}} onClick={()=>{const d=satDe(productos,p.nombre);setEditP({orig:p.nombre,calibresStr:p.calibres.join(", "),claveSAT:p.claveSAT||d.clave||"",descSAT:p.descSAT||d.desc||p.nombre});}}>✎</button>
                    <button style={{...btn(C.red),padding:"5px 10px",fontSize:11}} onClick={()=>setProductos(ps=>ps.filter(x=>x.nombre!==p.nombre))}>✕</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Datos fiscales del cliente */}
      {editC&&(
        <div style={modal} onClick={()=>setEditC(null)}>
          <div style={{...mbox,maxWidth:560}} onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,fontSize:17}}>Datos fiscales de {editC.nombre}</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setEditC(null)}>×</button>
            </div>
            <div style={g2}>
              <div><label style={lbl}>Razón social</label>
                <input style={inp} placeholder="JOSE LUIS LUNA SOTO" value={editC.razonSocial} onChange={e=>setEditC(x=>({...x,razonSocial:e.target.value}))}/></div>
              <div><label style={lbl}>RFC</label>
                <input style={inp} placeholder="LUSL770821NV8" value={editC.rfc} onChange={e=>setEditC(x=>({...x,rfc:e.target.value.toUpperCase()}))}/></div>
            </div>
            <div style={{...g2,marginTop:12}}>
              <div><label style={lbl}>Código postal</label>
                <input style={inp} placeholder="52170" value={editC.cp} onChange={e=>setEditC(x=>({...x,cp:e.target.value}))}/></div>
              <div><label style={lbl}>Forma de pago</label>
                <input style={inp} placeholder="Transferencia electrónica de fondos (incluye SPEI)" value={editC.formaPago} onChange={e=>setEditC(x=>({...x,formaPago:e.target.value}))}/></div>
            </div>
            <div style={{marginTop:12}}>
              <label style={lbl}>Régimen fiscal</label>
              <input style={inp} placeholder="Personas Físicas con Actividades Empresariales y Profesionales" value={editC.regimen} onChange={e=>setEditC(x=>({...x,regimen:e.target.value}))}/>
            </div>
            <div style={{marginTop:12}}>
              <label style={lbl}>Uso del CFDI</label>
              <input style={inp} placeholder="Gastos en general" value={editC.usoCFDI} onChange={e=>setEditC(x=>({...x,usoCFDI:e.target.value}))}/>
            </div>
            <div style={{marginTop:12}}>
              <label style={lbl}>Grupo de facturación (opcional)</label>
              <input style={inp} list="grupos-list" placeholder="Ej. Carnalito — déjalo vacío si se factura solo" value={editC.grupo} onChange={e=>setEditC(x=>({...x,grupo:e.target.value}))}/>
              <datalist id="grupos-list">{[...new Set((clientes||[]).map(c=>typeof c==="object"?c.grupo:"").filter(Boolean))].map(g=><option key={g} value={g}/>)}</datalist>
              <div style={{fontSize:11,color:C.muted,marginTop:4}}>
                Varias sucursales con el mismo grupo se facturan juntas, en un solo mensaje. Los datos fiscales se capturan una sola vez, en cualquiera de ellas.
              </div>
            </div>
            <div style={{fontSize:11,color:C.muted,marginTop:10}}>Lo que dejes vacío simplemente no aparece en el mensaje al contador.</div>
            <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setEditC(null)}>Cancelar</button>
              <button style={btn()} onClick={guardarFisc}>Guardar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// BITÁCORA DE CAMBIOS
// ════════════════════════════════════════════════════════════════════════════════
function Bitacora({ bitacora, setBitacora }) {
  const [filt,       setFilt]       = useState({tipo:"todo",valor:""});
  const [filtUsuario,setFiltUsuario]= useState("");
  const [filtAccion, setFiltAccion] = useState("");

  const lista = applyFilter(bitacora, filt)
    .filter(r => !filtUsuario || r.usuario===filtUsuario)
    .filter(r => !filtAccion  || r.accion===filtAccion)
    .slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||"")||(b.hora||"").localeCompare(a.hora||""));

  const usuarios = [...new Set(bitacora.map(r=>r.usuario).filter(Boolean))];
  const acciones = [...new Set(bitacora.map(r=>r.accion).filter(Boolean))].sort();

  const accionColor = accion => {
    if(/elimin/i.test(accion)) return {c:C.red,   bg:C.redL};
    if(/edit|modif/i.test(accion)) return {c:C.blue,  bg:C.blueL};
    if(/nuevo|complet|registr/i.test(accion)) return {c:C.green, bg:C.greenL};
    if(/cancel/i.test(accion)) return {c:C.amber, bg:C.amberL};
    return {c:C.muted, bg:C.bg};
  };

  const exportBit = () => exportCSV(lista,
    [{l:"Fecha",k:"fecha"},{l:"Hora",k:"hora"},{l:"Usuario",k:"usuario"},{l:"Accion",k:"accion"},{l:"Detalle",k:"detalle"}],
    `bitacora-${todayStr()}.csv`
  );

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <div>
          <h2 style={{...h2s,margin:0}}>📋 Bitácora de Cambios</h2>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>
            {lista.length} evento{lista.length!==1?"s":""} registrado{lista.length!==1?"s":""}
          </div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button style={btn(C.blue)} onClick={exportBit}>⬇ CSV</button>
          {bitacora.length>0&&(
            <button style={btnO(C.red)} onClick={()=>{ if(window.confirm("¿Limpiar toda la bitácora? Esta acción no se puede deshacer.")) setBitacora([]); }}>
              🗑️ Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <FilterBar filter={filt} setFilter={setFilt} count={lista.length}/>

      {/* Filtros por usuario y acción */}
      {(usuarios.length>1||acciones.length>0)&&(
        <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:12,boxShadow:C.shadow,display:"flex",gap:12,flexWrap:"wrap",alignItems:"center"}}>
          {usuarios.length>1&&(
            <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
              <span style={{color:C.muted,fontSize:12,fontWeight:700}}>👤 Usuario:</span>
              <button style={nb(!filtUsuario)} onClick={()=>setFiltUsuario("")}>Todos</button>
              {usuarios.map(u=><button key={u} style={nb(filtUsuario===u)} onClick={()=>setFiltUsuario(filtUsuario===u?"":u)}>{u}</button>)}
            </div>
          )}
        </div>
      )}

      {/* Estadísticas rápidas */}
      {bitacora.length>0&&(()=>{
        const stats = acciones.slice(0,6).map(a=>{
          const n = bitacora.filter(r=>r.accion===a).length;
          const col = accionColor(a);
          return { a:a, n:n, c:col.c, bg:col.bg };
        }).sort((x,y)=>y.n-x.n);
        return (
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginBottom:12}}>
            {stats.map(({a,n,c,bg})=>(
              <div key={a} style={{background:bg,border:`1px solid ${c}33`,borderRadius:9,padding:"7px 13px",cursor:"pointer",opacity:filtAccion===a?1:0.85}}
                onClick={()=>setFiltAccion(filtAccion===a?"":a)}>
                <div style={{fontSize:10,color:c,fontWeight:700,textTransform:"uppercase",letterSpacing:.5}}>{a}</div>
                <div style={{fontSize:17,fontWeight:800,color:c,marginTop:1}}>{n}</div>
              </div>
            ))}
            {filtAccion&&<button style={{...btnO(C.muted),padding:"7px 12px",fontSize:11,alignSelf:"center"}} onClick={()=>setFiltAccion("")}>✕ Quitar filtro</button>}
          </div>
        );
      })()}

      {/* Tabla */}
      <div style={card}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead>
              <tr>
                {["Fecha","Hora","Usuario","Acción","Detalle"].map(h=>(
                  <th key={h} style={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {lista.length===0&&(
                <tr><td colSpan={5} style={{...td,textAlign:"center",color:C.muted,padding:36}}>
                  {bitacora.length===0?"Sin eventos registrados aún — cada cambio que hagas aparecerá aquí 📝":"Sin eventos en este período"}
                </td></tr>
              )}
              {lista.map((r,i)=>{
                const {c,bg} = accionColor(r.accion);
                return (
                  <tr key={r.id||i} style={{background:i%2===0?"#fff":"#f9fcfa"}}>
                    <td style={{...td,fontWeight:600,whiteSpace:"nowrap"}}>{fmtDate(r.fecha)}</td>
                    <td style={{...td,color:C.muted,whiteSpace:"nowrap"}}>{r.hora}</td>
                    <td style={td}><span style={{fontWeight:700,color:C.green}}>👤 {r.usuario||"—"}</span></td>
                    <td style={td}><span style={{...badge(c,bg),fontSize:11}}>{r.accion}</span></td>
                    <td style={{...td,color:C.muted,fontSize:12}}>{r.detalle||"—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {lista.length>0&&(
          <div style={{...totRow,marginTop:8}}>
            <span style={{fontWeight:600,color:C.muted,fontSize:12}}>Mostrando {lista.length} de {bitacora.length} eventos totales</span>
            <span style={{fontSize:11,color:C.muted}}>Más reciente primero</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// APP ROOT — Dark mode + sidebar + Excel import
// ════════════════════════════════════════════════════════════════════════════════
const INIT_CLI  = ["Hortaliza","Fishers","Taquitos","TORTAS TEMOAYA"];
const INIT_PROD = [
  { nombre:"Aguacate", calibres:["tercera","segunda","primera","extra","súper"] },
  { nombre:"Cebolla",  calibres:["extra","jumbo"] },
];

// ── Import helper ─────────────────────────────────────────────────────────────
function ImportModal({ onClose, setPedidos, setVentas, setGastos, setFruta, setPagos }) {
  const [status, setStatus] = useState("");
  const [error,  setError]  = useState("");
  const [modo,   setModo]   = useState("reemplazar");

  // Load JSON — recibe modo como argumento para evitar problemas de closure
  const loadJSON = (data, modoActual) => {
    const d = typeof data === "string" ? JSON.parse(data) : data;
    const rep = modoActual === "reemplazar";
    let count = 0;
    if(d.ventas?.length)  { setVentas(rep ? d.ventas  : v=>[...d.ventas,...v]);   count += d.ventas.length; }
    if(d.pagos?.length)   { setPagos(rep  ? d.pagos   : p=>[...d.pagos,...p]);    count += d.pagos.length; }
    if(d.gastos?.length)  { setGastos(rep ? d.gastos  : g=>[...d.gastos,...g]);   count += d.gastos.length; }
    if(d.fruta?.length)   { setFruta(rep  ? d.fruta   : f=>[...d.fruta,...f]);    count += d.fruta.length; }
    return count;
  };

  // Map SAJI's exact Excel columns to app fields
  const mapVentas = rows => rows.map((r,i)=>({
    pedidoId:      r["#PED"] ? String(r["#PED"]) : `IMP${i.toString().padStart(4,"0")}`,
    itemId:        `imp-v-${Date.now()}-${i}`,
    semana:        String(r["SEM"]||""),
    dia:           String(r["DÍA"]||r["DIA"]||""),
    mes:           String(r["MES"]||""),
    fecha:         fmtXlDate(r["FECHA"]),
    cliente:       String(r["CLIENTE"]||""),
    producto:      "Aguacate",
    calibre:       String(r["CALIBRE"]||""),
    cantidad:      parseFloat(r["KG"]||0)||0,
    precio:        parseFloat(r["$/KG"]||0)||0,
    total:         parseFloat(r["TOTAL"]||0)||0,
    estatusPago:   /pag/i.test(String(r["ESTATUS"]||"")) ? "pagado" : "pendiente",
    tipoPago:      String(r["TIPO DE PAGO"]||""),
    fechaPago:     fmtXlDate(r["F. PAGO"]),
    factura:       String(r["FACTURA"]||""),
    facturaEmisor: String(r["EMISOR"]||""),
    remision:      String(r["REMISIÓN"]||r["REMISION"]||""),
    fechaFactura:  fmtXlDate(r["F. FACTURA"]),
  }));

  const mapPagos = rows => rows
    .filter(r=>parseFloat(r["TOTAL"]||0)>0)
    .map((r,i)=>({
      id:       `imp-p-${Date.now()}-${i}`,
      semana:   String(r["SEM"]||""),
      dia:      String(r["DÍA"]||r["DIA"]||""),
      mes:      String(r["MES"]||""),
      fecha:    fmtXlDate(r["F. PAGO"]),
      cliente:  String(r["CLIENTE"]||""),
      tipoPago: String(r["TIPO DE PAGO"]||""),
      pedidoId: String(r["#PEDIDO"]||""),
      monto:    parseFloat(r["TOTAL"]||0)||0,
    }));

  const mapGastos = rows => rows.map((r,i)=>({
    id:          `imp-g-${Date.now()}-${i}`,
    semana:      String(r["SEM"]||""),
    dia:         String(r["DÍA"]||r["DIA"]||""),
    mes:         String(r["MES"]||""),
    fecha:       fmtXlDate(r["FECHA"]),
    gasto:       String(r["DESCRIPCIÓN"]||r["DESCRIPCION"]||""),
    tipoGasto:   String(r["TIPO DE GASTO"]||"Otros Gastos"),
    metodoPago:  String(r["METODO DE PAGO"]||"Efectivo"),
    estatusPago: /pag/i.test(String(r["ESTATUS"]||"")) ? "pagado" : "porpagar",
    monto:       parseFloat(r["TOTAL"]||0)||0,
  }));

  const mapFruta = rows => rows.map((r,i)=>({
    id:          `imp-f-${Date.now()}-${i}`,
    semana:      String(r["Semana"]||r["SEM"]||""),
    dia:         String(r["Día"]||r["DÍA"]||""),
    mes:         String(r["Mes"]||r["MES"]||""),
    fecha:       fmtXlDate(r["Fecha"]||r["FECHA"]),
    proveedor:   String(r["Concepto"]||r["Proveedor"]||""),
    producto:    "Aguacate",
    calibre:     "",
    cantidad:    parseFloat(r["KG"]||0)||0,
    precio:      parseFloat(r["KG"]||0)>0 ? Math.round((parseFloat(r["Total"]||0)/parseFloat(r["KG"]))*100)/100 : 0,
    total:       parseFloat(r["Total"]||r["TOTAL"]||0)||0,
    factura:     "", fechaFactura:"",
    metodoPago:  "Transferencia BBVA empresa",
    estatusPago: "pagado",
  }));

  function fmtXlDate(v) {
    if(!v) return "";
    if(v instanceof Date) return v.toISOString().split("T")[0];
    const s = String(v).trim();
    if(/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    return s;
  }

  const handleFile = async (e) => {
    const file = e.target.files?.[0] || e;
    if(!file) return;
    setStatus("Leyendo archivo…"); setError("");
    try {
      // JSON base file
      if(file.name?.endsWith(".json")) {
        const text = await file.text();
        const count = loadJSON(text, modo);
        setStatus(`✅ Base cargada: ${count} registros importados · modo: ${modo}`);
        return;
      }
      // Excel file
      const SheetJS = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
      const wb = SheetJS.read(await file.arrayBuffer(), {cellDates:true});
      let count = 0;
      const rep = modo==="reemplazar";
      wb.SheetNames.forEach(name => {
        const rows = SheetJS.utils.sheet_to_json(wb.Sheets[name], {defval:""});
        const s = name.toLowerCase();
        if(s.includes("venta"))  { const m=mapVentas(rows);  setVentas(v=>rep?m:[...m,...v]);  count+=m.length; }
        if(s.includes("pago"))   { const m=mapPagos(rows);   setPagos(p=>rep?m:[...m,...p]);   count+=m.length; }
        if(s.includes("gasto"))  { const m=mapGastos(rows);  setGastos(g=>rep?m:[...m,...g]);  count+=m.length; }
        if(s.includes("fruta")||s.includes("compra")) { const m=mapFruta(rows); setFruta(f=>rep?m:[...m,...f]); count+=m.length; }
      });
      count > 0
        ? setStatus(`✅ ${count} registros importados de: ${wb.SheetNames.join(", ")}`)
        : setError("No se reconocieron hojas. Nombres esperados: Ventas, Pagos, Gastos, Fruta.");
    } catch(err) {
      setError("Error: "+err.message); setStatus("");
    }
  };

  return (
    <div style={modal}>
      <div style={{...mbox,maxWidth:540}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
          <h3 style={{margin:0,color:C.green,fontSize:16}}>📥 Importar Base de Datos</h3>
          <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={onClose}>×</button>
        </div>

        {/* Modo: reemplazar o agregar */}
        <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:12,marginBottom:12}}>
          <div style={{fontSize:12,fontWeight:700,color:C.text,marginBottom:8}}>⚙️ Modo de importación</div>
          <div style={{display:"flex",gap:8}}>
            <button onClick={()=>setModo("reemplazar")} style={{
              flex:1, padding:"9px 0", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700,
              background: modo==="reemplazar" ? C.green : "transparent",
              color:      modo==="reemplazar" ? "#fff" : C.muted,
              border:     modo==="reemplazar" ? "none" : `1.5px solid ${C.border}`,
            }}>
              🔄 Reemplazar todo
            </button>
            <button onClick={()=>setModo("agregar")} style={{
              flex:1, padding:"9px 0", borderRadius:8, cursor:"pointer", fontSize:12, fontWeight:700,
              background: modo==="agregar" ? C.blue : "transparent",
              color:      modo==="agregar" ? "#fff" : C.muted,
              border:     modo==="agregar" ? "none" : `1.5px solid ${C.border}`,
            }}>
              ➕ Agregar a existentes
            </button>
          </div>
          <div style={{fontSize:11,color:C.muted,marginTop:7}}>
            {modo==="reemplazar"
              ? "⚠️ Borra todos los datos actuales y carga los del archivo. Usa esto si la base está duplicada."
              : "ℹ️ Agrega los datos del archivo sin borrar lo que ya tienes capturado."}
          </div>
        </div>

        {/* Option A — JSON base */}
        <div style={{background:C.greenL,border:`1px solid ${C.greenM}`,borderRadius:10,padding:14,marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13,color:C.green,marginBottom:6}}>⭐ Opción 1 — Cargar base SAJI (recomendado)</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.6}}>
            Carga el archivo <strong style={{color:C.text}}>base_saji.json</strong> generado de tu Excel.<br/>
            Contiene 162 ventas · 125 pagos · 195 gastos · 24 compras de fruta.
          </div>
          <div style={{position:"relative",display:"inline-block"}}>
            <input type="file" accept=".json" onChange={handleFile}
              style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%"}}/>
            <button style={{...btn(C.green),display:"flex",alignItems:"center",gap:7}}>
              📂 Seleccionar base_saji.json
            </button>
          </div>
        </div>

        {/* Option B — Excel direct */}
        <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:10,padding:14,marginBottom:12}}>
          <div style={{fontWeight:700,fontSize:13,marginBottom:6}}>📊 Opción 2 — Cargar Excel directamente</div>
          <div style={{fontSize:12,color:C.muted,marginBottom:10,lineHeight:1.6}}>
            Tu Excel debe tener hojas llamadas: <strong>Ventas · Pagos · Gastos · Fruta</strong><br/>
            con las mismas columnas de tu archivo BASE_SAJI_2026.
          </div>
          <div style={{border:`2px dashed ${C.border}`,borderRadius:8,padding:20,textAlign:"center",position:"relative",cursor:"pointer"}}
            onDragOver={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.green;}}
            onDragLeave={e=>{e.currentTarget.style.borderColor=C.border;}}
            onDrop={e=>{e.preventDefault();e.currentTarget.style.borderColor=C.border;const f=e.dataTransfer.files[0];if(f)handleFile({target:{files:[f]},name:f.name,...f});}}>
            <div style={{fontSize:28,marginBottom:6}}>📊</div>
            <div style={{color:C.muted,fontSize:12}}>Arrastra aquí o haz clic</div>
            <input type="file" accept=".xlsx,.xls" onChange={handleFile}
              style={{position:"absolute",inset:0,opacity:0,cursor:"pointer",width:"100%",height:"100%"}}/>
          </div>
        </div>

        {status&&<div style={{background:C.greenL,border:`1px solid ${C.greenM}`,borderRadius:8,padding:"10px 14px",color:C.green,fontSize:13,fontWeight:600,marginBottom:8}}>{status}</div>}
        {error &&<div style={{background:C.redL,border:`1px solid ${C.red}33`,borderRadius:8,padding:"10px 14px",color:C.red,fontSize:12,marginBottom:8}}>{error}</div>}

        <div style={{display:"flex",justifyContent:"flex-end",marginTop:8}}>
          <button style={btnO()} onClick={onClose}>{status?"Cerrar":"Cancelar"}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Usuarios autorizados ─────────────────────────────────────────────────────
// ════════════════════════════════════════════════════════════════════════════════
// INVENTARIOS
// ════════════════════════════════════════════════════════════════════════════════
const UBICACIONES = ["Frío 1","Frío 2","Maduración","Ambiente"];
const CALIBRES_INV = ["Chico","Primera","Extra","Super"];

function Inventarios({ inventario, setInventario, logBit }) {
  const [showModal, setShowModal] = useState(false);
  const [editCell, setEditCell]   = useState({ calibre:"", ubicacion:"" });
  const [kgInput,  setKgInput]    = useState("");

  // Lee el KG actual de una celda
  const getKg = (cal, ub) => {
    const rec = (inventario||[]).find(x=>x.calibre===cal && x.ubicacion===ub);
    return rec ? parseFloat(rec.kg||0) : 0;
  };

  // Guarda (reemplaza) el valor de la celda
  const guardar = () => {
    if(kgInput==="" || isNaN(parseFloat(kgInput))) return alert("Ingresa un valor de KG válido");
    const kg = Math.max(0, parseFloat(kgInput));
    setInventario(inv => {
      const lista = [...(inv||[])];
      const idx = lista.findIndex(x=>x.calibre===editCell.calibre && x.ubicacion===editCell.ubicacion);
      if(idx>=0) lista[idx] = {...lista[idx], kg, fecha:todayStr()};
      else lista.push({ id:Date.now(), calibre:editCell.calibre, ubicacion:editCell.ubicacion, kg, fecha:todayStr() });
      return lista;
    });
    logBit("Actualizó inventario", `${editCell.calibre} · ${editCell.ubicacion} → ${kg} kg`);
    setShowModal(false);
  };

  const kgPorUb = ub => CALIBRES_INV.reduce((s,c)=>s+getKg(c,ub),0);

  return (
    <div>
      <div style={{marginBottom:12}}>
        <h2 style={{...h2s,margin:0}}>📦 Inventarios</h2>
        <div style={{color:C.muted,fontSize:12,marginTop:2}}>🥑 Aguacate — Toca un campo para actualizar el stock</div>
      </div>

      {/* KPI totales por zona */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:14}}>
        {[
          {label:"❄️ Frío 1",      ub:"Frío 1",     c:C.blue},
          {label:"❄️ Frío 2",      ub:"Frío 2",     c:"#5b8dee"},
          {label:"🌡️ Maduración",  ub:"Maduración", c:C.purple},
          {label:"🌤️ Ambiente",    ub:"Ambiente",   c:C.amber},
        ].map(x=>(
          <div key={x.label} style={{...card,padding:"12px 14px",borderTop:`3px solid ${x.c}`}}>
            <div style={{fontSize:13,fontWeight:700,color:x.c,marginBottom:4}}>{x.label}</div>
            <div style={{fontSize:20,fontWeight:800,color:C.text}}>{kgPorUb(x.ub).toLocaleString("es-MX",{maximumFractionDigits:1})} kg</div>
          </div>
        ))}
      </div>

      {/* Zonas con calibres */}
      {[
        {ub:"Frío 1",    ico:"❄️", c:C.blue},
        {ub:"Frío 2",    ico:"❄️", c:"#5b8dee"},
        {ub:"Maduración",ico:"🌡️", c:C.purple},
        {ub:"Ambiente",  ico:"🌤️", c:C.amber},
      ].map(({ub,ico,c})=>(
        <div key={ub} style={{...card,marginBottom:10,borderLeft:`4px solid ${c}`}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
            <div style={{fontWeight:800,fontSize:14,color:c}}>{ico} {ub}</div>
            <div style={{fontSize:11,color:C.muted,fontWeight:600}}>Total: {kgPorUb(ub).toLocaleString("es-MX",{maximumFractionDigits:1})} kg</div>
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8}}>
            {CALIBRES_INV.map(cal=>{
              const kg = getKg(cal,ub);
              return (
                <div key={cal}
                  style={{background:C.bg,borderRadius:8,padding:"10px 12px",border:`1px solid ${c}33`,cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}
                  onClick={()=>{ setEditCell({calibre:cal,ubicacion:ub}); setKgInput(kg>0?String(kg):""); setShowModal(true); }}
                  onMouseEnter={e=>e.currentTarget.style.background=C.greenL}
                  onMouseLeave={e=>e.currentTarget.style.background=C.bg}>
                  <span style={{fontWeight:700,fontSize:13}}>{cal}</span>
                  {kg>0
                    ? <strong style={{color:kg<50?C.amber:C.green,fontSize:14}}>{kg.toLocaleString("es-MX",{maximumFractionDigits:1})} kg</strong>
                    : <span style={{color:C.border,fontSize:20}}>+</span>}
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Merma y Mallas */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:4}}>
        {(()=>{
          const mermaKg = getKg("Merma","—");
          return (
            <div style={{background:"#fff8f0",borderRadius:10,padding:"12px 14px",border:`1px solid ${C.amber}44`,display:"flex",flexDirection:"column",gap:6,cursor:"pointer"}}
              onClick={()=>{ setEditCell({calibre:"Merma",ubicacion:"—"}); setKgInput(mermaKg>0?String(mermaKg):""); setShowModal(true); }}
              onMouseEnter={e=>e.currentTarget.style.background=C.amberL}
              onMouseLeave={e=>e.currentTarget.style.background="#fff8f0"}>
              <span style={{fontWeight:700,color:C.amber,fontSize:13}}>⚠️ Merma</span>
              {mermaKg>0
                ? <strong style={{color:C.amber,fontSize:18}}>{mermaKg.toLocaleString("es-MX",{maximumFractionDigits:1})} kg</strong>
                : <span style={{color:C.border,fontSize:22}}>+</span>}
            </div>
          );
        })()}
        {(()=>{
          const mallas = getKg("Mallas","—");
          return (
            <div style={{background:"#f0f4ff",borderRadius:10,padding:"12px 14px",border:`1px solid ${C.blue}44`,display:"flex",flexDirection:"column",gap:6,cursor:"pointer"}}
              onClick={()=>{ setEditCell({calibre:"Mallas",ubicacion:"—"}); setKgInput(mallas>0?String(mallas):""); setShowModal(true); }}
              onMouseEnter={e=>e.currentTarget.style.background=C.blueL}
              onMouseLeave={e=>e.currentTarget.style.background="#f0f4ff"}>
              <span style={{fontWeight:700,color:C.blue,fontSize:13}}>🕸️ Mallas</span>
              {mallas>0
                ? <strong style={{color:C.blue,fontSize:18}}>{Math.round(mallas).toLocaleString("es-MX")} mallas</strong>
                : <span style={{color:C.border,fontSize:22}}>+</span>}
            </div>
          );
        })()}
      </div>

      {/* Modal actualizar KG */}
      {showModal&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:340}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.green}}>✏️ Actualizar Stock</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShowModal(false)}>×</button>
            </div>
            <div style={{background:C.bg,borderRadius:8,padding:"10px 14px",marginBottom:14,border:`1px solid ${C.border}`,display:"flex",gap:10,alignItems:"center"}}>
              {editCell.calibre==="Merma"
                ? <span style={{fontWeight:700,color:C.amber}}>⚠️ Merma general</span>
                : editCell.calibre==="Mallas"
                ? <span style={{fontWeight:700,color:C.blue}}>🕸️ Mallas (cantidad)</span>
                : <><span style={badge(C.blue,C.blueL)}>{editCell.calibre}</span>
                   <span style={{color:C.muted}}>→</span>
                   <span style={{fontWeight:700}}>{editCell.ubicacion}</span></>
              }
            </div>
            <label style={lbl}>{editCell.calibre==="Mallas"?"Cantidad de mallas *":"KG actuales *"}</label>
            <input type="number" inputMode="decimal" style={inp} placeholder="0.00"
              value={kgInput} onChange={e=>setKgInput(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&guardar()} autoFocus/>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setShowModal(false)}>Cancelar</button>
              <button style={btn(C.green)} onClick={guardar}>💾 Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
const USUARIOS = [
  { user:"Irving", pass:"1111$",  rol:"admin" },
  { user:"Jasso",  pass:"1956$",  rol:"admin" },
  { user:"Daniel", pass:"op01$",  rol:"operativo" },
  { user:"Hector", pass:"op02$",  rol:"operativo", pedidos:true },
  { user:"Jose",   pass:"op03$",  rol:"operativo", pedidos:true },
];

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [user, setUser]   = useState("");
  const [pass, setPass]   = useState("");
  const [error, setError] = useState("");
  const [show, setShow]   = useState(false);

  const login = () => {
    const found = USUARIOS.find(u => u.user.toLowerCase()===user.trim().toLowerCase() && u.pass===pass);
    if(found) { onLogin(found.user, found.rol, found.pedidos||false); }
    else { setError("Usuario o contraseña incorrectos"); }
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
      <div style={{width:"100%",maxWidth:360}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:28}}>
          <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#22c55e,#15803d)",display:"inline-flex",alignItems:"center",justifyContent:"center",boxShadow:"0 6px 20px rgba(21,128,61,.25)",marginBottom:14}}>
            <SAJILogo s={34}/>
          </div>
          <div style={{fontWeight:700,fontSize:22,color:C.text,letterSpacing:"-0.3px"}}>SAJI Group</div>
          <div style={{color:C.muted,fontSize:13,marginTop:4}}>Sistema de Gestión Comercial</div>
        </div>

        {/* Form */}
        <div style={{background:C.card,borderRadius:16,padding:28,boxShadow:C.shadowMd,border:`1px solid ${C.border}`}}>
          <div style={{marginBottom:16}}>
            <label style={lbl}>Usuario</label>
            <input style={inp} placeholder="Tu nombre de usuario" value={user}
              onChange={e=>{setUser(e.target.value);setError("");}}
              onKeyDown={e=>e.key==="Enter"&&login()}
              onFocus={e=>e.target.style.borderColor=C.indigo}
              onBlur={e=>e.target.style.borderColor=C.border}/>
          </div>
          <div style={{marginBottom:22}}>
            <label style={lbl}>Contraseña</label>
            <div style={{position:"relative"}}>
              <input style={{...inp,paddingRight:42}} type={show?"text":"password"}
                placeholder="Tu contraseña" value={pass}
                onChange={e=>{setPass(e.target.value);setError("");}}
                onKeyDown={e=>e.key==="Enter"&&login()}
                onFocus={e=>e.target.style.borderColor=C.indigo}
                onBlur={e=>e.target.style.borderColor=C.border}/>
              <button onClick={()=>setShow(s=>!s)} style={{position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:16,lineHeight:1}}>
                {show?"🙈":"👁️"}
              </button>
            </div>
          </div>
          {error&&<div style={{background:C.redL,border:`1px solid ${C.red}22`,borderRadius:8,padding:"9px 12px",color:C.red,fontSize:13,marginBottom:16,display:"flex",alignItems:"center",gap:7}}><span>⚠️</span>{error}</div>}
          <button style={{...btn(C.indigo),width:"100%",padding:"12px 0",fontSize:14,borderRadius:10}} onClick={login}>
            Iniciar sesión →
          </button>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState(() => {
    const savedRol = sessionStorage.getItem("saji_rol")||"admin";
    const savedTab = "dashboard";
    return savedRol==="operativo" ? "inventarios" : savedTab;
  });
  const [showImport, setShowImport] = useState(false);
  const [ventaAbrir, setVentaAbrir] = useState(null);   // venta a abrir desde Inicio
  const [usuario,    setUsuario]    = useState(() => sessionStorage.getItem("saji_user")||"");
  const [rol,        setRol]        = useState(() => sessionStorage.getItem("saji_rol")||"admin");
  const [canPedidos, setCanPedidos] = useState(() => {
    const u = sessionStorage.getItem("saji_user")||"";
    const found = USUARIOS.find(x=>x.user.toLowerCase()===u.toLowerCase());
    return found?.pedidos||false;
  });

  const [pedidos,    setPedidos,    loadedPed]  = useSupabase("pedidos",    []);
  const [ventas,        setVentas,        loadedVen]  = useSupabase("ventas",        []);
  const [gastos,     setGastos,     loadedGas]  = useSupabase("gastos",     []);
  const [pagos,      setPagos,      loadedPag]  = useSupabase("pagos",      []);
  const [fruta,      setFruta,      loadedFru]  = useSupabase("fruta",      []);
  const [clientes,   setClientes,   loadedCli]  = useSupabase("catalogos_clientes",   INIT_CLI);
  const [productos,  setProductos,  loadedPro]  = useSupabase("catalogos_productos",  INIT_PROD);
  const [proveedores,setProveedores,loadedProv] = useSupabase("catalogos_proveedores",["Frasavo","Mosco"]);
  const [bitacora,   setBitacora,   loadedBit]  = useSupabase("bitacora", []);
  const [inventario, setInventario, loadedInv]  = useSupabase("inventario", []);

  const todoCargado = loadedPed && loadedVen && loadedGas && loadedPag && loadedFru && loadedCli && loadedPro && loadedProv && loadedBit && loadedInv;

  const logBit = (accion, detalle="") => {
    const reg = { id:Date.now(), fecha:todayStr(), hora:new Date().toLocaleTimeString("es-MX",{hour:"2-digit",minute:"2-digit"}), usuario, accion, detalle };
    setBitacora(b=>[reg,...b.slice(0,499)]);
  };

  const exportExcel = async () => {
    // Cargar SheetJS dinámicamente
    if(!window.XLSX) {
      await new Promise((res,rej)=>{ const s=document.createElement("script"); s.src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
    }
    const X = window.XLSX;
    const toRows = (rows, cols) => [cols.map(c=>c.l), ...rows.map(r=>cols.map(c=>r[c.k]??""))];
    const wb = X.utils.book_new();
    const sheets = [
      { name:"Venta",    rows:toRows(ventas.map(v=>({...v,_d:diasPend(v)})), [{l:"Pedido",k:"pedido"},{l:"SEM",k:"sem"},{l:"DÍA",k:"dia"},{l:"MES",k:"mes"},{l:"FECHA",k:"fecha"},{l:"CLIENTE",k:"cliente"},{l:"Producto",k:"producto"},{l:"KG",k:"kg"},{l:"$/KG",k:"precio"},{l:"Total",k:"total"},{l:"TIPO DE PAGO",k:"tipoPago"},{l:"ESTATUS PAGO",k:"estatus"},{l:"FACTURA",k:"factura"},{l:"DÍAS PEND.",k:"_d"},{l:"F. PAGO",k:"fpago"}]) },
      { name:"Gastos",   rows:toRows(gastos,  [{l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},{l:"Descripcion",k:"gasto"},{l:"Tipo Gasto",k:"tipoGasto"},{l:"Metodo Pago",k:"metodoPago"},{l:"Estatus",k:"estatusPago"},{l:"Monto",k:"monto"}]) },
      { name:"Pagos",    rows:toRows(pagos,   [{l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},{l:"Cliente",k:"cliente"},{l:"Tipo Pago",k:"tipoPago"},{l:"#Pedido",k:"pedidoId"},{l:"Monto",k:"monto"}]) },
      { name:"Fruta",    rows:toRows(fruta.filter(f=>!f.tipo), [{l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},{l:"Proveedor",k:"proveedor"},{l:"Producto",k:"producto"},{l:"Calibre",k:"calibre"},{l:"KG",k:"cantidad"},{l:"Precio",k:"precio"},{l:"Total",k:"total"},{l:"Factura",k:"factura"},{l:"Fecha Factura",k:"fechaFactura"},{l:"Metodo Pago",k:"metodoPago"},{l:"Estatus",k:"estatusPago"}]) },
      { name:"Pedidos",  rows:toRows(pedidos, [{l:"#Pedido",k:"id"},{l:"Fecha",k:"fecha"},{l:"Cliente",k:"cliente"},{l:"Fecha Entrega",k:"fechaEntrega"},{l:"Total",k:"total"},{l:"Estatus",k:"estatus"},{l:"Tipo Pago",k:"tipoPago"},{l:"Factura",k:"factura"}]) },
      { name:"Bitacora", rows:toRows(bitacora,[{l:"Fecha",k:"fecha"},{l:"Hora",k:"hora"},{l:"Usuario",k:"usuario"},{l:"Accion",k:"accion"},{l:"Detalle",k:"detalle"}]) },
    ];
    sheets.forEach(s=>{ const ws=X.utils.aoa_to_sheet(s.rows); X.utils.book_append_sheet(wb,ws,s.name); });
    X.writeFile(wb, `SAJI-Group-${todayStr()}.xlsx`);
  };

  const handleLogin = (nombre, rolUsuario, pedidos) => {
    sessionStorage.setItem("saji_user",    nombre);
    sessionStorage.setItem("saji_rol",     rolUsuario||"admin");
    sessionStorage.setItem("saji_pedidos", pedidos?"true":"false");
    setUsuario(nombre);
    setRol(rolUsuario||"admin");
    setCanPedidos(pedidos||false);
    setTab(rolUsuario==="operativo" ? (pedidos?"pedidos":"inventarios") : "dashboard");
  };

  const handleLogout = () => {
    sessionStorage.removeItem("saji_user");
    sessionStorage.removeItem("saji_rol");
    sessionStorage.removeItem("saji_pedidos");
    setUsuario("");
    setRol("admin");
    setCanPedidos(false);
  };

  // Mostrar login si no hay sesión
  if(!usuario) return <LoginScreen onLogin={handleLogin}/>;

  const NAV = rol==="operativo"
    ? [{ g:"Operación", items:[
          ...(canPedidos?[{ id:"pedidos", label:"Pedidos", icon:"list" }]:[]),
          { id:"inventarios", label:"Inventarios", icon:"box" },
        ]}]
    : [
        { g:"General",   items:[{ id:"dashboard", label:"Inicio", icon:"home" },{ id:"pedidos", label:"Pedidos", icon:"list" },{ id:"ventas", label:"Ventas", icon:"leaf" },{ id:"facturacion", label:"Facturación", icon:"book" }] },
        { g:"Operación", items:[{ id:"gastos", label:"Gastos", icon:"wallet" },{ id:"fruta", label:"Proveedor", icon:"truck" },{ id:"inventarios", label:"Inventarios", icon:"box" }] },
        { g:"Sistema",   items:[{ id:"catalogos", label:"Catálogos", icon:"layers" },{ id:"bitacora", label:"Bitácora", icon:"book" }] },
      ];

  // Pantalla de carga mientras conecta con Supabase
  if(!todoCargado) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:20,fontFamily:"'Inter','Segoe UI',system-ui,sans-serif"}}>
      <div style={{width:56,height:56,borderRadius:16,background:"linear-gradient(135deg,#22c55e,#15803d)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 24px rgba(21,128,61,.25)"}}>
        <SAJILogo s={34}/>
      </div>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:18,fontWeight:700,color:C.text,letterSpacing:"-0.2px"}}>SAJI Group</div>
        <div style={{fontSize:13,color:C.muted,marginTop:4}}>Cargando tu espacio de trabajo…</div>
      </div>
      <div style={{width:180,height:3,background:C.border,borderRadius:2,overflow:"hidden"}}>
        <div style={{height:"100%",background:"linear-gradient(90deg,#16a34a,#15803d)",borderRadius:2,animation:"loading 1.5s ease-in-out infinite",width:"60%"}}/>
      </div>
      <style>{`
  @keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
  @media(min-width:600px){.kpi-grid{grid-template-columns:repeat(5,1fr)!important}}
  @media(max-width:599px){.kpi-grid{grid-template-columns:repeat(2,1fr)!important}}
`}</style>
    </div>
  );

  return (
    <div className="saji-app">

      <style>{GLOBAL_CSS}</style>

      {/* ── MENÚ LATERAL (en celular pasa a barra inferior) ─────────── */}
      <aside className="saji-aside">
        <div className="saji-brand" onClick={()=>window.location.reload()}>
          <SAJILogo s={44}/>
          <div style={{lineHeight:1.2}}>
            <div style={{fontWeight:800,fontSize:15,letterSpacing:"-0.3px"}}>SAJI Group</div>
            <div style={{fontSize:11,color:C.muted}}>Gestión Comercial</div>
          </div>
        </div>
        <nav className="saji-nav">
          {NAV.map(sec=>(
            <Fragment key={sec.g}>
              <div className="saji-group">{sec.g}</div>
              {sec.items.map(t=>(
                <button key={t.id} onClick={()=>setTab(t.id)} className={"saji-link"+(tab===t.id?" on":"")}>
                  <Icon n={t.icon} s={17}/><span>{t.label}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </nav>
        <div className="saji-asidefoot">
          {rol==="admin"&&<button style={{...btnO(C.muted),width:"100%",marginBottom:6,fontSize:12}} onClick={()=>setShowImport(true)}>Importar</button>}
          {rol==="admin"&&<button style={{...btnO(C.muted),width:"100%",fontSize:12}} onClick={exportExcel}>Exportar Excel</button>}
        </div>
      </aside>

      <div className="saji-body">
        {/* ── BARRA SUPERIOR ──────────────────────────────────────────── */}
        <header className="saji-top">
          <div className="saji-brand-sm">
            <SAJILogo s={36}/>
            <strong style={{fontSize:14}}>SAJI Group</strong>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:8,marginLeft:"auto"}}>
            {rol==="operativo"&&<span style={{background:"#fef3c7",color:"#92400e",fontSize:10,fontWeight:700,padding:"3px 9px",borderRadius:20}}>OPERATIVO</span>}
            <div title={usuario} style={{width:34,height:34,borderRadius:"50%",background:"linear-gradient(135deg,#22c55e,#15803d)",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700,color:"#fff"}}>{usuario.charAt(0).toUpperCase()}</div>
            <span style={{fontSize:13,fontWeight:600}} className="saji-hide-sm">{usuario}</span>
            <button onClick={handleLogout} style={{...btnO(C.muted),padding:"7px 10px",fontSize:12,display:"flex",alignItems:"center",gap:6}}><Icon n="out" s={14}/><span className="saji-hide-sm">Salir</span></button>
          </div>
        </header>

        <AvisoGuardado/>

        <main className="saji-main saji-view" key={tab}>
          {tab==="dashboard"   && rol==="admin" && <Dashboard pedidos={pedidos} ventas={ventas} gastos={gastos} fruta={fruta.filter(f=>!f.tipo)} compras={fruta.filter(f=>!f.tipo)}
              onVerVenta={v=>{ setVentaAbrir(v); setTab("ventas"); }}/>}
          {tab==="pedidos"     && <Pedidos pedidos={pedidos} setPedidos={setPedidos} ventas={ventas} setVentas={setVentas} setPagos={setPagos} pagos={pagos} clientes={clientes} productos={productos} logBit={logBit} rol={rol}/>}
          {tab==="ventas"      && rol==="admin" && <Ventas ventas={ventas} setVentas={setVentas} clientes={clientes} productos={productos} compras={fruta.filter(f=>!f.tipo)} logBit={logBit}
              abrirVenta={ventaAbrir} onAbierta={()=>setVentaAbrir(null)}/>}
          {tab==="facturacion" && rol==="admin" && <Facturacion ventas={ventas} setVentas={setVentas} clientes={clientes} productos={productos} logBit={logBit}/>}
          {tab==="gastos"      && rol==="admin" && <Gastos gastos={gastos} setGastos={setGastos} logBit={logBit}/>}
          {tab==="fruta"       && rol==="admin" && <Fruta fruta={fruta} setFruta={setFruta} productos={productos} proveedores={proveedores} logBit={logBit}/>}
          {tab==="inventarios" && <Inventarios inventario={inventario} setInventario={setInventario} logBit={logBit}/>}
          {tab==="bitacora"    && rol==="admin" && <Bitacora bitacora={bitacora} setBitacora={setBitacora}/>}
          {tab==="catalogos"   && rol==="admin" && <Catalogos clientes={clientes} setClientes={setClientes} productos={productos} setProductos={setProductos} proveedores={proveedores} setProveedores={setProveedores}/>}
        </main>
      </div>

      {showImport&&<ImportModal onClose={()=>setShowImport(false)} setPedidos={setPedidos} setVentas={setVentas} setGastos={setGastos} setFruta={setFruta} setPagos={setPagos}/>}
    </div>
  );
}
