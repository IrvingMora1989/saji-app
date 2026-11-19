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

// ─── useSupabase — reemplaza usePersist con sync en tiempo real ───────────────
const useSupabase = (tabla, init) => {
  const [val, setVal] = useState(init);
  const [loaded, setLoaded] = useState(false);

  // Cargar datos iniciales
  useEffect(() => {
    loadTable(tabla).then(data => {
      if (data) setVal(data);
      setLoaded(true);
    });
  }, [tabla]);

  // Escuchar cambios en tiempo real (cuando tu socio modifica algo)
  useEffect(() => {
    const sub = subscribeTable(tabla, (newData) => {
      setVal(newData);
    });
    return () => sub.unsubscribe();
  }, [tabla]);

  // Guardar en Supabase cada vez que cambia el valor
  const set = useCallback(v => {
    setVal(prev => {
      const next = typeof v === "function" ? v(prev) : v;
      saveTable(tabla, next);
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
.saji-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}
.saji-cols{display:grid;grid-template-columns:1.6fr 1fr;gap:16px;align-items:start}
.saji-row{display:grid;grid-template-columns:70px 1.5fr 1.2fr 1.1fr 120px 16px;gap:12px;align-items:center;padding:12px 6px;border-bottom:1px solid #f0f2ee;cursor:pointer;transition:background .15s ease}
.saji-row:last-child{border-bottom:0}
.saji-row:hover{background:#f7faf6}
.saji-only-sm{display:none}
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
  .saji-filtros select{flex:1 1 calc(50% - 4px)!important;min-width:0}
  .saji-filtros input{flex:1 1 100%!important}
  .saji-drawer{border-radius:20px;padding:20px;margin-top:10px}
}
`;

const pEmoji = n => ({"Aguacate":"🥑","Cebolla":"🧅","Mango":"🥭","Limón":"🍋","Tomate":"🍅","Chile":"🌶️"}[n]||"📦");

// ─── Gastos catálogo ──────────────────────────────────────────────────────────
const TIPOS_GASTO = {
  "Alquiler Inmuebles": ["Renta Casa","Cámara frío"],
  "Otros Gastos": ["Comida","Super Jasso","Super Irving","Super SAJI","Servicio Caddy","Servicio Duty","Servicio Auto Irving","Servicio Auto Jasso","Propina","Mantenimiento Cámara","Ferretería","Refaccionaria","Caja","Otras compras"],
  "Energías": ["Luz Casa","Luz Trifásica"],
  "Gastos de Viaje": ["Tag","Caseta","Gasolina Caddy","Gasolina Duty","Gasolina Jasso","Gasolina Irving"],
  "Gastos de Personal": ["Nómina Daniel","Nómina Héctor","Nómina José","Nómina Irving","Nómina Jasso","Nómina Aldair","Nómina Angel"],
  "Servicios Contratados": ["Internet","Agua","GPS Caddy","GPS Duty"],
  "Créditos": ["Santander"],
  "Crédito Automotriz": ["Caddy","Super Dutty"],
  "Facturas": ["Cobro por factura"],
  "Impuestos": ["ISR","IVA"],
};
const METODOS_PAGO = ["Efectivo","Tarjeta Jasso","Tarjeta Irving","Tarjeta SAJI","Transferencia SAJI","Transferencia Jasso"];


// ─── Helpers de ventas ────────────────────────────────────────────────────────
const num      = v => { const n=parseFloat(v); return isNaN(n)?0:n; };
const esPend   = v => String(v.estatus||v.estatusPago||"").toLowerCase().trim()!=="pagado";
const diasPend = v => esPend(v) ? daysDiff(v.fecha) : 0;

// ─── Piezas de UI ─────────────────────────────────────────────────────────────
const h3s = { margin:"0 0 14px", fontSize:15, fontWeight:700, color:C.text };

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
function FilterBar({ filter, setFilter, count }) {
  return (
    <div style={{background:C.card,borderRadius:10,padding:"10px 14px",marginBottom:12,border:`1px solid ${C.border}`,boxShadow:C.shadow}}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:C.muted,fontSize:12,fontWeight:700}}>📅 Ver por:</span>
        {[{k:"todo",l:"Todo"},{k:"hoy",l:"Hoy"},{k:"semana",l:"Semana"},{k:"mes",l:"Mes"},{k:"fecha",l:"📆 Fecha"}].map(f=>(
          <button key={f.k} style={nb(filter.tipo===f.k)} onClick={()=>setFilter({tipo:f.k,valor:""})}>{f.l}</button>
        ))}
        {count!=null&&<span style={{color:C.muted,fontSize:12,marginLeft:"auto"}}>{count} registro{count!==1?"s":""}</span>}
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
function Dashboard({ pedidos, ventas, gastos, fruta }) {
  const [f, setF] = useState({tipo:"todo",valor:"",desde:"",hasta:""});

  const vF  = applyFilter(ventas, f);
  const gF  = applyFilter(gastos, f);
  const frF = applyFilter(fruta,  f);
  const pendPedidos = pedidos.filter(p=>p.estatus==="pendiente").length;

  const totalVentas = vF.reduce((s,v)=>s+num(v.total),0);
  const totalKg     = vF.reduce((s,v)=>s+num(v.kg),0);
  const esImp       = g => ["isr","iva"].includes(String(g.gasto||"").toLowerCase().trim());
  const gastosOp    = gF.filter(g=>!esImp(g)).reduce((s,g)=>s+num(g.monto),0);
  const totalISR    = gF.filter(g=>String(g.gasto||"").toLowerCase().trim()==="isr").reduce((s,g)=>s+num(g.monto),0);
  const totalIVA    = gF.filter(g=>String(g.gasto||"").toLowerCase().trim()==="iva").reduce((s,g)=>s+num(g.monto),0);
  const totalGastos = gF.reduce((s,g)=>s+num(g.monto),0);
  const costoFruta  = frF.reduce((s,x)=>s+num(x.total),0);
  const totalFruta  = costoFruta;
  const uBruta      = totalVentas - costoFruta;
  const uOperat     = uBruta - gastosOp;
  const utilidad    = uOperat - totalISR - totalIVA;   // utilidad neta
  const pct         = v => totalVentas ? `${(v/totalVentas*100).toFixed(1)}%` : "0%";
  const filas = [
    { concepto:"Ventas totales",          monto:totalVentas, c:C.green, bold:true  },
    { concepto:"(–) Costo de ventas (fruta)", monto:costoFruta, c:C.muted, bold:false },
    { concepto:"= Utilidad bruta",        monto:uBruta,      c:uBruta>=0?C.amber:C.red,  bold:true  },
    { concepto:"(–) Gastos operativos",   monto:gastosOp,    c:C.muted, bold:false },
    { concepto:"= Utilidad operativa",    monto:uOperat,     c:uOperat>=0?C.teal:C.red,  bold:true  },
    { concepto:"(–) ISR",                 monto:totalISR,    c:C.muted, bold:false },
    { concepto:"(–) IVA",                 monto:totalIVA,    c:C.muted, bold:false },
    { concepto:"= Utilidad neta",         monto:utilidad,    c:utilidad>=0?C.green:C.red, bold:true },
  ];

  // Por cobrar: siempre acumulado (no depende del período)
  const pend = ventas.filter(v=>esPend(v));
  const porCobrar = pend.reduce((s,v)=>s+num(v.total),0);
  const deuda = {};
  pend.forEach(v=>{
    const c = normCliente(v.cliente)||"—";
    if(!deuda[c]) deuda[c]={cli:c,monto:0,n:0,dias:0};
    deuda[c].monto += num(v.total); deuda[c].n++;
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
        <Kpi hi label="Utilidad neta" value={fmt(utilidad)}/>
        <Kpi label="Ventas" value={fmt(totalVentas)} sub={`${totalKg.toLocaleString("es-MX",{maximumFractionDigits:1})} kg`}/>
        <Kpi label="Gastos + compras" value={fmt(totalGastos+costoFruta)}/>
        <Kpi label="Por cobrar" value={fmt(porCobrar)} color={porCobrar>0?C.red:C.green}/>
      </div>

      <div className="saji-cols">
        <div style={card}>
          <h3 style={h3s}>Estado de Resultados</h3>
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
                    <div key={d.cli} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #f0f2ee"}}>
                      <div style={{minWidth:0}}>
                        <div style={{fontWeight:600,fontSize:14}}>{d.cli}</div>
                        <div style={{fontSize:11,color:C.muted}}>{d.n} venta{d.n>1?"s":""} · {d.dias} día{d.dias===1?"":"s"}</div>
                      </div>
                      <strong style={{color:C.red,fontSize:15}}>{fmt(d.monto)}</strong>
                    </div>
                  ))}
                  <div style={{display:"flex",justifyContent:"space-between",marginTop:12,padding:"10px 14px",background:C.redL,borderRadius:12}}>
                    <strong style={{color:C.red,fontSize:12,letterSpacing:".4px"}}>TOTAL</strong>
                    <strong style={{color:C.red,fontSize:16}}>{fmt(porCobrar)}</strong>
                  </div>
                </>}
          </div>
          <div style={card}>
            <h3 style={h3s}>Pendientes</h3>
            <Linea l="Pedidos por entregar" v={String(pendPedidos)}/>
            <Linea l="Ventas por cobrar" v={String(pend.length)}/>
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

function Pedidos({ pedidos, setPedidos, setVentas, setPagos, pagos, clientes, productos, logBit, rol }) {
  const esOperativo = rol==="operativo";
  const [show,         setShow]        = useState(false);
  const [filter,       setFilter]      = useState("pendiente");
  const [form,         setForm]        = useState({ cliente:"", fechaEntrega:"", tipoPago:"efectivo", factura:"no", items:[emptyItem()] });
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

  const guardar = () => {
    if(!form.cliente||!form.fechaEntrega) return alert("Completa cliente y fecha de entrega");
    if(form.items.some(it=>!it.producto||!it.cantidad||!it.precio)) return alert("Completa todos los productos");
    const np={id:genId(pedidos),fecha:todayStr(),...form,total:totalForm,estatus:"pendiente"};
    setPedidos(ps=>[np,...ps]);
    logBit("Nuevo pedido",`#${np.id} · ${form.cliente} · ${fmt(totalForm)}`);
    setForm({ cliente:"", fechaEntrega:"", tipoPago:"efectivo", factura:"no", items:[emptyItem()] });
    setShow(false);
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
  };

  // Always show only pending pedidos
  const lista = pedidos.filter(p=>p.estatus==="pendiente")
    .slice().sort((a,b)=>(b.fecha||b.fechaEntrega||'').localeCompare(a.fecha||a.fechaEntrega||''));

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <h2 style={{...h2s,margin:0}}>📦 Pedidos Pendientes</h2>
        <button style={btn()} onClick={()=>setShow(true)}>+ Nuevo Pedido</button>
      </div>

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
              <tr>{["Cliente","Producto","Calibre","KG","$/kg","Subtotal","F.Entrega","Fact.","Pago","#Ped",""].map(h=>(
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
                    <td style={{...td,fontWeight:700,fontSize:12,padding:"7px 6px"}}>{it.cantidad}kg</td>
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
      {completando&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:480}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.green}}>⚖️ Confirmar KG reales</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setCompletando(null)}>×</button>
            </div>
            <div style={{background:C.amberL,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.amber,fontWeight:600,marginBottom:14}}>
              📦 Pedido #{completando.id} · {completando.cliente}<br/>
              <span style={{fontSize:11,fontWeight:400}}>Edita los KG si el cliente pesó diferente al pedido original</span>
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
                    <label style={{...lbl,margin:"0 0 2px"}}>KG pedido: <strong>{it.cantidad}</strong></label>
                    <div style={{display:"flex",alignItems:"center",gap:6}}>
                      <label style={lbl}>KG real *</label>
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
              <h3 style={{margin:0,color:C.green,fontSize:16}}>📦 Nuevo Pedido</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShow(false)}>×</button>
            </div>
            <div style={g2}>
              <div><label style={lbl}>Cliente *</label>
                <select style={sel} value={form.cliente} onChange={e=>sf("cliente",e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {clientes.map(c=><option key={c}>{c}</option>)}
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
                      {productos.map(p=><option key={p.nombre}>{p.nombre}</option>)}
                    </select>
                  </div>
                  <div style={{flex:"1 1 100px"}}><label style={lbl}>Calibre</label>
                    <select style={sel} value={it.calibre} onChange={e=>setItem(i,"calibre",e.target.value)} disabled={!it.producto}>
                      {getCals(it.producto).map(c=><option key={c}>{c}</option>)}
                    </select>
                  </div>
                  <div style={{flex:"1 1 80px"}}><label style={lbl}>KG</label>
                    <input type="number" inputMode="decimal" style={inp} placeholder="0" value={it.cantidad} onChange={e=>setItem(i,"cantidad",e.target.value)}/>
                  </div>
                  <div style={{flex:"1 1 90px"}}><label style={lbl}>$/kg</label>
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
              <button style={btnO()} onClick={()=>setShow(false)}>Cancelar</button>
              <button style={btn()} onClick={guardar}>💾 Guardar Pedido</button>
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

function Ventas({ ventas, setVentas, clientes, productos, logBit }) {
  const [f,       setF]       = useState({tipo:"todo",valor:"",desde:"",hasta:""});
  const [q,       setQ]       = useState("");
  const [fCli,    setFCli]    = useState("");
  const [fProd,   setFProd]   = useState("");
  const [fEst,    setFEst]    = useState("");
  const [sel_,    setSel]     = useState(null);   // venta abierta en el panel
  const [form,    setForm]    = useState(null);   // borrador del panel
  const [nueva,   setNueva]   = useState(false);

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

  const abrir = v => { setNueva(false); setSel(v.id); setForm({...v}); };
  const abrirNueva = () => { setNueva(true); setSel("nueva"); setForm(ventaEmpty()); };
  const cerrar = () => { setSel(null); setForm(null); setNueva(false); };

  const guardar = () => {
    if(!form.cliente||!form.producto||!form.kg||!form.precio) return alert("Completa cliente, producto, KG y precio.");
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
    if(nueva){ setVentas(vs=>[reg,...vs]); logBit("Nueva venta",`${reg.pedido} · ${reg.cliente} · ${fmt(reg.total)}`); }
    else     { setVentas(vs=>vs.map(v=>v.id===reg.id?reg:v)); logBit("Editó venta",`${reg.pedido} · ${reg.cliente} · ${fmt(reg.total)}`); }
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
  const kgTot  = lista.reduce((s,v)=>s+num(v.kg),0);
  const pendT  = lista.filter(esPend).reduce((s,v)=>s+num(v.total),0);
  const facT   = lista.filter(v=>String(v.tipoPago||"").toLowerCase()!=="efectivo" && ["","pedir","pedida"].includes(String(v.factura||"").toLowerCase())).length;

  const cliList  = [...new Set(ventas.map(v=>normCliente(v.cliente)).filter(Boolean))].sort();
  const prodList = [...new Set(ventas.map(v=>v.producto).filter(Boolean))].sort();

  const cols = [
    {l:"Pedido",k:"pedido"},{l:"SEM",k:"sem"},{l:"DÍA",k:"dia"},{l:"MES",k:"mes"},{l:"FECHA",k:"fecha"},
    {l:"CLIENTE",k:"cliente"},{l:"Producto",k:"producto"},{l:"KG",k:"kg"},{l:"$/KG",k:"precio"},{l:"Total",k:"total"},
    {l:"TIPO DE PAGO",k:"tipoPago"},{l:"ESTATUS PAGO",k:"estatus"},{l:"FACTURA",k:"factura"},{l:"DÍAS PEND.",k:"_d"},{l:"F. PAGO",k:"fpago"},
  ];

  return (
    <div>
      <PageHead titulo="Ventas" sub="Se registran al confirmar un pedido"
        extra={<>
          <button style={btnO(C.muted)} onClick={()=>document.getElementById("impVentasJSON").click()}>Importar</button>
          <button style={btnO(C.muted)} onClick={()=>exportCSV(lista.map(v=>({...v,_d:diasPend(v)})),cols,`ventas-${todayStr()}.csv`)}>Exportar</button>
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

      <div className="saji-kpis" style={{marginBottom:16}}>
        <Kpi hi label="Total vendido" value={fmt(tot)} sub={`${lista.length} ventas`}/>
        <Kpi label="Kilos" value={kgTot.toLocaleString("es-MX",{maximumFractionDigits:1})}/>
        <Kpi label="Por cobrar" value={fmt(pendT)} color={pendT>0?C.red:C.green}/>
        <Kpi label="Facturas pendientes" value={String(facT)} color={facT>0?C.amber:C.green}/>
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
        <FilterBar filter={f} setFilter={setF} count={lista.length}/>

        {lista.length===0
          ? <p style={{color:C.muted,textAlign:"center",padding:"28px 0",margin:0}}>No hay ventas con estos filtros.</p>
          : lista.map(v=>{
              const pend = esPend(v);
              const fac  = String(v.factura||"");
              const facL = fac.toLowerCase();
              return (
                <div key={v.id} className="saji-row" onClick={()=>abrir(v)}>
                  <span style={{fontWeight:700,color:C.indigo,fontSize:13}}>{v.pedido||"—"}</span>
                  <div style={{minWidth:0}}>
                    <div style={{fontWeight:600,fontSize:14,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{v.cliente}</div>
                    <div style={{fontSize:11,color:C.muted}}>{fmtDate(v.fecha)} · Sem {v.sem||weekOf(v.fecha)}</div>
                    <div className="saji-only-sm" style={{fontSize:11,color:C.muted,marginTop:2}}>
                      {v.producto} · {num(v.kg).toLocaleString("es-MX",{maximumFractionDigits:2})} kg
                      <span style={{color:pend?C.amber:C.green,fontWeight:600}}> · {pend?"Pendiente":"Pagado"}</span>
                    </div>
                  </div>
                  <div className="saji-hide-sm" style={{fontSize:13}}>
                    <div style={{fontWeight:600}}>{v.producto}</div>
                    <div style={{fontSize:11,color:C.muted}}>{num(v.kg).toLocaleString("es-MX",{maximumFractionDigits:2})} kg · {fmt(v.precio)}/kg</div>
                  </div>
                  <div className="saji-hide-sm">
                    <span style={badge(pend?C.amber:C.green)}>{pend?"Pendiente":"Pagado"}</span>
                    <div style={{fontSize:11,color:C.muted,marginTop:3}}>
                      {v.tipoPago}{(!fac||facL==="na")?"":` · ${facL==="pedir"?"Pedir factura":facL==="pedida"?"Factura pedida":fac}`}
                    </div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontWeight:700,fontSize:14}}>{fmt(v.total)}</div>
                    {pend&&diasPend(v)>0&&<div style={{fontSize:11,color:C.red}}>{diasPend(v)} días</div>}
                  </div>
                  <span style={{color:C.mutedL}}>›</span>
                </div>
              );
            })}
      </div>

      {/* ── Panel de detalle ─────────────────────────────────────────────── */}
      {form&&(
        <div style={modal} onClick={cerrar}>
          <div className="saji-drawer" onClick={e=>e.stopPropagation()}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:18}}>
              <div>
                <h3 style={{margin:0,fontSize:18}}>{nueva?"Nueva venta":`Pedido ${form.pedido||"—"}`}</h3>
                {!nueva&&<div style={{fontSize:12,color:C.muted,marginTop:3}}>{form.dia} {fmtDate(form.fecha)} · Semana {form.sem}</div>}
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
                <datalist id="cli-list">{[...new Set([...(clientes||[]),...ventas.map(v=>v.cliente)])].filter(Boolean).map(c=><option key={c} value={c}/>)}</datalist>
              </div>
              <div><label style={lbl}>Producto</label>
                <input style={inp} list="prod-list" value={form.producto} onChange={e=>sf("producto",e.target.value)}/>
                <datalist id="prod-list">{[...new Set([...(productos||[]).map(p=>p.nombre),...ventas.map(v=>v.producto)])].filter(Boolean).map(p=><option key={p} value={p}/>)}</datalist>
              </div>
            </div>
            <div style={{...g3,marginTop:12}}>
              <div><label style={lbl}>KG</label><input type="number" inputMode="decimal" style={inp} value={form.kg} onChange={e=>sf("kg",e.target.value)}/></div>
              <div><label style={lbl}>$ / KG</label><input type="number" inputMode="decimal" style={inp} value={form.precio} onChange={e=>sf("precio",e.target.value)}/></div>
              <div><label style={lbl}>Total</label><div style={{...inp,background:C.indigoL,fontWeight:700,color:C.indigo}}>{fmt(num(form.kg)*num(form.precio))}</div></div>
            </div>

            <div style={{height:1,background:C.border,margin:"20px 0"}}/>

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

            <div style={{display:"flex",justifyContent:"space-between",gap:8,marginTop:24}}>
              {!nueva
                ? <button style={btnO(C.red)} onClick={eliminar}>Eliminar</button>
                : <span/>}
              <div style={{display:"flex",gap:8}}>
                <button style={btnO(C.muted)} onClick={cerrar}>Cancelar</button>
                <button style={btn(C.indigo)} onClick={guardar}>Guardar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
// ════════════════════════════════════════════════════════════════════════════════
const gastoEmpty = () => ({ fecha:todayStr(), tipoGasto:"Alquiler Inmuebles", gasto:"", metodoPago:"Efectivo", estatusPago:"pagado", monto:"" });

function Gastos({ gastos, setGastos, logBit }) {
  const [show,      setShow]      = useState(false);
  const [editId,    setEditId]    = useState(null);
  const [form,      setForm]      = useState(gastoEmpty());
  const [filt,      setFilt]      = useState({tipo:"todo",valor:""});
  const [filtTipo,  setFiltTipo]  = useState("");
  const sf = (k,v) => setForm(f=>{
    const n={...f,[k]:v};
    if(k==="tipoGasto") n.gasto="";
    if(k==="metodoPago") n.estatusPago = v==="Efectivo" ? "pagado" : "porpagar";
    return n;
  });

  const openNew  = () => { setEditId(null); setForm(gastoEmpty()); setShow(true); };
  const openEdit = g => { setEditId(g.id); setForm({tipoGasto:g.tipoGasto||"Alquiler Inmuebles",gasto:g.gasto,fecha:g.fecha,metodoPago:g.metodoPago||"Efectivo",estatusPago:g.estatusPago||"pagado",monto:String(g.monto)}); setShow(true); };
  const guardar  = () => {
    if(!form.gasto||!form.monto) return alert("Completa descripción y monto");
    const reg = { id:editId||Date.now(), semana:weekOf(form.fecha), dia:dayOf(form.fecha), mes:monthOf(form.fecha), ...form, monto:parseFloat(form.monto) };
    if(editId) { setGastos(gs=>gs.map(g=>g.id===editId?reg:g)); logBit("Editó gasto",`${reg.gasto} · ${fmt(reg.monto)}`); }
    else { setGastos(gs=>[reg,...gs]); logBit("Nuevo gasto",`${reg.gasto} · ${fmt(reg.monto)}`); }
    setShow(false);
  };

  const cols=[
    {l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},
    {l:"Gasto",k:"gasto"},{l:"Tipo Gasto",k:"tipoGasto"},{l:"Metodo Pago",k:"metodoPago"},
    {l:"Estatus",k:"estatusPago"},{l:"Total",k:"monto"}
  ];
  const listaFecha = applyFilter(gastos, filt);
  const lista = (filtTipo ? listaFecha.filter(g=>g.tipoGasto===filtTipo) : listaFecha).slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  const total = lista.reduce((s,g)=>s+g.monto,0);
  const porPagar = lista.filter(g=>g.estatusPago==="porpagar").reduce((s,g)=>s+g.monto,0);
  const gastoOpts = TIPOS_GASTO[form.tipoGasto]||[];

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <div>
          <h2 style={{...h2s,margin:0}}>💸 Gastos</h2>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>
            Total: <strong style={{color:C.red}}>{fmt(total)}</strong>
            {porPagar>0&&<span> · Por pagar: <strong style={{color:C.amber}}>{fmt(porPagar)}</strong></span>}
          </div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button style={btn(C.blue)} onClick={()=>exportCSV(lista,cols,`gastos-${todayStr()}.csv`)}>⬇ CSV</button>
          <button style={btn(C.red)} onClick={openNew}>+ Nuevo Gasto</button>
        </div>
      </div>
      <FilterBar filter={filt} setFilter={setFilt} count={lista.length}/>

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
      {show&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:500}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.green}}>{editId?"✏️ Editar":"💸 Nuevo"} Gasto</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShow(false)}>×</button>
            </div>
            <div style={g2}>
              <div><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.fecha} onChange={e=>sf("fecha",e.target.value)}/></div>
              <div><label style={lbl}>Tipo de gasto</label>
                <select style={sel} value={form.tipoGasto} onChange={e=>sf("tipoGasto",e.target.value)}>
                  {Object.keys(TIPOS_GASTO).map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{gridColumn:"1/-1"}}><label style={lbl}>Descripción específica *</label>
                <select style={sel} value={form.gasto} onChange={e=>sf("gasto",e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {gastoOpts.map(g=><option key={g}>{g}</option>)}
                  <option value="__otro">Otro (escribir)</option>
                </select>
                {form.gasto==="__otro"&&<input style={{...inp,marginTop:6}} placeholder="Describir gasto" value={form.gastoCustom||""} onChange={e=>sf("gastoCustom",e.target.value)}/>}
              </div>
              <div><label style={lbl}>Monto *</label>
                <input type="number" inputMode="decimal" style={inp} placeholder="0.00" value={form.monto} onChange={e=>sf("monto",e.target.value)}/>
              </div>
              <div><label style={lbl}>Método de pago</label>
                <select style={sel} value={form.metodoPago} onChange={e=>sf("metodoPago",e.target.value)}>
                  {METODOS_PAGO.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              {form.metodoPago!=="Efectivo"&&(
                <div style={{gridColumn:"1/-1"}}>
                  <div style={{background:C.amberL,border:`1px solid ${C.amber}44`,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.amber,fontWeight:600,marginBottom:6}}>
                    💳 {form.metodoPago} → se registra como ⏳ pendiente de pago
                  </div>
                  <label style={lbl}>Estatus del pago</label>
                  <select style={sel} value={form.estatusPago} onChange={e=>sf("estatusPago",e.target.value)}>
                    <option value="porpagar">⏳ Por pagar</option><option value="pagado">✅ Pagado</option>
                  </select>
                </div>
              )}
              {form.metodoPago==="Efectivo"&&(
                <div style={{gridColumn:"1/-1",background:C.greenL,borderRadius:8,padding:"8px 12px",fontSize:12,color:C.green,fontWeight:600}}>
                  ✅ Efectivo → automáticamente marcado como pagado
                </div>
              )}
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setShow(false)}>Cancelar</button>
              <button style={btn(C.red)} onClick={()=>{
                const finalGasto = form.gasto==="__otro"?(form.gastoCustom||""):form.gasto;
                if(!finalGasto||!form.monto) return alert("Completa todos los campos");
                const reg = { id:editId||Date.now(), semana:weekOf(form.fecha), dia:dayOf(form.fecha), mes:monthOf(form.fecha), ...form, gasto:finalGasto, monto:parseFloat(form.monto), estatusPago: form.metodoPago==="Efectivo" ? "pagado" : (form.estatusPago||"porpagar") };
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
const frutaEmpty = () => ({ fecha:todayStr(), proveedor:"", producto:"", calibre:"", cantidad:"", precio:"", factura:"", fechaFactura:"", metodoPago:"Efectivo", estatusPago:"pagado" });

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
    if(k==="producto"){ const p=productos.find(x=>x.nombre===v); n.calibre=p?.calibres[0]||""; }
    if(k==="metodoPago") n.estatusPago = v==="Efectivo" ? "pagado" : "porpagar";
    return n;
  });
  const sfp = (k,v) => setPagoForm(f=>({...f,[k]:v}));

  const guardarCompra = () => {
    if(!form.proveedor||!form.producto||!form.cantidad||!form.precio) return alert("Completa los campos requeridos");
    const reg = {
      id:editId||Date.now(), semana:weekOf(form.fecha), dia:dayOf(form.fecha), mes:monthOf(form.fecha),
      ...form, cantidad:parseFloat(form.cantidad), precio:parseFloat(form.precio),
      total:parseFloat(form.cantidad)*parseFloat(form.precio),
      // Efectivo siempre es pagado de inmediato; otros métodos usan el valor del form
      estatusPago: form.metodoPago==="Efectivo" ? "pagado" : (form.estatusPago||"porpagar"),
    };
    if(editId) { setFruta(fs=>fs.map(f=>f.id===editId?reg:f)); setEditId(null); logBit("Editó compra fruta",`${reg.proveedor} · ${reg.producto} · ${fmt(reg.total)}`); }
    else { setFruta(fs=>[reg,...fs]); logBit("Nueva compra fruta",`${reg.proveedor} · ${reg.producto} · ${reg.cantidad}kg · ${fmt(reg.total)}`); }
    setForm(frutaEmpty()); setShowComp(false);
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
  const listaFechaFruta = applyFilter(compras, filt);
  const listaComp = (filtProv ? listaFechaFruta.filter(c=>c.proveedor===filtProv) : listaFechaFruta).slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));

  // Proveedores que ya tienen compras registradas (para el saldo)
  const existingProveedores = [...new Set(compras.map(c=>c.proveedor))];
  const saldoProveedor = prov => {
    const totalCompras = compras.filter(c=>c.proveedor===prov).reduce((s,c)=>s+c.total,0);
    const totalPagos   = pagosF.filter(p=>p.proveedor===prov).reduce((s,p)=>s+p.monto,0);
    return { totalCompras, totalPagos, pendiente:totalCompras-totalPagos };
  };

  const cols=[
    {l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},
    {l:"Proveedor",k:"proveedor"},{l:"Producto",k:"producto"},{l:"Calibre",k:"calibre"},
    {l:"Cantidad KG",k:"cantidad"},{l:"Precio",k:"precio"},{l:"Total",k:"total"},
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
              <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:6}}>
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
        <div style={{display:"flex",gap:7}}>
          <button style={btn(C.blue)} onClick={()=>exportCSV(listaComp,cols,`fruta-${todayStr()}.csv`)}>⬇ CSV</button>
          <button style={btn(C.teal)} onClick={()=>{ setPagoForm({ proveedor:"", fecha:todayStr(), monto:"", metodoPago:"Efectivo" }); setShowPago(true); }}>💳 Pago a Proveedor</button>
          <button style={btn()} onClick={()=>{ setEditId(null); setForm(frutaEmpty()); setShowComp(true); }}>+ Nueva Compra</button>
        </div>
      </div>

      {/* Saldo por proveedor */}
      {existingProveedores.length>0&&(
        <div style={card}>
          <div style={{fontWeight:800,fontSize:14,marginBottom:12}}>💰 Saldo por Proveedor</div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
              <thead><tr>{["Proveedor","Compras","Pagado","Pendiente",""].map(h=><th key={h} style={{...th,padding:"7px 8px",fontSize:10}}>{h}</th>)}</tr></thead>
              <tbody>
                {existingProveedores.map(prov=>{
                  const s=saldoProveedor(prov);
                  const pagosProv = pagosF.filter(p=>p.proveedor===prov);
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
                                <td style={{...td,fontSize:11}} colSpan={2}>{pg.metodoPago}</td>
                                <td style={{...td,color:C.green,fontWeight:600,fontSize:12}}>{fmt(pg.monto)}</td>
                                <td style={td}><button style={{...btn(C.red),padding:"3px 7px",fontSize:11}} onClick={()=>setFruta(fs=>fs.filter(x=>x.id!==pg.id))}>✕</button></td>
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
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:12,boxShadow:C.shadow,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:C.muted,fontSize:12,fontWeight:700}}>🚛 Proveedor:</span>
        <button style={nb(!filtProv)} onClick={()=>setFiltProv("")}>Todos</button>
        {allProveedores.map(p=>(
          <button key={p} style={nb(filtProv===p)} onClick={()=>setFiltProv(p)}>{p}</button>
        ))}
      </div>
      <div style={card}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>📦 Registro de Compras</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Sem","Día","Mes","Fecha","Proveedor","Producto","Calibre","KG","$/kg","Total","Factura","F.Factura",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {listaComp.length===0&&<tr><td colSpan={13} style={{...td,textAlign:"center",color:C.muted,padding:28}}>Sin compras en este período 🛒</td></tr>}
              {listaComp.map(c=>(
                <tr key={c.id}>
                  <td style={td}>{c.semana}</td><td style={td}>{c.dia}</td><td style={td}>{c.mes}</td>
                  <td style={td}>{fmtDate(c.fecha)}</td>
                  <td style={{...td,fontWeight:700}}>{c.proveedor}</td>
                  <td style={td}>{pEmoji(c.producto)} {c.producto}</td>
                  <td style={td}><span style={badge(C.blue,C.blueL)}>{c.calibre}</span></td>
                  <td style={td}>{c.cantidad} kg</td>
                  <td style={td}>{fmt(c.precio)}</td>
                  <td style={td}><strong style={{color:C.teal}}>{fmt(c.total)}</strong></td>
                  <td style={td}>{c.factura||"—"}</td>
                  <td style={td}>{fmtDate(c.fechaFactura)||"—"}</td>
                  <td style={td}>
                    <div style={{display:"flex",gap:4}}>
                      <button style={{...btn(C.blue),padding:"4px 9px",fontSize:11}} onClick={()=>{ setEditId(c.id); setForm({...c,cantidad:String(c.cantidad),precio:String(c.precio)}); setShowComp(true); }}>✎</button>
                      <button style={{...btn(C.red),padding:"4px 9px",fontSize:11}} onClick={()=>setFruta(fs=>fs.filter(x=>x.id!==c.id))}>✕</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Compra */}
      {showComp&&(
        <div style={modal}>
          <div style={mbox}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.green}}>{editId?"✏️ Editar":"🛒 Nueva"} Compra de Fruta</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShowComp(false)}>×</button>
            </div>
            <div style={g3}>
              <div><label style={lbl}>Fecha</label><input type="date" style={inp} value={form.fecha} onChange={e=>sf("fecha",e.target.value)}/></div>
              <div><label style={lbl}>Proveedor *</label>
                <select style={sel} value={form.proveedor} onChange={e=>sf("proveedor",e.target.value)}>
                  <option value="">— Seleccionar proveedor —</option>
                  {allProveedores.map(p=><option key={p} value={p}>{p}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Producto *</label>
                <select style={sel} value={form.producto} onChange={e=>sf("producto",e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {productos.map(p=><option key={p.nombre}>{p.nombre}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Calibre</label>
                <select style={sel} value={form.calibre} onChange={e=>sf("calibre",e.target.value)} disabled={!form.producto}>
                  {getCals(form.producto).map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Cantidad KG *</label>
                <input type="number" inputMode="decimal" style={inp} placeholder="0" value={form.cantidad} onChange={e=>sf("cantidad",e.target.value)}/>
              </div>
              <div><label style={lbl}>Precio $/kg *</label>
                <input type="number" inputMode="decimal" style={inp} placeholder="0.00" value={form.precio} onChange={e=>sf("precio",e.target.value)}/>
              </div>
              <div><label style={lbl}>Método de pago</label>
                <select style={sel} value={form.metodoPago} onChange={e=>sf("metodoPago",e.target.value)}>
                  {METODOS_PAGO.map(m=><option key={m}>{m}</option>)}
                </select>
              </div>
              {form.metodoPago==="Efectivo" ? (
                <div style={{display:"flex",alignItems:"center",background:C.greenL,borderRadius:8,padding:"10px 12px",border:`1px solid ${C.greenM}`,fontSize:12,color:C.green,fontWeight:600}}>
                  ✅ Efectivo — se marca como pagado automáticamente
                </div>
              ) : (
                <div><label style={lbl}>Estatus del pago</label>
                  <select style={sel} value={form.estatusPago} onChange={e=>sf("estatusPago",e.target.value)}>
                    <option value="porpagar">⏳ Por pagar</option>
                    <option value="pagado">✅ Pagado</option>
                  </select>
                </div>
              )}
              <div><label style={lbl}>Factura #</label>
                <input style={inp} placeholder="Número de factura" value={form.factura} onChange={e=>sf("factura",e.target.value)}/>
              </div>
              <div><label style={lbl}>Fecha factura</label>
                <input type="date" style={inp} value={form.fechaFactura} onChange={e=>sf("fechaFactura",e.target.value)}/>
              </div>
            </div>
            <div style={totRow}>
              <span style={{fontWeight:600,color:C.muted}}>Total compra</span>
              <span style={{fontSize:20,fontWeight:800,color:C.teal}}>{fmt(parseFloat(form.cantidad||0)*parseFloat(form.precio||0))}</span>
            </div>
            <div style={{display:"flex",gap:8,marginTop:16,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setShowComp(false)}>Cancelar</button>
              <button style={btn(C.teal)} onClick={guardarCompra}>💾 Guardar Compra</button>
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

  const addCli  = () => { const v=nCli.trim(); if(v&&!clientes.includes(v)){setClientes(c=>[...c,v]);setNCli("");} };
  const addProv = () => { const v=nProv.trim(); if(v&&!proveedores.includes(v)){setProveedores(p=>[...p,v]);setNProv("");} };
  const addProd = () => {
    if(!nProd.nombre.trim()) return;
    const cals=nProd.calibres.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(!cals.length) return alert("Agrega al menos un calibre");
    setProductos(ps=>[...ps,{nombre:nProd.nombre.trim(),calibres:cals}]);
    setNProd({nombre:"",calibres:""});
  };
  const saveProd = () => {
    const cals=editP.calibresStr.split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    setProductos(ps=>ps.map(p=>p.nombre===editP.orig?{...p,calibres:cals}:p));
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
          {clientes.map(c=>(
            <div key={c} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:C.bg,borderRadius:9,padding:"9px 13px",marginBottom:6,border:`1px solid ${C.border}`}}>
              <span>👤 {c}</span>
              <button style={{background:"none",border:"none",color:C.red,cursor:"pointer",fontSize:20,fontWeight:700}} onClick={()=>setClientes(cs=>cs.filter(x=>x!==c))}>×</button>
            </div>
          ))}
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
            <input style={{...inp,flex:1}} placeholder="Calibres separados por coma" value={nProd.calibres} onChange={e=>setNProd(p=>({...p,calibres:e.target.value}))}/>
            <button style={btn()} onClick={addProd}>+ Agregar</button>
          </div>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10}}>
          {productos.map(p=>(
            <div key={p.nombre} style={{background:C.bg,borderRadius:9,padding:"10px 13px",border:`1px solid ${C.border}`}}>
              {editP?.orig===p.nombre ? (
                <div>
                  <div style={{fontWeight:700,marginBottom:6}}>{pEmoji(p.nombre)} {p.nombre}</div>
                  <div style={{display:"flex",gap:7}}>
                    <input style={{...inp,flex:1}} value={editP.calibresStr} onChange={e=>setEditP(ep=>({...ep,calibresStr:e.target.value}))}/>
                    <button style={btn()} onClick={saveProd}>✓</button>
                    <button style={btnO()} onClick={()=>setEditP(null)}>✕</button>
                  </div>
                </div>
              ) : (
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <div style={{fontWeight:700}}>{pEmoji(p.nombre)} {p.nombre}</div>
                    <div style={{color:C.muted,fontSize:12,marginTop:2}}>{p.calibres.join(", ")}</div>
                  </div>
                  <div style={{display:"flex",gap:5}}>
                    <button style={{...btn(C.blue),padding:"5px 10px",fontSize:11}} onClick={()=>setEditP({orig:p.nombre,calibresStr:p.calibres.join(", ")})}>✎</button>
                    <button style={{...btn(C.red),padding:"5px 10px",fontSize:11}} onClick={()=>setProductos(ps=>ps.filter(x=>x.nombre!==p.nombre))}>✕</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
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
        { g:"General",   items:[{ id:"dashboard", label:"Inicio", icon:"home" },{ id:"pedidos", label:"Pedidos", icon:"list" },{ id:"ventas", label:"Ventas", icon:"leaf" }] },
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

        <main className="saji-main saji-view" key={tab}>
          {tab==="dashboard"   && rol==="admin" && <Dashboard pedidos={pedidos} ventas={ventas} gastos={gastos} fruta={fruta.filter(f=>!f.tipo)}/>}
          {tab==="pedidos"     && <Pedidos pedidos={pedidos} setPedidos={setPedidos} setVentas={setVentas} setPagos={setPagos} pagos={pagos} clientes={clientes} productos={productos} logBit={logBit} rol={rol}/>}
          {tab==="ventas"      && rol==="admin" && <Ventas ventas={ventas} setVentas={setVentas} clientes={clientes} productos={productos} logBit={logBit}/>}
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
