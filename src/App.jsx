import { useState, useCallback, useEffect } from "react";
import { loadTable, saveTable, subscribeTable } from "./supabase.js";

// ─── iOS zoom fix ─────────────────────────────────────────────────────────────
if (typeof document !== "undefined") {
  let m = document.querySelector('meta[name="viewport"]');
  if (!m) { m = document.createElement("meta"); m.name = "viewport"; document.head.appendChild(m); }
  m.content = "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no";
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const genId     = () => Math.floor(100000 + Math.random() * 900000).toString();
const todayStr  = () => new Date().toISOString().split("T")[0];
const DIAS      = ["Domingo","Lunes","Martes","Miércoles","Jueves","Viernes","Sábado"];
const MESES     = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const dayOf     = d => DIAS[new Date(d+"T12:00:00").getDay()];
const monthOf   = d => MESES[new Date(d+"T12:00:00").getMonth()];
const weekOf    = d => { const dt=new Date(d+"T12:00:00"),s=new Date(dt.getFullYear(),0,1); return Math.ceil(((dt-s)/86400000+s.getDay()+1)/7); };
const fmt       = n => Number(n||0).toLocaleString("es-MX",{style:"currency",currency:"MXN"});
const fmtDate   = d => { if(!d) return ""; const [y,mo,dy]=d.split("-"); return `${dy}/${mo}/${y.slice(2)}`; };
const daysDiff  = d => { if(!d) return 0; const diff=new Date()-new Date(d+"T12:00:00"); return Math.max(0,Math.floor(diff/86400000)); };

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

// ─── Theme — LIGHT MODE ───────────────────────────────────────────────────────
const C = {
  bg:"#f5f7f5", card:"#ffffff", border:"#e2ece4",
  green:"#2d7a47", greenL:"#eaf5ee", greenM:"#b8dfc4",
  text:"#1a2b1e", muted:"#7a9a82",
  red:"#d63b3b", redL:"#fff0f0",
  amber:"#c47a0a", amberL:"#fffaeb",
  blue:"#2563eb", blueL:"#eff6ff",
  purple:"#7c3aed", purpleL:"#f5f3ff",
  teal:"#0891b2", tealL:"#ecfeff",
  shadow:"0 1px 4px rgba(0,0,0,.07)",
  shadowMd:"0 4px 20px rgba(0,0,0,.11)",
};

// ─── Style helpers ────────────────────────────────────────────────────────────
const card  = { background:C.card, border:`1px solid ${C.border}`, borderRadius:12, padding:16, marginBottom:14, boxShadow:C.shadow };
const h2s   = { margin:"0 0 16px", fontSize:18, fontWeight:800, color:C.text };
const g2    = { display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 };
const g3    = { display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 };
const lbl   = { display:"block", marginBottom:3, fontSize:11, color:C.muted, fontWeight:700, textTransform:"uppercase", letterSpacing:.5 };
const inp   = { width:"100%", background:"#f9fbf9", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"9px 11px", color:C.text, fontSize:16, boxSizing:"border-box", outline:"none", WebkitAppearance:"none" };
const sel   = { ...{width:"100%", background:"#f9fbf9", border:`1.5px solid ${C.border}`, borderRadius:8, padding:"9px 11px", color:C.text, fontSize:16, boxSizing:"border-box", outline:"none", WebkitAppearance:"none", cursor:"pointer"} };
const btn   = (bg=C.green) => ({ background:bg, color:"#fff", border:"none", borderRadius:8, padding:"9px 16px", cursor:"pointer", fontWeight:700, fontSize:13, whiteSpace:"nowrap" });
const btnO  = (c) => ({ background:"transparent", color:c||C.muted, border:`1.5px solid ${c||C.border}`, borderRadius:8, padding:"9px 16px", cursor:"pointer", fontWeight:600, fontSize:13 });
const modal = { position:"fixed", inset:0, background:"rgba(0,0,0,.4)", zIndex:200, display:"flex", alignItems:"flex-start", justifyContent:"center", padding:12, overflowY:"auto" };
const mbox  = { background:C.card, border:`1px solid ${C.border}`, borderRadius:16, padding:22, width:"100%", maxWidth:700, marginTop:16, marginBottom:16, boxShadow:C.shadowMd };
const th    = { textAlign:"left", padding:"9px 10px", color:C.muted, fontWeight:700, fontSize:11, textTransform:"uppercase", letterSpacing:.4, borderBottom:`2px solid ${C.border}`, background:C.bg, whiteSpace:"nowrap" };
const td    = { padding:"8px 10px", borderBottom:`1px solid ${C.border}`, verticalAlign:"middle", fontSize:13 };
const badge = (c, bg) => ({ background:bg||c+"18", color:c, borderRadius:20, padding:"3px 10px", fontSize:11, fontWeight:700, display:"inline-block", whiteSpace:"nowrap" });
const totRow= { background:C.greenL, borderRadius:10, padding:"11px 14px", display:"flex", justifyContent:"space-between", alignItems:"center", marginTop:12, border:`1px solid ${C.greenM}` };
const nb    = a => ({ background:a?C.green:"transparent", color:a?"#fff":C.muted, border:a?"none":`1px solid ${C.border}`, borderRadius:8, padding:"7px 12px", cursor:"pointer", fontWeight:a?700:500, fontSize:12, transition:"all .15s", whiteSpace:"nowrap" });

// ─── Logo ─────────────────────────────────────────────────────────────────────
const SAJI_LOGO_B64 = "data:image/jpeg;base64,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";
const SAJILogo = ({ s=36 }) => (
  <img src={SAJI_LOGO_B64} width={s} height={s} alt="SAJI Group"
    style={{objectFit:"contain",borderRadius:"50%"}}/>
);

const pEmoji = n => ({"Aguacate":"🥑","Cebolla":"🧅","Mango":"🥭","Limón":"🍋","Tomate":"🍅","Chile":"🌶️"}[n]||"📦");

// ─── Gastos catálogo ──────────────────────────────────────────────────────────
const TIPOS_GASTO = {
  "Alquiler Inmuebles": ["Renta Casa","Cámara frío"],
  "Otros Gastos": ["Comida","Super Jasso","Super Irving","Super SAJI","Servicio Caddy","Servicio Duty","Servicio Auto Irving","Servicio Auto Jasso","Propina","Mantenimiento Cámara","Ferretería","Refaccionaria","Caja","Otras compras"],
  "Energías": ["Luz Casa","Luz Trifásica"],
  "Gastos de Viaje": ["Tag","Caseta","Gasolina Caddy","Gasolina Duty","Gasolina Jasso","Gasolina Irving"],
  "Gastos de Personal": ["Nómina Daniel","Nómina Héctor","Nómina José","Nómina Irving","Nómina Jasso"],
  "Servicios Contratados": ["Internet","Agua","GPS Caddy","GPS Duty"],
  "Créditos": ["Santander"],
  "Crédito Automotriz": ["Caddy","Super Dutty"],
  "Facturas": ["Cobro por factura"],
  "Impuestos": ["ISR","IVA"],
};
const METODOS_PAGO = ["Efectivo","Tarjeta BBVA","Tarjeta Costco","Tarjeta Plata","Tarjeta SAJI"];

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
      const sem = r.semana ? parseInt(r.semana) : (r[dateKey] ? weekOf(r[dateKey]) : null);
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
// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════════
function Dashboard({ pedidos, ventas, gastos, fruta, pagos }) {
  const [dashFilt, setDashFilt] = useState({tipo:"todo",valor:"",desde:"",hasta:""});

  // Filter all data by selected period
  const vF   = applyFilter(ventas, dashFilt);
  const gF   = applyFilter(gastos, dashFilt);
  const frF  = applyFilter(fruta,  dashFilt);
  const pagF = applyFilter(pagos,  dashFilt);
  const pedF = applyFilter(pedidos.filter(p=>p.estatus==="pendiente"), dashFilt);

  const totalVentas = vF.reduce((s,v)=>s+v.total,0);
  const totalGastos = gF.reduce((s,g)=>s+g.monto,0);
  const totalFruta  = frF.reduce((s,f)=>s+f.total,0);
  const utilidad    = totalVentas - totalGastos - totalFruta;

  // "Por cobrar" = ventas del período MENOS pagos de esos pedidos (de cualquier fecha)
  const pedidosEnPeriodo = new Set(vF.map(v=>v.pedidoId));
  const totalAbonado = pagos
    .filter(p=>pedidosEnPeriodo.has(p.pedidoId))
    .reduce((s,p)=>s+p.monto, 0);
  const porCobrar = Math.max(0, totalVentas - totalAbonado);

  // Caja efectivo — entradas = abonos en efectivo del período
  const entradasEfectivo = pagF.filter(p=>p.tipoPago==="efectivo"||p.tipoPago==="Efectivo").reduce((s,p)=>s+p.monto,0);
  const salidasEfectivo  = gF.filter(g=>g.metodoPago==="Efectivo" && g.estatusPago==="pagado").reduce((s,g)=>s+g.monto,0) +
                           frF.filter(f=>f.metodoPago==="Efectivo" && f.estatusPago==="pagado").reduce((s,f)=>s+f.total,0);
  const saldoCaja = entradasEfectivo - salidasEfectivo;

  // Saldo por cliente — SIEMPRE acumulado total, nunca filtrado por período
  const clientesUnicos = [...new Set(ventas.map(v=>v.cliente))];
  const saldoCliente = cli => {
    const totalVendido   = ventas.filter(v=>v.cliente===cli).reduce((s,v)=>s+v.total, 0);
    // Usar un Set de pedidoIds del cliente para búsqueda eficiente
    const pedidosCli     = new Set(ventas.filter(v=>v.cliente===cli).map(v=>v.pedidoId));
    const totalCobrado   = pagos.filter(p=>pedidosCli.has(p.pedidoId)).reduce((s,p)=>s+p.monto, 0);
    return { totalVendido, totalCobrado, pendiente: Math.max(0, totalVendido - totalCobrado) };
  };

  // Label for current filter
  const periodoLabel = () => {
    if(dashFilt.tipo==="todo") return "Todo el tiempo";
    if(dashFilt.tipo==="hoy") return "Hoy";
    if(dashFilt.tipo==="fecha") return dashFilt.valor ? fmtDate(dashFilt.valor) : "Fecha específica";
    if(dashFilt.tipo==="semana") return `Semana ${dashFilt.valor||weekOf(todayStr())}`;
    if(dashFilt.tipo==="mes") return dashFilt.valor ? MESES[parseInt(dashFilt.valor)-1] : MESES[new Date().getMonth()];
    if(dashFilt.tipo==="rango") { const d=dashFilt.desde?fmtDate(dashFilt.desde):"..."; const h=dashFilt.hasta?fmtDate(dashFilt.hasta):"..."; return `${d} — ${h}`; }
    return "";
  };

  const totalKgVendidos = vF.reduce((s,v)=>s+(parseFloat(v.cantidad)||0), 0);

  const cards = [
    { label:"Ventas totales",    v:fmt(totalVentas),  icon:"📈", c:C.green },
    { label:"Por cobrar",        v:fmt(porCobrar),    icon:"⏳", c:C.amber },
    { label:"Gastos operativos", v:fmt(totalGastos),  icon:"💸", c:C.red   },
    { label:"Compra de fruta",   v:fmt(totalFruta),   icon:"🥑", c:C.teal  },
    { label:"Utilidad bruta",    v:fmt(utilidad),     icon:"💡", c:utilidad>=0?C.green:C.red },
    { label:"KG vendidos",       v:totalKgVendidos.toLocaleString("es-MX")+" kg", icon:"⚖️", c:C.blue },
  ];

  return (
    <div>
      {/* Header */}
      <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12,background:C.card,borderRadius:12,padding:"12px 16px",boxShadow:C.shadow,border:`1px solid ${C.border}`}}>
        <SAJILogo s={44}/>
        <div>
          <div style={{fontSize:18,fontWeight:800,color:C.green}}>SAJI Group</div>
          <div style={{color:C.muted,fontSize:11}}>Sistema de Gestión Comercial 🥑🧅</div>
        </div>
      </div>

      {/* Period filter for KPIs */}
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:12,boxShadow:C.shadow}}>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",alignItems:"center"}}>
          <span style={{color:C.muted,fontSize:12,fontWeight:700}}>📊 Indicadores —</span>
          {[{k:"todo",l:"Todo"},{k:"hoy",l:"Hoy"},{k:"semana",l:"Semana"},{k:"mes",l:"Mes"},{k:"fecha",l:"📆 Fecha"},{k:"rango",l:"📅 Rango"}].map(f=>(
            <button key={f.k} style={nb(dashFilt.tipo===f.k)} onClick={()=>setDashFilt({tipo:f.k,valor:"",desde:"",hasta:""})}>{f.l}</button>
          ))}
          <span style={{marginLeft:"auto",color:C.green,fontWeight:700,fontSize:12}}>{periodoLabel()}</span>
        </div>
        {dashFilt.tipo==="semana"&&(
          <div style={{marginTop:8}}>
            <input type="number" style={{...inp,width:220,padding:"7px 10px",fontSize:14}}
              placeholder={`Semana # (actual: ${weekOf(todayStr())})`} min="1" max="53"
              value={dashFilt.valor} onChange={e=>setDashFilt(f=>({...f,valor:e.target.value}))}/>
          </div>
        )}
        {dashFilt.tipo==="mes"&&(
          <div style={{marginTop:8}}>
            <select style={{...sel,width:200,padding:"7px 10px",fontSize:14}} value={dashFilt.valor} onChange={e=>setDashFilt(f=>({...f,valor:e.target.value}))}>
              <option value="">— Seleccionar mes —</option>
              {MESES.map((m,i)=><option key={m} value={String(i+1)}>{m}</option>)}
            </select>
          </div>
        )}
        {dashFilt.tipo==="fecha"&&(
          <div style={{marginTop:8}}>
            <input type="date" style={{...inp,width:200,padding:"7px 10px",fontSize:14}}
              value={dashFilt.valor} onChange={e=>setDashFilt(f=>({...f,valor:e.target.value}))}/>
          </div>
        )}
        {dashFilt.tipo==="rango"&&(
          <div style={{marginTop:8,display:"flex",gap:10,alignItems:"center",flexWrap:"wrap"}}>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{...lbl,margin:0}}>Desde</span>
              <input type="date" style={{...inp,width:160,padding:"7px 10px",fontSize:14}}
                value={dashFilt.desde||""} onChange={e=>setDashFilt(f=>({...f,desde:e.target.value}))}/>
            </div>
            <div style={{display:"flex",alignItems:"center",gap:6}}>
              <span style={{...lbl,margin:0}}>Hasta</span>
              <input type="date" style={{...inp,width:160,padding:"7px 10px",fontSize:14}}
                value={dashFilt.hasta||""} onChange={e=>setDashFilt(f=>({...f,hasta:e.target.value}))}/>
            </div>
          </div>
        )}
      </div>

      {/* ── Estado de Resultados ─────────────────────────────────────── */}
      {(()=>{
        const gastosOp  = gF.filter(g=>g.gasto!=="ISR"&&g.gasto!=="IVA").reduce((s,g)=>s+(parseFloat(g.monto)||0),0);
        const totalISR  = gF.filter(g=>g.gasto==="ISR").reduce((s,g)=>s+(parseFloat(g.monto)||0),0);
        const totalIVA  = gF.filter(g=>g.gasto==="IVA").reduce((s,g)=>s+(parseFloat(g.monto)||0),0);
        const totalImp  = totalISR + totalIVA;
        const uBruta    = totalVentas - totalFruta;
        const uOperat   = uBruta - gastosOp;
        const uNeta     = uOperat - totalImp;
        const pct = (n) => totalVentas===0?"0%":`${((n/totalVentas)*100).toFixed(1)}%`;
        const kpis = [
          { label:"Ventas $",           v:fmt(totalVentas),   c:C.green,  icon:"📈" },
          { label:"Ventas KG",          v:totalKgVendidos.toLocaleString("es-MX")+" kg", c:C.blue, icon:"⚖️" },
          { label:"Gastos",             v:fmt(gastosOp),      c:C.red,    icon:"💸" },
          { label:"Impuestos (ISR+IVA)",v:fmt(totalImp),      c:C.purple, icon:"🏛️" },
          { label:"Utilidad neta",      v:fmt(uNeta),         c:uNeta>=0?C.green:C.red, icon:uNeta>=0?"🏆":"⚠️", destacado:true },
        ];
        const filas = [
          { concepto:"Ventas totales",              monto:totalVentas, c:C.green,                bold:true,  icon:"📈", sep:false },
          { concepto:"(-) Costo de ventas (fruta)", monto:totalFruta,  c:C.muted,                bold:false, icon:"🥑", sep:false },
          { concepto:"= Utilidad bruta",            monto:uBruta,      c:uBruta>=0?C.amber:C.red, bold:true, icon:"💡", sep:true  },
          { concepto:"(-) Gastos operativos",       monto:gastosOp,    c:C.muted,                bold:false, icon:"💸", sep:false },
          { concepto:"= Utilidad operativa",        monto:uOperat,     c:uOperat>=0?C.teal:C.red, bold:true, icon:"⚖️", sep:true  },
          { concepto:"(-) ISR",                     monto:totalISR,    c:C.muted,                bold:false, icon:"🏛️", sep:false },
          { concepto:"(-) IVA",                     monto:totalIVA,    c:C.muted,                bold:false, icon:"🏛️", sep:false },
        ];
        return (
          <div style={{...card,padding:"16px 18px",marginBottom:12}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:14}}>
              <div style={{fontWeight:800,fontSize:13,color:C.text}}>📊 Estado de Resultados</div>
              <span style={{background:C.greenL,color:C.green,fontWeight:700,fontSize:11,padding:"3px 12px",borderRadius:20,border:`1px solid ${C.greenM}`}}>{periodoLabel()}</span>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"repeat(2,1fr)",gap:8,marginBottom:14}} className="kpi-grid">
              {kpis.map(k=>(
                <div key={k.label} style={{background:C.bg,border:`1px solid ${C.border}`,borderTop:`3px solid ${k.c}`,borderRadius:10,padding:"11px 12px",boxShadow:C.shadow,outline:k.destacado?`1.5px solid ${k.c}44`:"none"}}>
                  <div style={{fontSize:18,marginBottom:3}}>{k.icon}</div>
                  <div style={{fontSize:14,fontWeight:800,color:k.c,lineHeight:1.2,fontFamily:"monospace"}}>{k.v}</div>
                  <div style={{color:C.muted,fontSize:10,marginTop:3}}>{k.label}</div>
                </div>
              ))}
            </div>
            <div style={{borderRadius:9,border:`1px solid ${C.border}`,overflow:"hidden"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:12}}>
                <thead>
                  <tr style={{background:C.bg}}>
                    {["Concepto","Monto","% Ventas"].map((h,i)=>(
                      <th key={h} style={{padding:"8px 12px",color:C.muted,fontWeight:700,fontSize:10,textTransform:"uppercase",letterSpacing:.4,borderBottom:`2px solid ${C.border}`,textAlign:i===0?"left":"right"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filas.map((f,i)=>(
                    <>
                      {f.sep&&<tr key={`sep-${i}`}><td colSpan={3} style={{padding:0,height:1,background:C.border}}/></tr>}
                      <tr key={i} style={{background:f.bold?"rgba(0,0,0,0.02)":"transparent"}}>
                        <td style={{padding:"9px 12px",fontWeight:f.bold?700:400,color:C.text,borderBottom:`1px solid ${C.border}`}}>
                          <span style={{marginRight:5}}>{f.icon}</span>{f.concepto}
                        </td>
                        <td style={{padding:"9px 12px",textAlign:"right",fontWeight:f.bold?800:500,color:f.c,fontFamily:"monospace",fontSize:13,borderBottom:`1px solid ${C.border}`}}>
                          {fmt(f.monto)}
                        </td>
                        <td style={{padding:"9px 12px",textAlign:"right",color:C.muted,fontSize:11,borderBottom:`1px solid ${C.border}`}}>
                          {pct(f.monto)}
                        </td>
                      </tr>
                    </>
                  ))}
                  <tr><td colSpan={3} style={{padding:0,height:2,background:C.border}}/></tr>
                  <tr style={{background:uNeta>=0?C.greenL:C.redL}}>
                    <td style={{padding:"11px 12px",fontWeight:800,fontSize:13,color:C.text}}>
                      <span style={{marginRight:5}}>{uNeta>=0?"🏆":"⚠️"}</span>= Utilidad neta
                    </td>
                    <td style={{padding:"11px 12px",textAlign:"right",fontWeight:800,color:uNeta>=0?C.green:C.red,fontFamily:"monospace",fontSize:15}}>
                      {fmt(uNeta)}
                    </td>
                    <td style={{padding:"11px 12px",textAlign:"right",color:C.muted,fontSize:11}}>
                      {pct(uNeta)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* Caja */}
      <div style={{...card,borderLeft:`4px solid ${C.green}`,padding:"12px 14px"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:800,fontSize:13}}>💵 Control de Caja (Efectivo)</div>
          <span style={{fontSize:11,color:C.green,fontWeight:600}}>{periodoLabel()}</span>
        </div>
        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8}}>
          {[
            {label:"Entradas",v:fmt(entradasEfectivo),c:C.green},
            {label:"Salidas",v:fmt(salidasEfectivo),c:C.red},
            {label:"Saldo caja",v:fmt(saldoCaja),c:saldoCaja>=0?C.green:C.red},
          ].map(x=>(
            <div key={x.label} style={{background:C.bg,borderRadius:8,padding:"10px 11px",border:`1px solid ${C.border}`}}>
              <div style={{color:C.muted,fontSize:10,marginBottom:3}}>{x.label}</div>
              <div style={{fontSize:15,fontWeight:800,color:x.c}}>{x.v}</div>
            </div>
          ))}
        </div>
        <div style={{color:C.muted,fontSize:10,marginTop:7}}>* Entradas: ventas cobradas en efectivo · Salidas: gastos + fruta en efectivo</div>
      </div>

      {/* Saldo por cliente — solo los que deben */}
      <div style={card}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
          <div style={{fontWeight:800,fontSize:13}}>🔴 ¿Quién me debe?</div>
          <span style={{fontSize:10,color:C.muted}}>Acumulado total · solo pendientes</span>
        </div>
        {clientesUnicos.length===0
          ? <p style={{color:C.muted,fontSize:13,textAlign:"center",padding:16}}>Sin ventas registradas aún</p>
          : (()=>{
              const conDeuda = clientesUnicos
                .map(cli=>({ cli, ...saldoCliente(cli) }))
                .filter(x=>x.pendiente>0)
                .sort((a,b)=>b.pendiente-a.pendiente);
              const totalPend = conDeuda.reduce((s,x)=>s+x.pendiente,0);
              return conDeuda.length===0
                ? <p style={{color:C.green,fontSize:13,textAlign:"center",padding:16,fontWeight:700}}>🎉 Todos los clientes están al corriente</p>
                : (
                  <div>
                    {conDeuda.map(({cli,totalVendido,totalCobrado,pendiente})=>(
                      <div key={cli} style={{background:"#fff8f8",borderRadius:9,padding:"10px 13px",marginBottom:6,border:`1px solid ${C.red}22`}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
                          <span style={{fontWeight:700,fontSize:13}}>{cli}</span>
                          <span style={{color:C.red,fontWeight:800,fontSize:16}}>{fmt(pendiente)}</span>
                        </div>
                        <div style={{display:"flex",gap:16,fontSize:11,color:C.muted}}>
                          <span>Vendido: <strong style={{color:C.text}}>{fmt(totalVendido)}</strong></span>
                          <span>Cobrado: <strong style={{color:C.green}}>{fmt(totalCobrado)}</strong></span>
                        </div>
                        {/* Barra de progreso */}
                        <div style={{marginTop:7,height:5,background:C.border,borderRadius:3,overflow:"hidden"}}>
                          <div style={{width:`${totalVendido>0?Math.min(100,Math.round(totalCobrado/totalVendido*100)):0}%`,height:"100%",background:C.green,borderRadius:3}}/>
                        </div>
                        <div style={{fontSize:10,color:C.muted,marginTop:3,textAlign:"right"}}>
                          {totalVendido>0?Math.round(totalCobrado/totalVendido*100):0}% cobrado
                        </div>
                      </div>
                    ))}
                    <div style={{...totRow,background:C.redL,border:`1px solid ${C.red}33`,marginTop:4}}>
                      <span style={{fontWeight:800,fontSize:13,color:C.red}}>TOTAL POR COBRAR</span>
                      <span style={{fontWeight:800,fontSize:18,color:C.red}}>{fmt(totalPend)}</span>
                    </div>
                  </div>
                );
            })()
        }
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// PEDIDOS
// ════════════════════════════════════════════════════════════════════════════════
const emptyItem = () => ({ producto:"", calibre:"", cantidad:"", precio:"" });

function Pedidos({ pedidos, setPedidos, setVentas, clientes, productos, logBit }) {
  const [show,         setShow]        = useState(false);
  const [filter,       setFilter]      = useState("pendiente");
  const [form,         setForm]        = useState({ cliente:"", fechaEntrega:"", tipoPago:"efectivo", factura:"no", items:[emptyItem()] });
  const [completando,  setCompletando] = useState(null); // pedido en proceso de completar
  const [kgsReales,    setKgsReales]   = useState([]);   // cantidades reales por item

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
    const np={id:genId(),fecha:todayStr(),...form,total:totalForm,estatus:"pendiente"};
    setPedidos(ps=>[np,...ps]);
    logBit("Nuevo pedido",`#${np.id} · ${form.cliente} · ${fmt(totalForm)}`);
    setForm({ cliente:"", fechaEntrega:"", tipoPago:"efectivo", factura:"no", items:[emptyItem()] });
    setShow(false);
  };
  const cancelar  = id => { if(!window.confirm("¿Cancelar este pedido?")) return; setPedidos(ps=>ps.map(p=>p.id===id?{...p,estatus:"cancelado"}:p)); logBit("Canceló pedido",`#${id}`); };
  const abrirCompletar = id => {
    const p=pedidos.find(x=>x.id===id); if(!p) return;
    setKgsReales((p.items||[]).map(it=>String(it.cantidad)));
    setCompletando(p);
  };
  const confirmarCompletar = () => {
    const p=completando; if(!p) return;
    const items = (p.items||[]).map((it,i)=>({...it, cantidad: parseFloat(kgsReales[i]||it.cantidad)||parseFloat(it.cantidad) }));
    const totalReal = items.reduce((s,it)=>s+(it.cantidad*parseFloat(it.precio)),0);
    setVentas(vs=>[...items.map((it,i)=>({
      pedidoId:p.id,
      itemId:`${p.id}-${it.producto}-${Math.random().toString(36).slice(2,5)}`,
      semana:weekOf(todayStr()), dia:dayOf(todayStr()), mes:monthOf(todayStr()), fecha:todayStr(),
      cliente:p.cliente, producto:it.producto, calibre:it.calibre,
      cantidad:it.cantidad, precio:parseFloat(it.precio),
      total:it.cantidad*parseFloat(it.precio),
      estatusPago:"pendiente", tipoPago:p.tipoPago, fechaPago:"",
      factura:"", facturaEmisor:"", remision:"", fechaFactura:"",
      estatusFactura: p.factura==="si" ? "pendiente_factura" : "no_aplica",
    })),...vs]);
    setPedidos(ps=>ps.map(x=>x.id===p.id?{...x,estatus:"completado",totalReal}:x));
    logBit("Completó pedido",`#${p.id} · ${p.cliente} · ${fmt(totalReal)}`);
    setCompletando(null);
  };

  const [pedFilt, setPedFilt] = useState({tipo:"todo",valor:""});

  let lista = (filter==="todos" ? pedidos : pedidos.filter(p=>p.estatus===filter)).slice().sort((a,b)=>(b.fecha||b.fechaEntrega||'').localeCompare(a.fecha||a.fechaEntrega||''));
  // Apply period filter on fechaEntrega
  if(pedFilt.tipo==="hoy") lista = lista.filter(p=>p.fechaEntrega===todayStr());
  else if(pedFilt.tipo==="fecha") lista = pedFilt.valor ? lista.filter(p=>p.fechaEntrega===pedFilt.valor) : lista;
  else if(pedFilt.tipo==="semana") {
    const w = pedFilt.valor ? parseInt(pedFilt.valor) : weekOf(todayStr());
    lista = lista.filter(p=>p.fechaEntrega&&weekOf(p.fechaEntrega)===w);
  } else if(pedFilt.tipo==="mes") {
    const mo = pedFilt.valor ? parseInt(pedFilt.valor) : (new Date().getMonth()+1);
    lista = lista.filter(p=>p.fechaEntrega&&new Date(p.fechaEntrega+"T12:00:00").getMonth()+1===mo);
  }

  const sColor = s => s==="pendiente"?C.amber:s==="completado"?C.green:C.red;
  const sLabel = s => s==="pendiente"?"⏳ Pendiente":s==="completado"?"✅ Completado":"❌ Cancelado";

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <h2 style={{...h2s,margin:0}}>📦 Pedidos</h2>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {["todos","pendiente","completado","cancelado"].map(f=>(
            <button key={f} style={nb(filter===f)} onClick={()=>setFilter(f)}>{f.charAt(0).toUpperCase()+f.slice(1)}</button>
          ))}
          <button style={btn()} onClick={()=>setShow(true)}>+ Nuevo Pedido</button>
        </div>
      </div>

      <FilterBar filter={pedFilt} setFilter={setPedFilt} count={lista.length}/>

      <div style={card}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed",minWidth:680}}>
            <colgroup>
              <col style={{width:72}}/>{/* F.Entrega */}
              <col style={{width:85}}/>{/* Cliente */}
              <col style={{width:88}}/>{/* Producto */}
              <col style={{width:52}}/>{/* KG */}
              <col style={{width:60}}/>{/* Calibre */}
              <col style={{width:62}}/>{/* $/kg */}
              <col style={{width:68}}/>{/* Subtotal */}
              <col style={{width:58}}/>{/* #Ped */}
              <col style={{width:68}}/>{/* Pago */}
              <col style={{width:40}}/>{/* Fact */}
              <col style={{width:80}}/>{/* Estatus */}
              <col style={{width:90}}/>{/* Acciones */}
            </colgroup>
            <thead>
              <tr>{["F.Entrega","Cliente","Producto","KG","Calibre","$/kg","Subtotal","#Ped","Pago","Fact.","Estatus",""].map(h=>(
                <th key={h} style={{...th,padding:"7px 6px",fontSize:10}}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {lista.length===0&&<tr><td colSpan={12} style={{...td,textAlign:"center",color:C.muted,padding:28}}>Sin pedidos</td></tr>}
              {lista.map(p=>{
                const items=p.items||[];
                return items.map((it,idx)=>(
                  <tr key={`${p.id}-${idx}`} style={{background:idx%2===0?"#fff":"#f9fcfa"}}>
                    {idx===0&&<td style={{...td,fontWeight:600,fontSize:12,padding:"7px 6px"}} rowSpan={items.length}>{fmtDate(p.fechaEntrega)}</td>}
                    {idx===0&&<td style={{...td,fontWeight:700,fontSize:12,padding:"7px 6px",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}} rowSpan={items.length}>{p.cliente}</td>}
                    <td style={{...td,fontWeight:600,fontSize:12,padding:"7px 6px"}}>{pEmoji(it.producto)} {it.producto}</td>
                    <td style={{...td,fontWeight:700,fontSize:12,padding:"7px 6px"}}>{it.cantidad}kg</td>
                    <td style={{...td,padding:"7px 6px"}}><span style={{...badge(C.blue,C.blueL),padding:"2px 6px",fontSize:10}}>{it.calibre}</span></td>
                    <td style={{...td,fontSize:12,padding:"7px 6px"}}>{fmt(it.precio)}</td>
                    <td style={{...td,padding:"7px 6px"}}><strong style={{color:C.green,fontSize:12}}>{fmt(parseFloat(it.cantidad||0)*parseFloat(it.precio||0))}</strong></td>
                    {idx===0&&<td style={{...td,color:C.muted,fontSize:10,padding:"7px 6px"}} rowSpan={items.length}>#{p.id}</td>}
                    {idx===0&&<td style={{...td,fontSize:11,padding:"7px 6px"}} rowSpan={items.length}>{p.tipoPago}</td>}
                    {idx===0&&<td style={{...td,padding:"7px 6px"}} rowSpan={items.length}><span style={{...badge(p.factura==="si"?C.green:C.muted),padding:"2px 6px",fontSize:10}}>{p.factura==="si"?"✅":"—"}</span></td>}
                    {idx===0&&<td style={{...td,padding:"7px 6px"}} rowSpan={items.length}><span style={{...badge(sColor(p.estatus)),padding:"2px 6px",fontSize:10}}>{sLabel(p.estatus)}</span></td>}
                    {idx===0&&(
                      <td style={{...td,padding:"7px 6px"}} rowSpan={items.length}>
                        {p.estatus==="pendiente"&&(
                          <div style={{display:"flex",flexDirection:"column",gap:3}}>
                            <button style={{...btn(C.green),padding:"4px 8px",fontSize:10}} onClick={()=>abrirCompletar(p.id)}>✓ Completar</button>
                            <button style={{...btn(C.red),padding:"4px 8px",fontSize:10}} onClick={()=>cancelar(p.id)}>✕ Cancelar</button>
                          </div>
                        )}
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
            <div style={g3}>
              <div><label style={lbl}>Cliente *</label>
                <select style={sel} value={form.cliente} onChange={e=>sf("cliente",e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {clientes.map(c=><option key={c}>{c}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Fecha de entrega *</label>
                <input type="date" style={inp} value={form.fechaEntrega} onChange={e=>sf("fechaEntrega",e.target.value)}/>
              </div>
              <div><label style={lbl}>Tipo de pago</label>
                <select style={sel} value={form.tipoPago} onChange={e=>sf("tipoPago",e.target.value)}>
                  {["Efectivo","Transferencia Frasavo","Transferencia SAJI"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div><label style={lbl}>Requiere factura</label>
                <select style={sel} value={form.factura} onChange={e=>sf("factura",e.target.value)}>
                  <option value="no">No</option><option value="si">Sí</option>
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
// VENTAS
// ════════════════════════════════════════════════════════════════════════════════
function Ventas({ ventas, setVentas, logBit }) {
  const [editing,    setEditing]    = useState(null);
  const [form,       setForm]       = useState({});
  const [filt,       setFilt]       = useState({tipo:"todo",valor:""});
  const [filtCliente,setFiltCliente]= useState("");
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));
  const save = () => { setVentas(vs=>vs.map(v=>v.itemId===editing?{...form}:v)); setEditing(null); };

  const diasPendiente = v => {
    if(!v.fechaFactura||v.estatusPago==="pagado") return "—";
    return daysDiff(v.fechaFactura)+" días";
  };

  const estatusFactura = v => {
    if(v.estatusFactura==="cancelada") return { label:"❌ Cancelada", color:C.red };
    if(v.factura && v.factura.trim() && v.factura.toLowerCase()!=="no aplica")
      return { label:"✅ Factura realizada", color:C.green };
    if(v.estatusFactura==="pendiente_factura" || (!v.factura && v.estatusFactura!=="no_aplica"))
      return { label:"⏳ Pend. facturar", color:C.amber };
    return { label:"— No aplica", color:C.muted };
  };
  const estatusFacturaLabel = v => {
    if(v.estatus==="cancelada") return { label:"❌ Cancelada", color:C.red };
    if(v.estatusFactura==="no_aplica"||v.factura==="No aplica") return { label:"No aplica", color:C.muted };
    if(v.factura && v.factura!=="No aplica" && v.factura.trim()!=="") return { label:"✅ Factura realizada", color:C.green };
    return { label:"⏳ Pend. facturar", color:C.amber };
  };

  const cols = [
    {l:"#Pedido",k:"pedidoId"},{l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},
    {l:"Cliente",k:"cliente"},{l:"Calibre",k:"calibre"},{l:"Cantidad KG",k:"cantidad"},
    {l:"Precio",k:"precio"},{l:"Total",k:"total"},{l:"Estatus Pago",k:"estatusPago"},
    {l:"Tipo Pago",k:"tipoPago"},{l:"Fecha Pago",k:"fechaPago"},{l:"Factura",k:"factura"},
    {l:"Factura Emisor",k:"facturaEmisor"},{l:"Remision",k:"remision"},{l:"Fecha Factura",k:"fechaFactura"},
  ];

  const listaFecha = applyFilter(ventas, filt);
  const clientes_unicos = [...new Set(ventas.map(v=>v.cliente))].filter(Boolean).sort();
  const lista = (filtCliente ? listaFecha.filter(v=>v.cliente===filtCliente) : listaFecha).slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  const totalLista = lista.reduce((s,v)=>s+v.total,0);
  const totalKg    = lista.reduce((s,v)=>s+(parseFloat(v.cantidad)||0),0);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12,flexWrap:"wrap",gap:8}}>
        <div>
          <h2 style={{...h2s,margin:0}}>💰 Ventas</h2>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>
            {lista.length} registros · 
            <strong style={{color:C.green}}> {fmt(totalLista)}</strong> · 
            <strong style={{color:C.blue}}> {totalKg.toLocaleString("es-MX")} kg</strong>
          </div>
        </div>
        <button style={btn(C.blue)} onClick={()=>exportCSV(lista,cols,`ventas-${todayStr()}.csv`)}>⬇ Exportar CSV/Excel</button>
      </div>
      <FilterBar filter={filt} setFilter={setFilt} count={lista.length}/>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:10,padding:"10px 14px",marginBottom:12,boxShadow:C.shadow,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
        <span style={{color:C.muted,fontSize:12,fontWeight:700}}>👤 Cliente:</span>
        <button style={nb(!filtCliente)} onClick={()=>setFiltCliente("")}>Todos</button>
        {clientes_unicos.map(c=>(
          <button key={c} style={nb(filtCliente===c)} onClick={()=>setFiltCliente(c)}>{c}</button>
        ))}
      </div>
      <div style={card}>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["#Ped","Sem","Día","Mes","Fecha","Cliente","Calibre","KG","$/kg","Total","Estatus Pago","Estatus Factura","Tipo Pago","F.Pago","Factura","Emisor","Remisión","F.Factura","Días Pend.",""].map(h=>(
              <th key={h} style={th}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {lista.length===0&&<tr><td colSpan={20} style={{...td,textAlign:"center",color:C.muted,padding:28}}>Sin ventas en este período 📋</td></tr>}
              {lista.map(v=>(
                <tr key={v.itemId} style={{opacity:v.estatus==="cancelada"?0.5:1,background:v.estatus==="cancelada"?"#fff5f5":"transparent"}}>
                  <td style={td}><span style={{fontWeight:700,color:C.green,fontSize:11}}>#{v.pedidoId}</span></td>
                  <td style={td}>{v.semana}</td>
                  <td style={td}>{v.dia}</td>
                  <td style={td}>{v.mes}</td>
                  <td style={td}>{fmtDate(v.fecha)}</td>
                  <td style={{...td,fontWeight:600}}>{v.cliente}</td>
                  <td style={td}><span style={badge(C.blue,C.blueL)}>{v.calibre}</span></td>
                  <td style={td}>{v.cantidad} kg</td>
                  <td style={td}>{fmt(v.precio)}</td>
                  <td style={td}><strong style={{color:C.green}}>{fmt(v.total)}</strong></td>
                  <td style={td}><span style={badge(v.estatusPago==="pagado"?C.green:C.amber)}>{v.estatusPago==="pagado"?"✅ Pagado":"⏳ Pendiente"}</span></td>
                  <td style={td}>{(()=>{const ef=estatusFacturaLabel(v);return <span style={badge(ef.color)}>{ef.label}</span>;})()}</td>
                  <td style={{...td,opacity:v.estatus==="cancelada"?0.4:1}}>{v.tipoPago}</td>
                  <td style={td}>{fmtDate(v.fechaPago)||"—"}</td>
                  <td style={td}>{v.factura||"—"}</td>
                  <td style={td}>{v.facturaEmisor||"—"}</td>
                  <td style={td}>{v.remision||"—"}</td>
                  <td style={td}>{fmtDate(v.fechaFactura)||"—"}</td>
                  <td style={td}>{(()=>{const ef=estatusFactura(v);return <span style={{...badge(ef.color),fontSize:10}}>{ef.label}</span>;})()}</td>
                  <td style={td}><span style={v.estatusPago!=="pagado"&&v.fechaFactura?{color:C.red,fontWeight:700}:{}}>{diasPendiente(v)}</span></td>
                  <td style={td}>
                    <div style={{display:"flex",gap:3}}>
                      <button style={{...btn(C.blue),padding:"4px 9px",fontSize:11}} onClick={()=>{setEditing(v.itemId);setForm({...v});}}>✎</button>
                      {v.estatusFactura!=="cancelada"&&<button style={{...btn(C.red),padding:"4px 9px",fontSize:11}} onClick={()=>{ if(window.confirm("¿Cancelar esta venta?")) { setVentas(vs=>vs.map(x=>x.itemId===v.itemId?{...x,estatusFactura:"cancelada"}:x)); logBit("Canceló venta",`#${v.pedidoId} · ${v.cliente} · ${fmt(v.total)}`); } }}>✕</button>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {editing&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:560}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
              <h3 style={{margin:0,color:C.green}}>✏️ Editar Venta</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setEditing(null)}>×</button>
            </div>
            {/* Info de la venta */}
            <div style={{background:C.bg,borderRadius:8,padding:"8px 12px",marginBottom:14,fontSize:12,color:C.muted}}>
              <strong style={{color:C.text}}>{form.cliente}</strong> · {form.producto} {form.calibre} · #{form.pedidoId}
            </div>
            <div style={g2}>
              {/* ── Cantidades ── */}
              <div>
                <label style={lbl}>KG reales</label>
                <input type="number" inputMode="decimal" style={inp}
                  value={form.cantidad||""}
                  onChange={e=>sf("cantidad",e.target.value)}/>
              </div>
              <div>
                <label style={lbl}>Precio $/kg</label>
                <input type="number" inputMode="decimal" style={inp}
                  value={form.precio||""}
                  onChange={e=>sf("precio",e.target.value)}/>
              </div>
              {/* Total calculado */}
              <div style={{gridColumn:"1/-1",background:C.greenL,borderRadius:8,padding:"8px 14px",display:"flex",justifyContent:"space-between",alignItems:"center",border:`1px solid ${C.greenM}`}}>
                <span style={{color:C.muted,fontSize:12}}>Total actualizado</span>
                <strong style={{color:C.green,fontSize:16}}>{fmt((parseFloat(form.cantidad)||0)*(parseFloat(form.precio)||0))}</strong>
              </div>
              {/* ── Fecha venta ── */}
              <div>
                <label style={lbl}>Fecha de venta</label>
                <input type="date" style={inp} value={form.fecha||""} onChange={e=>sf("fecha",e.target.value)}/>
              </div>
              {/* ── Calibre ── */}
              <div>
                <label style={lbl}>Calibre</label>
                <input style={inp} placeholder="Calibre" value={form.calibre||""} onChange={e=>sf("calibre",e.target.value)}/>
              </div>
              {/* ── Pago ── */}
              <div>
                <label style={lbl}>Estatus pago</label>
                <select style={sel} value={form.estatusPago||"pendiente"} onChange={e=>sf("estatusPago",e.target.value)}>
                  <option value="pendiente">⏳ Pendiente</option>
                  <option value="pagado">✅ Pagado</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Tipo de pago</label>
                <select style={sel} value={form.tipoPago||""} onChange={e=>sf("tipoPago",e.target.value)}>
                  {["Efectivo","Transferencia Frasavo","Transferencia SAJI"].map(t=><option key={t}>{t}</option>)}
                </select>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={lbl}>Fecha de pago</label>
                <div style={{display:"flex",gap:4}}>
                  <input type="date" style={{...inp,flex:1}} value={form.fechaPago||""} onChange={e=>sf("fechaPago",e.target.value)}/>
                  {form.fechaPago&&<button style={{...btnO(C.red),padding:"8px 12px"}} title="Borrar fecha" onClick={()=>sf("fechaPago","")}>✕</button>}
                </div>
              </div>
              {/* ── Factura ── */}
              <div>
                <label style={lbl}>Estatus factura</label>
                <select style={sel} value={form.estatusFactura||"no_aplica"} onChange={e=>sf("estatusFactura",e.target.value)}>
                  <option value="no_aplica">— No aplica</option>
                  <option value="pendiente_factura">⏳ Pendiente de facturar</option>
                  <option value="factura_realizada">✅ Factura realizada</option>
                </select>
              </div>
              <div>
                <label style={lbl}>Factura #</label>
                <input style={inp} placeholder="Número de factura"
                  value={form.factura||""}
                  onChange={e=>{ sf("factura",e.target.value); sf("estatusFactura", e.target.value.trim() ? "factura_realizada" : "pendiente_factura"); }}/>
              </div>
              <div>
                <label style={lbl}>Emisor factura</label>
                <select style={sel} value={form.facturaEmisor||""} onChange={e=>sf("facturaEmisor",e.target.value)}>
                  <option value="">— Seleccionar —</option>
                  {["SAJI","FRASAVO","DAVID","OTRO"].map(em=><option key={em}>{em}</option>)}
                </select>
              </div>
              <div>
                <label style={lbl}>Remisión</label>
                <input style={inp} placeholder="Número de remisión" value={form.remision||""} onChange={e=>sf("remision",e.target.value)}/>
              </div>
              <div style={{gridColumn:"1/-1"}}>
                <label style={lbl}>Fecha de factura</label>
                <div style={{display:"flex",gap:4}}>
                  <input type="date" style={{...inp,flex:1}} value={form.fechaFactura||""} onChange={e=>sf("fechaFactura",e.target.value)}/>
                  {form.fechaFactura&&<button style={{...btnO(C.red),padding:"8px 12px"}} title="Borrar fecha" onClick={()=>sf("fechaFactura","")}>✕</button>}
                </div>
              </div>
            </div>
            {/* Botones */}
            <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"flex-end",flexWrap:"wrap"}}>
              <button style={{...btnO(C.red),color:C.red}} onClick={()=>{
                if(window.confirm("¿Está seguro de eliminar esta venta? Esta acción no se puede deshacer.")) {
                  setVentas(vs=>vs.filter(v=>v.itemId!==editing));
                  logBit("Eliminó venta",`#${form.pedidoId} · ${form.cliente} · ${fmt((parseFloat(form.cantidad)||0)*(parseFloat(form.precio)||0))}`);
                  setEditing(null);
                }
              }}>🗑️ Eliminar</button>
              <button style={btnO()} onClick={()=>setEditing(null)}>Cancelar</button>
              <button style={btn()} onClick={()=>{
                const cant = parseFloat(String(form.cantidad).replace(",","."))||0;
                const prec = parseFloat(String(form.precio).replace(",","."))||0;
                const itemId = editing;
                setVentas(vs=>vs.map(v=>v.itemId===itemId ? {
                  ...form,
                  cantidad:cant, precio:prec, total:cant*prec,
                } : v));
                logBit("Editó venta",`#${form.pedidoId} · ${form.cliente} · ${fmt(cant*prec)}`);
                setEditing(null);
              }}>💾 Guardar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// GASTOS
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
            <thead><tr>{["Sem","Día","Mes","Fecha","Descripción","Tipo Gasto","Método Pago","Estatus","Total",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.length===0&&<tr><td colSpan={10} style={{...td,textAlign:"center",color:C.muted,padding:28}}>Sin gastos en este período 💸</td></tr>}
              {lista.map(g=>(
                <tr key={g.id}>
                  <td style={td}>{g.semana}</td><td style={td}>{g.dia}</td><td style={td}>{g.mes}</td>
                  <td style={td}>{fmtDate(g.fecha)}</td>
                  <td style={{...td,fontWeight:600}}>{g.gasto}</td>
                  <td style={td}><span style={badge(C.amber,C.amberL)}>{g.tipoGasto}</span></td>
                  <td style={{...td,fontSize:12}}>{g.metodoPago}</td>
                  <td style={td}><span style={badge(g.estatusPago==="pagado"?C.green:C.amber)}>{g.estatusPago==="pagado"?"✅ Pagado":"⏳ Por pagar"}</span></td>
                  <td style={td}><strong style={{color:C.red}}>{fmt(g.monto)}</strong></td>
                  <td style={td}>
                    <div style={{display:"flex",gap:4}}>
                      <button style={{...btn(C.blue),padding:"4px 9px",fontSize:11}} onClick={()=>openEdit(g)}>✎</button>
                      <button style={{...btn(C.red),padding:"4px 9px",fontSize:11}} onClick={()=>setGastos(gs=>gs.filter(x=>x.id!==g.id))}>✕</button>
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
                <div style={{gridColumn:"1/-1"}}><label style={lbl}>Estatus del pago</label>
                  <select style={sel} value={form.estatusPago} onChange={e=>sf("estatusPago",e.target.value)}>
                    <option value="pagado">✅ Pagado</option><option value="porpagar">⏳ Por pagar</option>
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
                const reg = { id:editId||Date.now(), semana:weekOf(form.fecha), dia:dayOf(form.fecha), mes:monthOf(form.fecha), ...form, gasto:finalGasto, monto:parseFloat(form.monto) };
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
// PAGOS RECIBIDOS — con abonos parciales
// ════════════════════════════════════════════════════════════════════════════════
function Pagos({ pagos, setPagos, ventas, setVentas, logBit }) {
  const [show,      setShow]      = useState(false);
  const [detalle,   setDetalle]   = useState(null); // pedidoId con detalle abierto
  const [filt,      setFilt]      = useState({tipo:"todo",valor:""});
  const [form,      setForm]      = useState({ fecha:todayStr(), tipoPago:"Efectivo", pedidoId:"", monto:"" });
  const sf = (k,v) => setForm(f=>({...f,[k]:v}));

  // Todos los pedidos que tienen ventas (completados)
  const pedidosConVentas = [...new Map(ventas.map(v=>[v.pedidoId,v])).values()];

  // Para un pedido dado: total facturado, total abonado, saldo
  const getResumen = pedidoId => {
    const totalPedido  = ventas.filter(v=>v.pedidoId===pedidoId).reduce((s,v)=>s+v.total,0);
    const totalAbonado = pagos.filter(p=>p.pedidoId===pedidoId).reduce((s,p)=>s+p.monto,0);
    const saldo        = totalPedido - totalAbonado;
    return { totalPedido, totalAbonado, saldo };
  };

  // Solo pedidos con saldo > 0 para el selector
  const pedidosPendientes = pedidosConVentas.filter(v=>getResumen(v.pedidoId).saldo>0.01);

  const guardar = () => {
    if(!form.pedidoId) return alert("Selecciona un pedido");
    const monto = parseFloat(form.monto||0);
    if(monto<=0) return alert("El monto debe ser mayor a 0");
    const { saldo } = getResumen(form.pedidoId);
    if(monto > saldo + 0.01) return alert(`El abono ($${monto}) no puede superar el saldo pendiente (${fmt(saldo)})`);
    const cli = ventas.find(v=>v.pedidoId===form.pedidoId)?.cliente||"";
    const nuevoPago = {
      id:Date.now(), semana:weekOf(form.fecha), dia:dayOf(form.fecha),
      mes:monthOf(form.fecha), fecha:form.fecha, cliente:cli,
      tipoPago:form.tipoPago, pedidoId:form.pedidoId, monto,
      esAbono: monto < getResumen(form.pedidoId).totalPedido - 0.01,
    };
    setPagos(ps=>[nuevoPago,...ps]);
    logBit("Registró abono",`#${form.pedidoId} · ${cli} · ${fmt(monto)} · ${form.tipoPago}`);
    // Si el abono liquida el saldo, marcar ventas como pagadas
    const nuevoTotal = pagos.filter(p=>p.pedidoId===form.pedidoId).reduce((s,p)=>s+p.monto,0) + monto;
    const totalPed   = getResumen(form.pedidoId).totalPedido;
    if(nuevoTotal >= totalPed - 0.01) {
      setVentas(vs=>vs.map(v=>v.pedidoId===form.pedidoId?{...v,estatusPago:"pagado",fechaPago:form.fecha,tipoPago:form.tipoPago}:v));
    }
    setForm({fecha:todayStr(),tipoPago:"Efectivo",pedidoId:"",monto:""});
    setShow(false);
  };

  const cols=[
    {l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},
    {l:"Cliente",k:"cliente"},{l:"Tipo Pago",k:"tipoPago"},{l:"#Pedido",k:"pedidoId"},{l:"Abono",k:"monto"}
  ];
  const lista       = applyFilter(pagos, filt).slice().sort((a,b)=>(b.fecha||"").localeCompare(a.fecha||""));
  const totalAbonado= lista.reduce((s,p)=>s+p.monto,0);

  // Agrupar por pedido para la vista de saldos
  const pedidosUnicos = [...new Map(ventas.map(v=>[v.pedidoId,v])).values()]
    .map(v=>({ pedidoId:v.pedidoId, cliente:v.cliente, ...getResumen(v.pedidoId) }))
    .filter(x=>x.totalPedido>0)
    .sort((a,b)=>b.saldo-a.saldo);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",flexWrap:"wrap",gap:8,marginBottom:12}}>
        <div>
          <h2 style={{...h2s,margin:0}}>🧾 Pagos y Abonos</h2>
          <div style={{color:C.muted,fontSize:12,marginTop:2}}>{lista.length} pagos · Total cobrado: <strong style={{color:C.green}}>{fmt(totalAbonado)}</strong></div>
        </div>
        <div style={{display:"flex",gap:7}}>
          <button style={btn(C.blue)} onClick={()=>exportCSV(lista,cols,`pagos-${todayStr()}.csv`)}>⬇ CSV</button>
          <button style={btn()} onClick={()=>setShow(true)}>+ Registrar Abono</button>
        </div>
      </div>

      {/* Saldo por pedido */}
      <div style={card}>
        <div style={{fontWeight:800,fontSize:13,marginBottom:12}}>📋 Saldo por Pedido</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",fontSize:13}}>
            <thead>
              <tr>{["#Pedido","Cliente","Total pedido","Total abonado","Saldo pendiente","Estado",""].map(h=>(
                <th key={h} style={th}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {pedidosUnicos.length===0&&<tr><td colSpan={7} style={{...td,textAlign:"center",color:C.muted,padding:24}}>Sin ventas registradas aún</td></tr>}
              {pedidosUnicos.map(p=>{
                const abonosPed = pagos.filter(x=>x.pedidoId===p.pedidoId);
                const pct = p.totalPedido>0 ? Math.min(100,Math.round(p.totalAbonado/p.totalPedido*100)) : 0;
                return (
                  <>
                    <tr key={p.pedidoId} style={{background:p.saldo<=0?"#f0fff4":"#fff"}}>
                      <td style={{...td,fontWeight:700,color:C.green}}>#{p.pedidoId}</td>
                      <td style={{...td,fontWeight:700}}>{p.cliente}</td>
                      <td style={td}>{fmt(p.totalPedido)}</td>
                      <td style={td}>
                        <div style={{display:"flex",alignItems:"center",gap:8}}>
                          <span style={{color:C.green,fontWeight:600}}>{fmt(p.totalAbonado)}</span>
                          {/* Progress bar */}
                          <div style={{flex:1,minWidth:60,height:6,background:C.border,borderRadius:3,overflow:"hidden"}}>
                            <div style={{width:`${pct}%`,height:"100%",background:pct>=100?C.green:C.amber,borderRadius:3,transition:"width .3s"}}/>
                          </div>
                          <span style={{fontSize:11,color:C.muted,minWidth:30}}>{pct}%</span>
                        </div>
                      </td>
                      <td style={td}>
                        <strong style={{color:p.saldo>0?C.red:C.green,fontSize:14}}>
                          {p.saldo>0?fmt(p.saldo):"✅ Liquidado"}
                        </strong>
                      </td>
                      <td style={td}>
                        <span style={badge(p.saldo<=0?C.green:p.totalAbonado>0?C.amber:C.red)}>
                          {p.saldo<=0?"✅ Pagado":p.totalAbonado>0?"⏳ Parcial":"🔴 Sin pago"}
                        </span>
                      </td>
                      <td style={td}>
                        <div style={{display:"flex",gap:5}}>
                          {p.saldo>0&&(
                            <button style={{...btn(C.green),padding:"4px 10px",fontSize:11}}
                              onClick={()=>{setForm({fecha:todayStr(),tipoPago:"Efectivo",pedidoId:p.pedidoId,monto:String(p.saldo.toFixed(2))});setShow(true);}}>
                              + Abonar
                            </button>
                          )}
                          <button style={{...btnO(C.blue),padding:"4px 10px",fontSize:11,color:C.blue}}
                            onClick={()=>setDetalle(detalle===p.pedidoId?null:p.pedidoId)}>
                            {detalle===p.pedidoId?"▲ Ocultar":`▼ Abonos (${abonosPed.length})`}
                          </button>
                        </div>
                      </td>
                    </tr>
                    {/* Abonos detalle */}
                    {detalle===p.pedidoId&&abonosPed.map((ab,i)=>(
                      <tr key={ab.id} style={{background:"#f0fff4"}}>
                        <td style={{...td,paddingLeft:24,fontSize:12,color:C.muted}} colSpan={2}>
                          └ Abono {i+1} · {fmtDate(ab.fecha)}
                        </td>
                        <td style={{...td,fontSize:12}} colSpan={2}>{ab.tipoPago}</td>
                        <td style={{...td,color:C.green,fontWeight:700,fontSize:13}} colSpan={2}>{fmt(ab.monto)}</td>
                        <td style={td}>
                          <button style={{...btn(C.red),padding:"3px 8px",fontSize:11}}
                            onClick={()=>{
                              setPagos(ps=>ps.filter(x=>x.id!==ab.id));
                              // Si quitamos un pago, revisar si la venta debe volver a pendiente
                              const restante = pagos.filter(x=>x.id!==ab.id&&x.pedidoId===p.pedidoId).reduce((s,x)=>s+x.monto,0);
                              if(restante < p.totalPedido - 0.01) {
                                setVentas(vs=>vs.map(v=>v.pedidoId===p.pedidoId?{...v,estatusPago:"pendiente"}:v));
                              }
                            }}>✕</button>
                        </td>
                      </tr>
                    ))}
                    {detalle===p.pedidoId&&abonosPed.length===0&&(
                      <tr style={{background:"#f9fcfa"}}>
                        <td colSpan={7} style={{...td,paddingLeft:24,color:C.muted,fontSize:12}}>Sin abonos registrados aún</td>
                      </tr>
                    )}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Historial de abonos */}
      <FilterBar filter={filt} setFilter={setFilt} count={lista.length}/>
      <div style={card}>
        <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>💳 Historial de Abonos</div>
        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse"}}>
            <thead><tr>{["Sem","Día","Mes","Fecha","Cliente","Tipo Pago","#Pedido","Abono",""].map(h=><th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {lista.length===0&&<tr><td colSpan={9} style={{...td,textAlign:"center",color:C.muted,padding:24}}>Sin abonos en este período</td></tr>}
              {lista.map(p=>(
                <tr key={p.id}>
                  <td style={td}>{p.semana}</td><td style={td}>{p.dia}</td>
                  <td style={td}>{p.mes}</td><td style={td}>{fmtDate(p.fecha)}</td>
                  <td style={{...td,fontWeight:600}}>{p.cliente}</td>
                  <td style={td}>{p.tipoPago}</td>
                  <td style={td}><span style={{fontWeight:700,color:C.green}}>#{p.pedidoId}</span></td>
                  <td style={td}><strong style={{color:C.green}}>{fmt(p.monto)}</strong></td>
                  <td style={td}><button style={{...btn(C.red),padding:"4px 9px",fontSize:11}} onClick={()=>setPagos(ps=>ps.filter(x=>x.id!==p.id))}>✕</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal registrar abono */}
      {show&&(
        <div style={modal}>
          <div style={{...mbox,maxWidth:480}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:16}}>
              <h3 style={{margin:0,color:C.green}}>💳 Registrar Abono</h3>
              <button style={{background:"none",border:"none",color:C.muted,cursor:"pointer",fontSize:26,lineHeight:1}} onClick={()=>setShow(false)}>×</button>
            </div>
            {pedidosPendientes.length===0
              ? <p style={{color:C.muted,textAlign:"center",padding:20}}>🎉 Todos los pedidos están liquidados</p>
              : (
                <div style={{display:"flex",flexDirection:"column",gap:10}}>
                  <div><label style={lbl}>#Pedido a abonar</label>
                    <select style={sel} value={form.pedidoId} onChange={e=>{
                      sf("pedidoId",e.target.value);
                      if(e.target.value) sf("monto", String(getResumen(e.target.value).saldo.toFixed(2)));
                    }}>
                      <option value="">— Seleccionar —</option>
                      {pedidosPendientes.map(v=>{
                        const r=getResumen(v.pedidoId);
                        return <option key={v.pedidoId} value={v.pedidoId}>#{v.pedidoId} — {v.cliente} — Saldo: {fmt(r.saldo)}</option>;
                      })}
                    </select>
                  </div>

                  {/* Saldo info */}
                  {form.pedidoId&&(()=>{
                    const r=getResumen(form.pedidoId);
                    return (
                      <div style={{background:C.bg,borderRadius:9,padding:"12px 14px",border:`1px solid ${C.border}`}}>
                        <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,textAlign:"center"}}>
                          {[
                            {l:"Total pedido",v:fmt(r.totalPedido),c:C.text},
                            {l:"Ya abonado",v:fmt(r.totalAbonado),c:C.green},
                            {l:"Saldo pendiente",v:fmt(r.saldo),c:C.red},
                          ].map(x=>(
                            <div key={x.l}>
                              <div style={{fontSize:10,color:C.muted,marginBottom:2}}>{x.l}</div>
                              <div style={{fontWeight:800,fontSize:14,color:x.c}}>{x.v}</div>
                            </div>
                          ))}
                        </div>
                        {/* Progress */}
                        <div style={{marginTop:10,height:8,background:C.border,borderRadius:4,overflow:"hidden"}}>
                          <div style={{width:`${Math.min(100,Math.round(r.totalAbonado/r.totalPedido*100))}%`,height:"100%",background:C.amber,borderRadius:4}}/>
                        </div>
                      </div>
                    );
                  })()}

                  <div style={g2}>
                    <div><label style={lbl}>Monto del abono *</label>
                      <input type="number" inputMode="decimal" style={inp} placeholder="0.00" value={form.monto} onChange={e=>sf("monto",e.target.value)}/>
                      {form.pedidoId&&(
                        <button style={{...btnO(C.green),padding:"4px 10px",fontSize:11,marginTop:5,color:C.green}}
                          onClick={()=>sf("monto",String(getResumen(form.pedidoId).saldo.toFixed(2)))}>
                          Liquidar todo ({fmt(getResumen(form.pedidoId).saldo)})
                        </button>
                      )}
                    </div>
                    <div><label style={lbl}>Tipo de pago</label>
                      <select style={sel} value={form.tipoPago} onChange={e=>sf("tipoPago",e.target.value)}>
                        {["efectivo","transferencia","tarjeta"].map(t=><option key={t}>{t}</option>)}
                      </select>
                    </div>
                    <div style={{gridColumn:"1/-1"}}><label style={lbl}>Fecha del abono</label>
                      <input type="date" style={inp} value={form.fecha} onChange={e=>sf("fecha",e.target.value)}/>
                    </div>
                  </div>
                </div>
              )
            }
            <div style={{display:"flex",gap:8,marginTop:18,justifyContent:"flex-end"}}>
              <button style={btnO()} onClick={()=>setShow(false)}>Cancelar</button>
              {pedidosPendientes.length>0&&<button style={btn()} onClick={guardar}>✅ Registrar Abono</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════════
// FRUTA (Compras de inventario + pagos a proveedores)
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
          <h2 style={{...h2s,margin:0}}>🥑 Fruta — Compras e Inventario</h2>
          <div style={{display:"flex",gap:16,flexWrap:"wrap",marginTop:4}}>
            <div style={{color:C.muted,fontSize:12}}>Total comprado: <strong style={{color:C.teal}}>{fmt(compras.reduce((s,c)=>s+c.total,0))}</strong></div>
            <div style={{color:C.muted,fontSize:12}}>Por pagar: <strong style={{color:(()=>{const totalC=compras.reduce((s,c)=>s+c.total,0); const totalP=pagosF.reduce((s,p)=>s+p.monto,0); return (totalC-totalP)>0?C.red:C.green;})()}}>{fmt(Math.max(0,compras.reduce((s,c)=>s+c.total,0)-pagosF.reduce((s,p)=>s+p.monto,0)))}</strong></div>
          </div>
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
                    <>
                      <tr key={prov} style={{background:C.bg}}>
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
                      {activeProv===prov&&pagosProv.map(pg=>(
                        <tr key={pg.id} style={{background:"#f0fff4"}}>
                          <td style={{...td,paddingLeft:20,color:C.muted,fontSize:11}} colSpan={1}>└ {fmtDate(pg.fecha)}</td>
                          <td style={{...td,fontSize:11}} colSpan={2}>{pg.metodoPago}</td>
                          <td style={{...td,color:C.green,fontWeight:600,fontSize:12}}>{fmt(pg.monto)}</td>
                          <td style={td}><button style={{...btn(C.red),padding:"3px 7px",fontSize:11}} onClick={()=>setFruta(fs=>fs.filter(x=>x.id!==pg.id))}>✕</button></td>
                        </tr>
                      ))}
                    </>
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
                <input style={inp} list="provs-list" placeholder="Nombre proveedor" value={form.proveedor} onChange={e=>sf("proveedor",e.target.value)}/>
                <datalist id="provs-list">{allProveedores.map(p=><option key={p} value={p}/>)}</datalist>
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
// APP ROOT — Dark mode + sidebar + Excel import
// ════════════════════════════════════════════════════════════════════════════════
const INIT_CLI  = ["La Hortaliza","Fishers","Taquitos","Panadería"];
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
const USUARIOS = [
  { user:"Irving", pass:"1111$" },
  { user:"Jasso",  pass:"1956$" },
];

// ─── Login Screen ─────────────────────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [user, setUser]   = useState("");
  const [pass, setPass]   = useState("");
  const [error, setError] = useState("");
  const [show, setShow]   = useState(false);

  const login = () => {
    const found = USUARIOS.find(u => u.user.toLowerCase()===user.trim().toLowerCase() && u.pass===pass);
    if(found) { onLogin(found.user); }
    else { setError("Usuario o contraseña incorrectos"); }
  };

  return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div style={{background:C.card,border:`1px solid ${C.border}`,borderRadius:16,padding:32,width:"100%",maxWidth:360,boxShadow:C.shadowMd}}>
        <div style={{textAlign:"center",marginBottom:24}}>
          <SAJILogo s={64}/>
          <div style={{fontWeight:800,fontSize:20,color:C.green,marginTop:12}}>SAJI Group</div>
          <div style={{color:C.muted,fontSize:13,marginTop:4}}>Sistema de Gestión Comercial</div>
        </div>
        <div style={{marginBottom:14}}>
          <label style={lbl}>Usuario</label>
          <input style={inp} placeholder="Tu nombre de usuario" value={user}
            onChange={e=>{setUser(e.target.value);setError("");}}
            onKeyDown={e=>e.key==="Enter"&&login()}/>
        </div>
        <div style={{marginBottom:20}}>
          <label style={lbl}>Contraseña</label>
          <div style={{position:"relative"}}>
            <input style={{...inp,paddingRight:40}} type={show?"text":"password"}
              placeholder="Tu contraseña" value={pass}
              onChange={e=>{setPass(e.target.value);setError("");}}
              onKeyDown={e=>e.key==="Enter"&&login()}/>
            <button onClick={()=>setShow(s=>!s)} style={{position:"absolute",right:10,top:"50%",transform:"translateY(-50%)",background:"none",border:"none",cursor:"pointer",color:C.muted,fontSize:16}}>
              {show?"🙈":"👁️"}
            </button>
          </div>
        </div>
        {error&&<div style={{background:C.redL,border:`1px solid ${C.red}33`,borderRadius:8,padding:"8px 12px",color:C.red,fontSize:12,marginBottom:14,textAlign:"center"}}>{error}</div>}
        <button style={{...btn(),width:"100%",padding:"11px 0",fontSize:15}} onClick={login}>
          Entrar →
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const [tab,        setTab]        = useState("dashboard");
  const [showImport, setShowImport] = useState(false);
  const [usuario,    setUsuario]    = useState(() => sessionStorage.getItem("saji_user")||"");

  const [pedidos,    setPedidos,    loadedPed]  = useSupabase("pedidos",    []);
  const [ventas,     setVentas,     loadedVen]  = useSupabase("ventas",     []);
  const [gastos,     setGastos,     loadedGas]  = useSupabase("gastos",     []);
  const [pagos,      setPagos,      loadedPag]  = useSupabase("pagos",      []);
  const [fruta,      setFruta,      loadedFru]  = useSupabase("fruta",      []);
  const [clientes,   setClientes,   loadedCli]  = useSupabase("catalogos_clientes",   INIT_CLI);
  const [productos,  setProductos,  loadedPro]  = useSupabase("catalogos_productos",  INIT_PROD);
  const [proveedores,setProveedores,loadedProv] = useSupabase("catalogos_proveedores",["Frasavo","Mosco"]);
  const [bitacora,   setBitacora,   loadedBit]  = useSupabase("bitacora", []);

  const todoCargado = loadedPed && loadedVen && loadedGas && loadedPag && loadedFru && loadedCli && loadedPro && loadedProv && loadedBit;

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
      { name:"Ventas",   rows:toRows(ventas,  [{l:"#Pedido",k:"pedidoId"},{l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},{l:"Cliente",k:"cliente"},{l:"Producto",k:"producto"},{l:"Calibre",k:"calibre"},{l:"KG",k:"cantidad"},{l:"Precio",k:"precio"},{l:"Total",k:"total"},{l:"Estatus Pago",k:"estatusPago"},{l:"Tipo Pago",k:"tipoPago"},{l:"Fecha Pago",k:"fechaPago"},{l:"Factura",k:"factura"},{l:"Emisor",k:"facturaEmisor"},{l:"Remision",k:"remision"},{l:"Fecha Factura",k:"fechaFactura"}]) },
      { name:"Gastos",   rows:toRows(gastos,  [{l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},{l:"Descripcion",k:"gasto"},{l:"Tipo Gasto",k:"tipoGasto"},{l:"Metodo Pago",k:"metodoPago"},{l:"Estatus",k:"estatusPago"},{l:"Monto",k:"monto"}]) },
      { name:"Pagos",    rows:toRows(pagos,   [{l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},{l:"Cliente",k:"cliente"},{l:"Tipo Pago",k:"tipoPago"},{l:"#Pedido",k:"pedidoId"},{l:"Monto",k:"monto"}]) },
      { name:"Fruta",    rows:toRows(fruta.filter(f=>!f.tipo), [{l:"Semana",k:"semana"},{l:"Dia",k:"dia"},{l:"Mes",k:"mes"},{l:"Fecha",k:"fecha"},{l:"Proveedor",k:"proveedor"},{l:"Producto",k:"producto"},{l:"Calibre",k:"calibre"},{l:"KG",k:"cantidad"},{l:"Precio",k:"precio"},{l:"Total",k:"total"},{l:"Factura",k:"factura"},{l:"Fecha Factura",k:"fechaFactura"},{l:"Metodo Pago",k:"metodoPago"},{l:"Estatus",k:"estatusPago"}]) },
      { name:"Pedidos",  rows:toRows(pedidos, [{l:"#Pedido",k:"id"},{l:"Fecha",k:"fecha"},{l:"Cliente",k:"cliente"},{l:"Fecha Entrega",k:"fechaEntrega"},{l:"Total",k:"total"},{l:"Estatus",k:"estatus"},{l:"Tipo Pago",k:"tipoPago"},{l:"Factura",k:"factura"}]) },
      { name:"Bitacora", rows:toRows(bitacora,[{l:"Fecha",k:"fecha"},{l:"Hora",k:"hora"},{l:"Usuario",k:"usuario"},{l:"Accion",k:"accion"},{l:"Detalle",k:"detalle"}]) },
    ];
    sheets.forEach(s=>{ const ws=X.utils.aoa_to_sheet(s.rows); X.utils.book_append_sheet(wb,ws,s.name); });
    X.writeFile(wb, `SAJI-Group-${todayStr()}.xlsx`);
  };

  const handleLogin = (nombre) => {
    sessionStorage.setItem("saji_user", nombre);
    setUsuario(nombre);
  };

  const handleLogout = () => {
    sessionStorage.removeItem("saji_user");
    setUsuario("");
  };

  // Mostrar login si no hay sesión
  if(!usuario) return <LoginScreen onLogin={handleLogin}/>;

  const TABS = [
    { id:"dashboard", label:"🏠 Inicio"    },
    { id:"pedidos",   label:"📦 Pedidos"   },
    { id:"ventas",    label:"💰 Ventas"    },
    { id:"gastos",    label:"💸 Gastos"    },
    { id:"pagos",     label:"🧾 Pagos"     },
    { id:"fruta",     label:"🥑 Fruta"     },
    { id:"catalogos", label:"🗂️ Catálogos" },
    { id:"bitacora",  label:"📋 Bitácora"  },
  ];

  // Pantalla de carga mientras conecta con Supabase
  if(!todoCargado) return (
    <div style={{minHeight:"100vh",background:C.bg,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
      <SAJILogo s={64}/>
      <div style={{fontWeight:800,fontSize:18,color:C.green}}>SAJI Group</div>
      <div style={{color:C.muted,fontSize:13}}>Conectando con la base de datos…</div>
      <div style={{width:180,height:4,background:C.border,borderRadius:2,overflow:"hidden",marginTop:8}}>
        <div style={{height:"100%",background:C.green,borderRadius:2,animation:"loading 1.5s ease-in-out infinite",width:"60%"}}/>
      </div>
      <style>{`
  @keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(300%)}}
  @media(min-width:600px){.kpi-grid{grid-template-columns:repeat(5,1fr)!important}}
  @media(max-width:599px){
    .kpi-grid{grid-template-columns:repeat(2,1fr)!important}
  }
`}</style>
    </div>
  );

  return (
    <div style={{ minHeight:"100vh", background:C.bg, color:C.text, fontFamily:"'Segoe UI',system-ui,sans-serif", fontSize:14, WebkitTextSizeAdjust:"100%" }}>
      <header style={{ background:C.card, borderBottom:`1px solid ${C.border}`, padding:"6px 12px", display:"flex", alignItems:"center", gap:10, minHeight:58, position:"sticky", top:0, zIndex:100, boxShadow:C.shadow, flexWrap:"wrap", overflow:"hidden" }}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexShrink:0,minWidth:0}}>
          <button onClick={()=>window.location.reload()} style={{background:"none",border:"none",padding:0,cursor:"pointer",display:"flex",alignItems:"center"}} title="Actualizar">
            <SAJILogo s={34}/>
          </button>
          <div style={{lineHeight:1.15,minWidth:0}}>
            <div style={{fontWeight:800,fontSize:13,color:C.green,whiteSpace:"nowrap"}}>SAJI Group</div>
            <div style={{fontSize:9,color:C.muted,whiteSpace:"nowrap"}}>Gestión Comercial</div>
          </div>
        </div>
        <nav style={{ display:"flex", gap:3, marginLeft:"auto", flexWrap:"wrap", justifyContent:"flex-end", alignItems:"center", flex:"1 1 auto", minWidth:0 }}>
          {TABS.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              background:tab===t.id?C.green:"transparent",
              color:tab===t.id?"#fff":C.muted,
              border:tab===t.id?"none":`1px solid ${C.border}`,
              borderRadius:7, padding:"5px 9px", cursor:"pointer",
              fontWeight:tab===t.id?700:500, fontSize:11,
              whiteSpace:"nowrap", transition:"all .15s"
            }}>{t.label}</button>
          ))}
          <button onClick={()=>setShowImport(true)} style={{...btnO(C.blue),padding:"5px 10px",fontSize:11,marginLeft:4}}>📥 Importar</button>
          <button onClick={exportExcel} style={{...btn(C.green),padding:"5px 10px",fontSize:11}}>📤 Exportar</button>
          <div style={{display:"flex",alignItems:"center",gap:6,marginLeft:6,paddingLeft:8,borderLeft:`1px solid ${C.border}`}}>
            <span style={{fontSize:11,color:C.muted}}>👤 {usuario}</span>
            <button onClick={handleLogout} style={{...btnO(C.red),padding:"4px 8px",fontSize:11,color:C.red}}>
              Salir
            </button>
          </div>
        </nav>
      </header>

      <main style={{ padding:16, maxWidth:1500, margin:"0 auto" }}>
        {tab==="dashboard" && <Dashboard pedidos={pedidos} ventas={ventas} gastos={gastos} fruta={fruta.filter(f=>!f.tipo)} pagos={pagos}/>}
        {tab==="pedidos"   && <Pedidos   pedidos={pedidos} setPedidos={setPedidos} setVentas={setVentas} clientes={clientes} productos={productos} logBit={logBit}/>}
        {tab==="ventas"    && <Ventas    ventas={ventas} setVentas={setVentas} logBit={logBit}/>}
        {tab==="gastos"    && <Gastos    gastos={gastos} setGastos={setGastos} logBit={logBit}/>}
        {tab==="pagos"     && <Pagos     pagos={pagos} setPagos={setPagos} ventas={ventas} setVentas={setVentas} logBit={logBit}/>}
        {tab==="fruta"     && <Fruta     fruta={fruta} setFruta={setFruta} productos={productos} proveedores={proveedores} logBit={logBit}/>}
        {tab==="bitacora"  && <Bitacora  bitacora={bitacora} setBitacora={setBitacora}/>}
        {tab==="catalogos" && <Catalogos clientes={clientes} setClientes={setClientes} productos={productos} setProductos={setProductos} proveedores={proveedores} setProveedores={setProveedores}/>}
      </main>

      {showImport&&<ImportModal onClose={()=>setShowImport(false)} setPedidos={setPedidos} setVentas={setVentas} setGastos={setGastos} setFruta={setFruta} setPagos={setPagos}/>}
    </div>
  );
}
